import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors, spacing, radii, typography } from "../constants/theme";

export default function FlashcardDeck({ cards }) {
  const [index, setIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  if (!cards.length) {
    return (
      <View style={styles.empty}>
        <Text style={typography.muted}>No flashcards yet.</Text>
      </View>
    );
  }

  const card = cards[index];

  function next() {
    setShowAnswer(false);
    setIndex((i) => (i + 1) % cards.length);
  }
  function prev() {
    setShowAnswer(false);
    setIndex((i) => (i - 1 + cards.length) % cards.length);
  }

  return (
    <View style={styles.container}>
      <Text style={typography.muted}>
        Card {index + 1} of {cards.length}
      </Text>

      {card.is_from_confusion && (
        <View style={styles.priorityBadge}>
          <Ionicons name="flag" size={12} color="#fff" />
          <Text style={styles.priorityBadgeText}>Priority — from a flagged moment</Text>
        </View>
      )}

      <TouchableOpacity style={styles.card} onPress={() => setShowAnswer((v) => !v)} activeOpacity={0.85}>
        <Text style={styles.cardLabel}>{showAnswer ? "ANSWER" : "QUESTION"}</Text>
        <Text style={styles.cardText}>{showAnswer ? card.answer : card.question}</Text>
        <Text style={styles.tapHint}>Tap to {showAnswer ? "see question" : "reveal answer"}</Text>
      </TouchableOpacity>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navButton} onPress={prev}>
          <Ionicons name="chevron-back" size={22} color={colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.navButton} onPress={next}>
          <Ionicons name="chevron-forward" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: spacing.lg, alignItems: "center", gap: spacing.md },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  priorityBadgeText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  card: {
    width: "100%",
    minHeight: 220,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
  },
  cardLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, letterSpacing: 1 },
  cardText: { fontSize: 18, fontWeight: "600", color: colors.text, textAlign: "center" },
  tapHint: { fontSize: 12, color: colors.textMuted, marginTop: spacing.sm },
  navRow: { flexDirection: "row", gap: spacing.xl },
  navButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
});
