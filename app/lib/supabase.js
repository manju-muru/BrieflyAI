import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

// Values come from app.json > expo.extra, set these before building.
const SUPABASE_URL = Constants.expoConfig?.extra?.supabaseUrl ?? "YOUR_SUPABASE_URL";
const SUPABASE_ANON_KEY = Constants.expoConfig?.extra?.supabaseAnonKey ?? "YOUR_SUPABASE_ANON_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// ---- Edge function helpers ----

export async function callTranscribe(lectureId) {
  return invokeFn("transcribe", { lecture_id: lectureId });
}

export async function callGenerateMaterials(lectureId) {
  return invokeFn("generate-materials", { lecture_id: lectureId });
}

export async function callReExplain(confusionFlagId) {
  return invokeFn("re-explain", { confusion_flag_id: confusionFlagId });
}

// Lecture audio lives in a private Storage bucket, so playback needs a
// time-limited signed URL rather than a public path.
export async function getSignedAudioUrl(path, expiresInSeconds = 3600) {
  const { data, error } = await supabase.storage
    .from("lecture-audio")
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

async function invokeFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) throw error;
  return data;
}
