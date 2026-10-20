export const colors = {
  primary: "#3772E5", // matches the app icon blue
  primaryDark: "#2857B8",
  accent: "#FF7A59", // used for confusion flag — warm, urgent, distinct from primary
  accentSoft: "#FFEDE7",
  bg: "#F7F7FC",
  card: "#FFFFFF",
  text: "#1B1B29",
  textMuted: "#71718A",
  textFaint: "#A8AAB8",
  border: "#E7E7F3",
  success: "#2FBF71",
  successSoft: "#E5F9EE",
  danger: "#E5484D",
  dangerSoft: "#FDECEC",
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

export const radii = { sm: 8, md: 14, lg: 22, pill: 999 };

// Fonts: Plus Jakarta Sans for all standard UI text, Dancing Script reserved
// for the one calligraphic accent (the Home screen tagline) — used sparingly
// so it reads as a deliberate flourish rather than a full theme change.
export const fonts = {
  body: "PlusJakartaSans_400Regular",
  bodyMedium: "PlusJakartaSans_500Medium",
  bodySemiBold: "PlusJakartaSans_600SemiBold",
  bodyBold: "PlusJakartaSans_700Bold",
  calligraphy: "DancingScript_700Bold",
};

export const typography = {
  h1: { fontFamily: fonts.bodyBold, fontSize: 26, color: colors.text },
  h2: { fontFamily: fonts.bodySemiBold, fontSize: 19, color: colors.text },
  h3: { fontFamily: fonts.bodySemiBold, fontSize: 16, color: colors.text },
  body: { fontFamily: fonts.body, fontSize: 15, color: colors.text, lineHeight: 21 },
  bodyMedium: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.text },
  muted: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, color: colors.textMuted, letterSpacing: 0.3 },
};
