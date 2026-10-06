/**
 * Design bible tokens. Every screen uses these and nothing else.
 * Palette is locked: one accent (pomegranate), olive for success only.
 */
export const colors = {
  parchment: "#F5EFE4", // screen background
  surface: "#FBF8F2", // raised surface
  ink: "#1F2724", // text and primary buttons
  muted: "#6B6F68", // secondary text
  hairline: "#E2D9C8", // borders
  accent: "#8C2F2B", // pomegranate: active tab, progress, selection, key links
  success: "#4F5B34", // olive: success only
  onInk: "#FBF8F2", // text on ink buttons
} as const;

export const fonts = {
  display: "FrankRuhlLibre_500Medium",
  displayBold: "FrankRuhlLibre_700Bold",
  body: "Assistant_400Regular",
  bodyMedium: "Assistant_500Medium",
  bodySemibold: "Assistant_600SemiBold",
  bodyBold: "Assistant_700Bold",
} as const;

/** Type scale: body never below 16, labels never below 14, buttons 17 semibold. */
export const type = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, color: colors.ink },
  h1: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.ink },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.ink },
  amount: { fontFamily: fonts.display, fontSize: 48, lineHeight: 54, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: colors.ink },
  bodyMuted: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.muted },
  label: { fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 20, color: colors.muted },
  button: { fontFamily: fonts.bodySemibold, fontSize: 17, lineHeight: 22 },
} as const;

export const space = {
  gutter: 24, // screen side padding
  block: 28, // between major blocks (24 to 32)
  sm: 8,
  md: 16,
} as const;

export const radius = {
  card: 16, // cards and sheets
  control: 14, // buttons and inputs
} as const;

/** Minimum touch target. */
export const touch = 48;
