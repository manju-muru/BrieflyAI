// supabase/functions/transcribe/index.ts
//
// Takes a lecture_id, pulls the audio from Storage, sends it to Deepgram
// (nova-2 model, word-level timestamps), and writes the transcript back
// onto the lecture row.
//
// Deploy: supabase functions deploy transcribe
// Secrets needed: DEEPGRAM_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const DEEPGRAM_API_KEY = Deno.env.get("DEEPGRAM_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    await supabase.from("lectures").update({ status: "transcribing" }).eq("id", lecture_id);

    const { data: fileBlob, error: dlErr } = await supabase.storage
      .from("lecture-audio")
      .download(lecture.audio_url);
    if (dlErr || !fileBlob) throw new Error("Could not download audio: " + dlErr?.message);

    const arrayBuffer = await fileBlob.arrayBuffer();

    // Deepgram's prerecorded endpoint is synchronous — send the raw audio
    // bytes directly, no base64 encoding and no polling loop needed.
    const dgRes = await fetch(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&punctuate=true&language=en",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${DEEPGRAM_API_KEY}`,
          "Content-Type": "audio/m4a", // matches expo-av's HIGH_QUALITY recording preset; change if you alter the recording format
        },
        body: arrayBuffer,
      }
    );

    const dgData = await dgRes.json();
    if (!dgRes.ok) throw new Error("Deepgram error: " + JSON.stringify(dgData));

    // Flatten Deepgram's response into our own [{text, start_sec, end_sec}] format,
    // grouped roughly into sentence-ish chunks using punctuation.
    const rawWords = dgData.results?.channels?.[0]?.alternatives?.[0]?.words ?? [];
    const words: { word: string; start: number; end: number }[] = rawWords.map((w: any) => ({
      word: w.punctuated_word ?? w.word,
      start: w.start,
      end: w.end,
    }));

    const transcript = chunkWordsIntoSegments(words);
    const fullText = words.map((w) => w.word).join(" ");
    const durationSeconds = words.length ? words[words.length - 1].end : 0;

    await supabase
      .from("lectures")
      .update({
        transcript,
        duration_seconds: durationSeconds,
        status: "transcribed",
      })
      .eq("id", lecture_id);

    // Backfill transcript_excerpt on any confusion flags raised during recording
    const { data: flags } = await supabase
      .from("confusion_flags")
      .select("id, timestamp_sec")
      .eq("lecture_id", lecture_id);

    for (const flag of flags ?? []) {
      const excerpt = extractExcerptAround(transcript, flag.timestamp_sec);
      await supabase.from("confusion_flags").update({ transcript_excerpt: excerpt }).eq("id", flag.id);
    }

    return new Response(JSON.stringify({ ok: true, transcript, fullText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function chunkWordsIntoSegments(words: { word: string; start: number; end: number }[]) {
  const segments: { text: string; start_sec: number; end_sec: number }[] = [];
  let buffer: string[] = [];
  let segStart = 0;
  words.forEach((w, idx) => {
    if (buffer.length === 0) segStart = w.start;
    buffer.push(w.word);
    const endsSentence = /[.!?]$/.test(w.word);
    const isLast = idx === words.length - 1;
    if (endsSentence || buffer.length >= 25 || isLast) {
      segments.push({ text: buffer.join(" "), start_sec: segStart, end_sec: w.end });
      buffer = [];
    }
  });
  return segments;
}

function extractExcerptAround(
  transcript: { text: string; start_sec: number; end_sec: number }[],
  t: number,
  windowSec = 25
) {
  return transcript
    .filter((seg) => seg.start_sec >= t - windowSec && seg.start_sec <= t + windowSec)
    .map((seg) => seg.text)
    .join(" ");
}
