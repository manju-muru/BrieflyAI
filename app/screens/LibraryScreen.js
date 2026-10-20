import React, { useCallback, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { colors, spacing, radii, typography } from "../constants/theme";

const STATUS_LABEL = {
  recording: "Recording",
  uploaded: "Queued",
  transcribing: "Transcribing…",
  transcribed: "Preparing materials…",
  generating: "Generating study material…",
  ready: "Ready",
  error: "Error",
};

export default function LibraryScreen({ navigation }) {
  const [lectures, setLectures] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("lectures")
      .select("id, title, subject, status, duration_seconds, created_at")
      .order("created_at", { ascending: false });
    if (!error) setLectures(data ?? []);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  return (
    <View style={styles.container}>
      <Text style={typography.h1}>Your Lectures</Text>
      <FlatList
        data={lectures}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.md }}
        ListEmptyComponent={
          <Text style={[typography.muted, { textAlign: "center", marginTop: spacing.xl }]}>
            No lectures yet. Hit record to get started!
          </Text>
        }
        renderItem={({ item }) => {
          const ready = item.status === "ready";
          return (
            <TouchableOpacity
              style={styles.card}
              disabled={!ready}
              onPress={() => navigation.navigate("LectureDetail", { lectureId: item.id, title: item.title })}
            >
              <View style={{ flex: 1 }}>
                <Text style={typography.h2}>{item.title}</Text>
                <Text style={typography.muted}>
                  {new Date(item.created_at).toLocaleDateString()} ·{" "}
                  {item.duration_seconds ? Math.round(item.duration_seconds / 60) + " min" : "—"}
                </Text>
              </View>
              <View style={[styles.badge, ready ? styles.badgeReady : styles.badgePending]}>
                <Text style={[styles.badgeText, ready ? styles.badgeTextReady : styles.badgeTextPending]}>
                  {STATUS_LABEL[item.status] ?? item.status}
                </Text>
              </View>
              {ready && <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 4 },
  badgeReady: { backgroundColor: "#E7F9EF" },
  badgePending: { backgroundColor: "#EFEFFB" },
  badgeText: { fontSize: 11, fontWeight: "700" },
  badgeTextReady: { color: colors.success },
  badgeTextPending: { color: colors.primary },
});
