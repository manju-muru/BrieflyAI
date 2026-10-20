import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import Markdown from "react-native-markdown-display";
import { supabase } from "../lib/supabase";
import { colors, spacing, radii, typography } from "../constants/theme";
import FlashcardDeck from "../components/FlashcardDeck";

const TABS = ["Summary", "Notes", "Flashcards", "Exam Qs"];

export default function TopicDetailScreen({ route, navigation }) {
  const { topicId, title } = route.params;
  const [tab, setTab] = useState("Summary");
  const [topic, setTopic] = useState(null);
  const [note, setNote] = useState(null);
  const [flashcards, setFlashcards] = useState([]);
  const [examQuestions, setExamQuestions] = useState([]);

  useEffect(() => {
    navigation.setOptions({ title });
    load();
  }, []);

  async function load() {
    const { data: t } = await supabase.from("topics").select("*").eq("id", topicId).single();
    setTopic(t);

    const { data: n } = await supabase
      .from("revision_notes")
      .select("content")
      .eq("topic_id", topicId)
      .maybeSingle();
    setNote(n);

    const { data: f } = await supabase
      .from("flashcards")
      .select("*")
      .eq("topic_id", topicId)
      .order("priority", { ascending: false });
    setFlashcards(f ?? []);

    const { data: q } = await supabase.from("exam_questions").select("*").eq("topic_id", topicId);
    setExamQuestions(q ?? []);
  }

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {tab === "Summary" && (
        <ScrollView style={{ padding: spacing.lg }}>
          <Text style={typography.body}>{topic?.summary}</Text>
        </ScrollView>
      )}

      {tab === "Notes" && (
        <ScrollView style={{ padding: spacing.lg }}>
          {note ? <Markdown>{note.content}</Markdown> : <Text style={typography.muted}>No notes yet.</Text>}
        </ScrollView>
      )}

      {tab === "Flashcards" && <FlashcardDeck cards={flashcards} />}

      {tab === "Exam Qs" && (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
          {examQuestions.map((q) => (
            <View key={q.id} style={styles.qCard}>
              <View style={styles.qHeader}>
                <Text style={styles.qDifficulty}>{q.difficulty.toUpperCase()}</Text>
              </View>
              <Text style={[typography.body, { fontWeight: "600" }]}>{q.question}</Text>
              <Text style={[typography.muted, { marginTop: spacing.xs }]}>{q.answer}</Text>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  tabRow: { flexDirection: "row", padding: spacing.sm, gap: spacing.xs },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radii.pill, alignItems: "center" },
  tabActive: { backgroundColor: colors.primary },
  tabText: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
  tabTextActive: { color: "#fff" },
  qCard: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  qHeader: { marginBottom: spacing.xs },
  qDifficulty: { fontSize: 10, fontWeight: "700", color: colors.primary },
});
