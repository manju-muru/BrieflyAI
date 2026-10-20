import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { supabase, callReExplain, getSignedAudioUrl } from "../lib/supabase";
import { colors, spacing, radii, typography, fonts } from "../constants/theme";

export default function ConfusionReviewScreen({ route }) {
  const { lectureId } = route.params;
  const [flags, setFlags] = useState([]);
  const [loadingIds, setLoadingIds] = useState(new Set());
  const [audioUri, setAudioUri] = useState(null);
  const [audioError, setAudioError] = useState(null);
  const [activeTimestamp, setActiveTimestamp] = useState(null);

  // ============================================================
  // AUDIO PLAYBACK — lets a student re-listen to the exact moment
  // they flagged, alongside the AI re-explanation.
  // ============================================================
  const player = useAudioPlayer();
  const status = useAudioPlayerStatus(player);
  const seekTargetRef = useRef(null);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    loadAudio();
  }, []);

  async function loadAudio() {
    try {
      const { data: lecture, error } = await supabase
        .from("lectures")
        .select("audio_url")
        .eq("id", lectureId)
        .single();
      if (error) throw error;
      if (!lecture?.audio_url) throw new Error("No audio saved for this lecture");

      const signedUrl = await getSignedAudioUrl(lecture.audio_url);
      setAudioUri(signedUrl);
      player.replace(signedUrl);
    } catch (err) {
      setAudioError(err.message);
    }
  }

  // Wait for the player to report loaded before seeking — seeking before
  // load completes is a no-op on some platforms.
  useEffect(() => {
    if (seekTargetRef.current !== null && status.isLoaded) {
      const target = seekTargetRef.current;
      seekTargetRef.current = null;
      player.seekTo(target).then(() => player.play());
    }
  }, [status.isLoaded]);

  function playAt(seconds) {
    if (!audioUri) return;
    setActiveTimestamp(seconds);
    if (status.isLoaded) {
      player.seekTo(seconds).then(() => player.play());
    } else {
      seekTargetRef.current = seconds;
    }
  }

  function togglePlayPause() {
    if (status.playing) player.pause();
    else player.play();
  }

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("confusion_flags")
      .select("*")
      .eq("lecture_id", lectureId)
      .order("timestamp_sec");
    setFlags(data ?? []);
  }, [lectureId]);

  useEffect(() => {
    load();
  }, [load]);

  async function generateReExplanation(flagId) {
    setLoadingIds((s) => new Set(s).add(flagId));
    try {
      await callReExplain(flagId);
      await load();
    } catch (err) {
      Alert.alert("Couldn't generate re-explanation", err.message);
    } finally {
      setLoadingIds((s) => {
        const copy = new Set(s);
        copy.delete(flagId);
        return copy;
      });
    }
  }

  async function markResolved(flagId, resolved) {
    await supabase.from("confusion_flags").update({ resolved }).eq("id", flagId);
    load();
  }

  return (
    <View style={styles.container}>
      {/* ================= MINI PLAYER ================= */}
      {audioUri && (
        <View style={styles.miniPlayer}>
          <TouchableOpacity style={styles.playPauseButton} onPress={togglePlayPause} activeOpacity={0.85}>
            <Ionicons
              name={status.playing ? "pause" : "play"}
              size={18}
              color="#fff"
              style={!status.playing && { marginLeft: 2 }}
            />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={styles.miniPlayerLabel}>
              {activeTimestamp !== null ? `Playing from ${formatTime(activeTimestamp)}` : "Lecture audio"}
            </Text>
            <Text style={styles.miniPlayerTime}>
              {formatTime(Math.floor(status.currentTime ?? 0))} / {formatTime(Math.floor(status.duration ?? 0))}
            </Text>
          </View>
        </View>
      )}
      {audioError && (
        <View style={styles.audioErrorBox}>
          <Ionicons name="alert-circle-outline" size={14} color={colors.textMuted} />
          <Text style={[typography.muted, { flex: 1 }]}>Audio unavailable: {audioError}</Text>
        </View>
      )}

      <FlatList
        data={flags}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
        ListHeaderComponent={
          <Text style={[typography.muted, { marginBottom: spacing.sm }]}>
            These are the exact moments you flagged as confusing while listening. Play the moment
            back, or get a slower, example-rich re-explanation plus flashcards prioritized just for these.
          </Text>
        }
        renderItem={({ item }) => {
          const isLoading = loadingIds.has(item.id);
          const isActive = activeTimestamp === item.timestamp_sec;
          return (
            <View style={[styles.card, item.resolved && styles.cardResolved]}>
              <View style={styles.cardHeader}>
                <TouchableOpacity
                  style={[styles.timeChip, isActive && status.playing && styles.timeChipActive]}
                  onPress={() => playAt(item.timestamp_sec)}
                  disabled={!audioUri}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={isActive && status.playing ? "pause" : "play"}
                    size={11}
                    color={colors.accent}
                  />
                  <Text style={styles.timeChipText}>{formatTime(item.timestamp_sec)}</Text>
                </TouchableOpacity>
                {item.resolved && (
                  <View style={styles.resolvedChip}>
                    <Ionicons name="checkmark" size={12} color={colors.success} />
                    <Text style={styles.resolvedChipText}>Got it</Text>
                  </View>
                )}
              </View>

              {item.transcript_excerpt ? (
                <Text style={styles.excerpt} numberOfLines={3}>
                  "{item.transcript_excerpt}"
                </Text>
              ) : (
                <Text style={typography.muted}>Transcript still processing…</Text>
              )}

              {item.reexplanation_status === "ready" && item.reexplanation ? (
                <View style={styles.explanationBox}>
                  <Text style={styles.explanationLabel}>SLOWER, EXAMPLE-RICH RE-EXPLANATION</Text>
                  <Text style={typography.body}>{item.reexplanation}</Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={styles.explainButton}
                  onPress={() => generateReExplanation(item.id)}
                  disabled={isLoading || !item.transcript_excerpt}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="bulb" size={16} color="#fff" />
                      <Text style={styles.explainButtonText}>Re-explain this, slower</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}

              {!item.resolved && item.reexplanation_status === "ready" && (
                <TouchableOpacity style={styles.resolveButton} onPress={() => markResolved(item.id, true)}>
                  <Text style={styles.resolveButtonText}>Mark as understood</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        }}
      />
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
  container: { flex: 1, backgroundColor: colors.bg },
  miniPlayer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    padding: spacing.md,
  },
  playPauseButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  miniPlayerLabel: { fontFamily: fonts.bodyMedium, color: colors.text, fontSize: 13 },
  miniPlayerTime: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 12, marginTop: 2 },
  audioErrorBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  cardResolved: { opacity: 0.6 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between" },
  timeChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  timeChipActive: { borderWidth: 1, borderColor: colors.accent },
  timeChipText: { fontFamily: fonts.bodySemiBold, color: colors.accent, fontSize: 12 },
  resolvedChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.successSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  resolvedChipText: { fontFamily: fonts.bodySemiBold, color: colors.success, fontSize: 12 },
  excerpt: { fontStyle: "italic", fontFamily: fonts.body, color: colors.textMuted, fontSize: 13 },
  explanationBox: { backgroundColor: colors.bg, borderRadius: radii.sm, padding: spacing.sm, gap: 4 },
  explanationLabel: { ...typography.label, color: colors.primary, letterSpacing: 0.5 },
  explainButton: {
    flexDirection: "row",
    gap: spacing.xs,
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    padding: spacing.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  explainButtonText: { fontFamily: fonts.bodySemiBold, color: "#fff" },
  resolveButton: { alignSelf: "flex-start" },
  resolveButtonText: { fontFamily: fonts.bodyMedium, color: colors.success, fontSize: 13 },
});
