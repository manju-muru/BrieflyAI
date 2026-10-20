// supabase/functions/re-explain/index.ts
//
// This is the heart of the "confusion flag" feature.
// Given a confusion_flag_id, it:
//   1. Pulls the transcript excerpt around the flagged timestamp
//   2. Asks Gemini for a SLOWER, EXAMPLE-RICH re-explanation
//   3. Asks Gemini for 2-3 prioritized flashcards targeting that exact confusion
//   4. Saves the re-explanation on the flag, and inserts the flashcards with
//      is_from_confusion=true and boosted priority so they surface first in revision.
//
// Deploy: supabase functions deploy re-explain
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

const SYSTEM_PROMPT = `You are a patient, encouraging tutor. A student flagged this exact moment in a lecture as confusing.

Return ONLY valid JSON (no markdown fences) matching:

{
  "reexplanation": "A slower, simpler, example-rich re-explanation of the concept in this excerpt. Break it into small steps, use at least one concrete real-world example or analogy, and avoid jargon or explain it immediately when used. Write 150-300 words.",
  "flashcards": [ { "question": "string", "answer": "string" } ]
}

Rules:
- Produce exactly 3 flashcards that specifically target the confusing concept, ordered easiest to hardest.
- The re-explanation should assume the student is now hearing this for a second time and still didn't get it the first time — go slower and more concrete, don't just repeat the transcript.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { confusion_flag_id } = await req.json();
    if (!confusion_flag_id) throw new Error("confusion_flag_id is required");

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const { data: flag, error: flagErr } = await supabase
      .from("confusion_flags")
      .select("*, lectures(title, subject)")
      .eq("id", confusion_flag_id)
      .single();
    if (flagErr || !flag) throw new Error("Confusion flag not found");
    if (!flag.transcript_excerpt) {
      throw new Error("Transcript excerpt not ready yet — lecture may still be transcribing");
    }

    await supabase
      .from("confusion_flags")
      .update({ reexplanation_status: "generating" })
      .eq("id", confusion_flag_id);

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
                  text: `Lecture: ${flag.lectures?.title ?? "Untitled"} (${flag.lectures?.subject ?? "unspecified subject"})\n\nTranscript excerpt around the moment the student flagged confusion (flagged at ${flag.timestamp_sec}s):\n\n"${flag.transcript_excerpt}"`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 2000,
          },
        }),
      }
    );

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) throw new Error("Gemini API error: " + JSON.stringify(geminiData));

    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(rawText);

    await supabase
      .from("confusion_flags")
      .update({
        reexplanation: parsed.reexplanation,
        reexplanation_status: "ready",
      })
      .eq("id", confusion_flag_id);

    // Find the nearest topic to this timestamp so flashcards attach sensibly
    const { data: nearestTopic } = await supabase
      .from("topics")
      .select("id")
      .eq("lecture_id", flag.lecture_id)
      .lte("start_sec", flag.timestamp_sec)
      .order("start_sec", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (nearestTopic && parsed.flashcards?.length) {
      await supabase.from("flashcards").insert(
        parsed.flashcards.map((f: any) => ({
          topic_id: nearestTopic.id,
          user_id: flag.user_id,
          question: f.question,
          answer: f.answer,
          priority: 100, // boosted — surfaces first in revision decks
          is_from_confusion: true,
          confusion_flag_id: flag.id,
        }))
      );
    }

    return new Response(
      JSON.stringify({ ok: true, reexplanation: parsed.reexplanation, flashcards: parsed.flashcards }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
