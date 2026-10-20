import React, { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { colors, spacing, radii, typography } from "../constants/theme";

export default function LectureDetailScreen({ route, navigation }) {
  const { lectureId, title } = route.params;
  const [topics, setTopics] = useState([]);
  const [confusionCount, setConfusionCount] = useState(0);

  useEffect(() => {
    navigation.setOptions({ title });
    load();
  }, []);

  async function load() {
    const { data: topicData } = await supabase
      .from("topics")
      .select("id, title, summary, start_sec, order_index")
      .eq("lecture_id", lectureId)
      .order("order_index");
    setTopics(topicData ?? []);

    const { count } = await supabase
      .from("confusion_flags")
      .select("id", { count: "exact", head: true })
      .eq("lecture_id", lectureId);
    setConfusionCount(count ?? 0);
  }

  return (
    <View style={styles.container}>
      {confusionCount > 0 && (
        <TouchableOpacity
          style={styles.confusionBanner}
          onPress={() => navigation.navigate("ConfusionReview", { lectureId })}
        >
          <Ionicons name="flag" size={18} color="#fff" />
          <Text style={styles.confusionBannerText}>
            Review & replay {confusionCount} flagged moment{confusionCount > 1 ? "s" : ""}
          </Text>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>
      )}

      <FlatList
        data={topics}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: spacing.md, paddingVertical: spacing.md }}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            onPress={() => navigation.navigate("TopicDetail", { topicId: item.id, title: item.title })}
          >
            <Text style={typography.h2}>{item.title}</Text>
            <Text style={[typography.muted, { marginTop: 4 }]} numberOfLines={2}>
              {item.summary}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  confusionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  confusionBannerText: { color: "#fff", fontWeight: "700", flex: 1 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
