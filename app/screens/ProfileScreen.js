import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { colors, spacing, radii, typography, fonts } from "../constants/theme";

export default function ProfileScreen() {
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  function confirmLogout() {
    Alert.alert("Log out?", "You'll need to sign in again to record or view lectures.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: handleLogout },
    ]);
  }

  async function handleLogout() {
    const { error } = await supabase.auth.signOut();
    if (error) Alert.alert("Couldn't log out", error.message);
    // RootNavigation listens to onAuthStateChange and swaps back to the
    // login screen automatically once the session clears.
  }

  const initial = email ? email[0].toUpperCase() : "?";

  return (
    <View style={styles.container}>
      <View style={styles.headerBlock}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <Text style={styles.email}>{email}</Text>
        <Text style={typography.muted}>Signed in with email</Text>
      </View>

      <View style={styles.divider} />

      <TouchableOpacity style={styles.row} onPress={confirmLogout} activeOpacity={0.7}>
        <View style={styles.rowLeft}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={[typography.bodyMedium, { color: colors.danger }]}>Log out</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.lg },
  headerBlock: { alignItems: "center", paddingVertical: spacing.xl, gap: spacing.xs },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: { fontFamily: fonts.bodyBold, fontSize: 26, color: colors.primary },
  email: { ...typography.h3, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
});
