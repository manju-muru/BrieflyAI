import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  FlatList,
  Animated,
} from "react-native";
import {
  useAudioRecorder,
  RecordingPresets,
  useAudioRecorderState,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from "expo-audio";
import { File } from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { supabase, callTranscribe, callGenerateMaterials } from "../lib/supabase";
import { colors, spacing, radii, typography, fonts } from "../constants/theme";

export default function RecordScreen({ navigation }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 500); // polls every 500ms, gives us durationMillis

  const [isRecording, setIsRecording] = useState(false);
  const [title, setTitle] = useState("");
  const [flags, setFlags] = useState([]); // {timestamp_sec} logged locally until lecture is saved
  const [uploading, setUploading] = useState(false);

  const elapsedSec = Math.floor((recorderState.durationMillis ?? 0) / 1000);
  const elapsedSecRef = useRef(0);
  useEffect(() => {
    elapsedSecRef.current = elapsedSec;
  }, [elapsedSec]);

  // ============================================================
  // HOME SCREEN ENTRANCE ANIMATION — headline and controls fade
  // and rise into place on load, once, not on every re-render.
  // ============================================================
  const entrance = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(entrance, {
      toValue: 1,
      duration: 650,
      useNativeDriver: true,
    }).start();
  }, []);
  const entranceStyle = {
    opacity: entrance,
    transform: [
      {
        translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }),
      },
    ],
  };

  // Pulse ring around the record button — only animates while actually
  // recording, so the motion reflects real state rather than decoration.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let loop;
    if (isRecording) {
      pulse.setValue(0);
      loop = Animated.loop(
        Animated.timing(pulse, { toValue: 1, duration: 1600, useNativeDriver: true })
      );
      loop.start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(0);
    }
    return () => loop?.stop();
  }, [isRecording]);
  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.45, 0.12, 0] });

  async function startRecording() {
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Microphone permission needed", "Enable microphone access in settings.");
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });

      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      setFlags([]);
    } catch (err) {
      Alert.alert("Recording error", err.message);
    }
  }

  // ============================================================
  // ONE-TAP CONFUSION FLAG
  // Captures the exact elapsed timestamp the moment the student
  // taps it — no dialogs, no interruption to the lecture.
  // ============================================================
  function flagConfusion() {
    if (!isRecording) return;
    const ts = elapsedSecRef.current;
    setFlags((prev) => [...prev, { timestamp_sec: ts }]);
  }

  async function stopRecordingAndSave() {
    if (!isRecording) return;
    const finalElapsedSec = elapsedSecRef.current;
    setIsRecording(false);

    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("No recording URI available");
      setUploading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      // 1. Create the lecture row
      const { data: lecture, error: lecErr } = await supabase
        .from("lectures")
        .insert({
          user_id: user.id,
          title: title.trim() || `Lecture ${new Date().toLocaleDateString()}`,
          duration_seconds: finalElapsedSec,
          status: "uploaded",
        })
        .select()
        .single();
      if (lecErr) throw lecErr;

      // 2. Upload audio to Storage
      const audioFile = new File(uri);
      const bytes = await audioFile.bytes();
      const path = `${user.id}/${lecture.id}.m4a`;

      const { error: upErr } = await supabase.storage
        .from("lecture-audio")
        .upload(path, bytes, { contentType: "audio/m4a", upsert: true });
      if (upErr) throw upErr;

      await supabase.from("lectures").update({ audio_url: path }).eq("id", lecture.id);

      // 3. Save all confusion flags tied to this lecture
      if (flags.length > 0) {
        await supabase.from("confusion_flags").insert(
          flags.map((f) => ({
            lecture_id: lecture.id,
            user_id: user.id,
            timestamp_sec: f.timestamp_sec,
          }))
        );
      }

      // 4. Kick off transcription -> material generation (fire and forget;
      //    the lecture list screen polls status)
      callTranscribe(lecture.id)
        .then(() => callGenerateMaterials(lecture.id))
        .catch((e) => console.warn("Processing pipeline error:", e));

      setUploading(false);
      Alert.alert(
        "Lecture saved!",
        flags.length
          ? `${flags.length} confusing moment${flags.length > 1 ? "s" : ""} flagged. We're transcribing now — check back in a few minutes.`
          : "We're transcribing now — check back in a few minutes."
      );
      navigation.navigate("Library");
      setTitle("");
      setFlags([]);
    } catch (err) {
      setUploading(false);
      Alert.alert("Save error", err.message);
    }
  }

  return (
    <View style={styles.container}>
      <Animated.View style={entranceStyle}>
        {/* ============ CALLIGRAPHY TAGLINE ============ */}
        <Text style={styles.tagline}>Stay focused, without confusions</Text>

        <Text style={styles.fieldLabel}>Lecture title</Text>
        <TextInput
          style={styles.titleInput}
          placeholder="Thermodynamics — Lecture 4"
          placeholderTextColor={colors.textFaint}
          value={title}
          onChangeText={setTitle}
          editable={!isRecording}
        />
      </Animated.View>

      <Animated.View style={[styles.timerBox, entranceStyle]}>
        <Text style={styles.timer}>{formatTime(elapsedSec)}</Text>
        <Text style={[typography.label, { color: isRecording ? colors.accent : colors.textFaint }]}>
          {isRecording ? "RECORDING" : "READY"}
        </Text>
      </Animated.View>

      <View style={styles.controlsRow}>
        {isRecording && (
          <Animated.View
            style={[styles.pulseRing, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
          />
        )}
        {!isRecording ? (
          <TouchableOpacity style={styles.recordButton} onPress={startRecording} activeOpacity={0.85}>
            <Ionicons name="mic" size={30} color="#fff" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.stopButton}
            onPress={stopRecordingAndSave}
            disabled={uploading}
            activeOpacity={0.85}
          >
            <View style={styles.stopIcon} />
          </TouchableOpacity>
        )}
      </View>

      {/* ================= CONFUSION FLAG BUTTON ================= */}
      {isRecording && (
        <TouchableOpacity style={styles.confusionButton} onPress={flagConfusion} activeOpacity={0.85}>
          <Ionicons name="flag" size={20} color="#fff" />
          <Text style={styles.confusionButtonText}>I'm confused — flag this moment</Text>
        </TouchableOpacity>
      )}

      {flags.length > 0 && (
        <View style={styles.flagList}>
          <Text style={typography.label}>FLAGGED THIS SESSION</Text>
          <FlatList
            data={flags}
            keyExtractor={(_, i) => String(i)}
            horizontal
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.flagChip}>
                <Ionicons name="flag" size={12} color={colors.accent} />
                <Text style={styles.flagChipText}>{formatTime(item.timestamp_sec)}</Text>
              </View>
            )}
          />
        </View>
      )}

      {uploading && <Text style={styles.uploadingText}>Saving lecture…</Text>}
    </View>
  );
}

function formatTime(totalSec) {
  const m = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const s = Math.floor(totalSec % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg, gap: spacing.lg },
  tagline: {
    fontFamily: fonts.calligraphy,
    fontSize: 26,
    color: colors.primary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  fieldLabel: { ...typography.label, marginBottom: spacing.xs, marginLeft: 2 },
  titleInput: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
  },
  timerBox: { alignItems: "center", marginTop: spacing.md, gap: 6 },
  timer: {
    fontFamily: fonts.bodyBold,
    fontSize: 48,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  controlsRow: { alignItems: "center", justifyContent: "center", height: 130 },
  pulseRing: {
    position: "absolute",
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.accent,
  },
  recordButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  stopButton: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  stopIcon: { width: 24, height: 24, borderRadius: 5, backgroundColor: "#fff" },
  confusionButton: {
    flexDirection: "row",
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  confusionButtonText: { fontFamily: fonts.bodySemiBold, color: "#fff", fontSize: 15 },
  flagList: { gap: spacing.sm },
  flagChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    marginRight: spacing.xs,
  },
  flagChipText: { fontFamily: fonts.bodyMedium, color: colors.accent, fontSize: 12 },
  uploadingText: { textAlign: "center", color: colors.textMuted, fontFamily: fonts.body },
});
