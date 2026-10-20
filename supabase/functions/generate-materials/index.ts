// supabase/functions/generate-materials/index.ts
//
// Takes a lecture_id (already transcribed), sends the transcript to Gemini,
// and asks it to split the lecture into topics with summaries, revision
// notes, flashcards, and exam questions — all as structured JSON that we
// insert straight into Postgres.
//
// Deploy: supabase functions deploy generate-materials
// Secrets needed: GEMINI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const GEMINI_MODEL = "gemini-3.1-flash-lite";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert study assistant that turns raw lecture transcripts into structured study material for students.

You will receive a transcript as a JSON array of {text, start_sec, end_sec} segments.

Return ONLY valid JSON (no markdown fences, no preamble) matching this exact shape:

{
  "topics": [
    {
      "title": "string, short topic name",
      "start_sec": number,
      "end_sec": number,
      "summary": "2-4 sentence summary of this topic",
      "revision_note": "markdown-formatted detailed notes, use headers/bullets",
      "flashcards": [ { "question": "string", "answer": "string" } ],
      "exam_questions": [ { "question": "string", "answer": "string", "difficulty": "easy|medium|hard" } ]
    }
  ]
}

Rules:
- Split the lecture into 3-8 topics based on actual subject shifts, not fixed time intervals.
- Each topic needs 3-6 flashcards and 2-4 exam questions of mixed difficulty.
- Keep flashcard questions short and answers concise (1-3 sentences).
- Base start_sec/end_sec on the actual transcript segment timestamps provided.
- Write in the same language as the transcript.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { lecture_id } = await req.json();
    if (!lecture_id) throw new Error("lecture_id is required");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: lecture, error: fetchErr } = await supabase
      .from("lectures")
      .select("*")
      .eq("id", lecture_id)
      .single();
    if (fetchErr || !lecture) throw new Error("Lecture not found");
    if (!lecture.transcript) throw new Error("Lecture has no transcript yet");

    await supabase.from("lectures").update({ status: "generating" }).eq("id", lecture_id);

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": GEMINI_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [
            {
              parts: [
                {
                  text: `Lecture title: ${lecture.title}\nSubject: ${lecture.subject ?? "unspecified"}\n\nTranscript:\n${JSON.stringify(
                    lecture.transcript
                  )}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 8000,
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) throw new Error("Gemini API error: " + JSON.stringify(geminiData));

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(rawText);

    // Insert topics + their child records
    for (let i = 0; i < (parsed.topics ?? []).length; i++) {
      const t = parsed.topics[i];

      const { data: topicRow, error: topicErr } = await supabase
        .from("topics")
        .insert({
          lecture_id,
          user_id: lecture.user_id,
          title: t.title,
          summary: t.summary,
          start_sec: t.start_sec,
          end_sec: t.end_sec,
          order_index: i,
        })
        .select()
        .single();
      if (topicErr) throw topicErr;

      if (t.revision_note) {
        await supabase.from("revision_notes").insert({
          topic_id: topicRow.id,
          user_id: lecture.user_id,
          content: t.revision_note,
        });
      }

      if (t.flashcards?.length) {
        await supabase.from("flashcards").insert(
          t.flashcards.map((f: any) => ({
            topic_id: topicRow.id,
            user_id: lecture.user_id,
            question: f.question,
            answer: f.answer,
            priority: 0,
          }))
        );
      }

      if (t.exam_questions?.length) {
        await supabase.from("exam_questions").insert(
          t.exam_questions.map((q: any) => ({
            topic_id: topicRow.id,
            user_id: lecture.user_id,
            question: q.question,
            answer: q.answer,
            difficulty: q.difficulty ?? "medium",
          }))
        );
      }
    }

    await supabase.from("lectures").update({ status: "ready" }).eq("id", lecture_id);

    return new Response(JSON.stringify({ ok: true, topics_created: parsed.topics?.length ?? 0 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    try {
      const body = await req.clone().json();
      if (body?.lecture_id) {
        await supabase
          .from("lectures")
          .update({ status: "error", error_message: String(err) })
          .eq("id", body.lecture_id);
      }
    } catch (_) {}
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
