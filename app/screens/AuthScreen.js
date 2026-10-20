import React, { useState, useRef, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  ScrollView,
  Animated,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "../lib/supabase";
import { colors, spacing, radii, typography, fonts } from "../constants/theme";

export default function AuthScreen() {
  const [mode, setMode] = useState("login"); // "login" | "signup" — explicit user-management modes
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const isSignUp = mode === "signup";

  // ============================================================
  // ENTRANCE ANIMATION — staggered reveal (mark → tagline → form),
  // plus a slow ambient "focus ring" breathing around the mic mark.
  // The breathing ring is deliberately calm and continuous rather
  // than urgent, echoing the app's "stay focused" premise — distinct
  // from the faster pulse used on the Record screen while actively
  // recording, since here nothing urgent is happening.
  // ============================================================
  const markScale = useRef(new Animated.Value(0.6)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const taglineAnim = useRef(new Animated.Value(0)).current;
  const formAnim = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.spring(markScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
        Animated.timing(markOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      Animated.timing(taglineAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(formAnim, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(breathe, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const breatheScale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const breatheOpacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  const taglineStyle = {
    opacity: taglineAnim,
    transform: [{ translateY: taglineAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
  };
  const formStyle = {
    opacity: formAnim,
    transform: [{ translateY: formAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }],
  };

  async function handleSubmit() {
    if (!email || !password) {
      Alert.alert("Missing info", "Enter both email and password.");
      return;
    }
    setLoading(true);
    try {
      const { error } = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      if (isSignUp) {
        Alert.alert("Check your email", "Confirm your email to finish signing up.");
      }
    } catch (err) {
      Alert.alert("Error", err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.markWrap}>
          <Animated.View
            style={[styles.breatheRing, { transform: [{ scale: breatheScale }], opacity: breatheOpacity }]}
          />
          <Animated.View style={[styles.mark, { opacity: markOpacity, transform: [{ scale: markScale }] }]}>
            <Ionicons name="mic" size={28} color={colors.primary} />
          </Animated.View>
        </View>

        <Animated.View style={taglineStyle}>
          <Text style={styles.logo}>BrieflyAI</Text>
          <Text style={styles.tagline}>Stay focused, without confusions.</Text>
        </Animated.View>

        <Animated.View style={formStyle}>
          {/* ============ USER MANAGEMENT: explicit Login / Sign Up switcher ============ */}
          <View style={styles.segmentedControl}>
            <TouchableOpacity
              style={[styles.segment, mode === "login" && styles.segmentActive]}
              onPress={() => setMode("login")}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, mode === "login" && styles.segmentTextActive]}>Log In</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, mode === "signup" && styles.segmentActive]}
              onPress={() => setMode("signup")}
              activeOpacity={0.8}
            >
              <Text style={[styles.segmentText, mode === "signup" && styles.segmentTextActive]}>Sign Up</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.form}>
            <View>
              <Text style={styles.fieldLabel}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="you@university.edu"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View>
              <Text style={styles.fieldLabel}>Password</Text>
              <TextInput
                style={styles.input}
                placeholder="••••••••"
                placeholderTextColor={colors.textFaint}
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </View>

            <TouchableOpacity style={styles.button} onPress={handleSubmit} disabled={loading} activeOpacity={0.85}>
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{isSignUp ? "Create account" : "Log in"}</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: "center", padding: spacing.lg },
  markWrap: {
    alignSelf: "center",
    width: 90,
    height: 90,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
  },
  breatheRing: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.primary,
  },
  mark: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: { ...typography.h1, textAlign: "center", fontSize: 30 },
  tagline: {
    fontFamily: fonts.calligraphy,
    fontSize: 22,
    color: colors.primary,
    textAlign: "center",
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
  },
  segmentedControl: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    marginBottom: spacing.lg,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.pill,
    alignItems: "center",
  },
  segmentActive: { backgroundColor: colors.primary },
  segmentText: { fontFamily: fonts.bodySemiBold, color: colors.textMuted, fontSize: 14 },
  segmentTextActive: { color: "#fff" },
  form: { gap: spacing.md },
  fieldLabel: { ...typography.label, marginBottom: spacing.xs, marginLeft: 2 },
  input: {
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
  button: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  buttonText: { fontFamily: fonts.bodySemiBold, color: "#fff", fontSize: 16 },
});
