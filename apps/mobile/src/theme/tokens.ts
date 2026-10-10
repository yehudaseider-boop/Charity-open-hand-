/**
 * Design bible tokens. Every screen uses these and nothing else.
 * Palette is locked: one accent (logo blue), teal for success, red for errors only.
 */
export const colors = {
  parchment: "#F4FBFA", // screen background
  surface: "#FFFFFF", // raised surface
  ink: "#1B2B3A", // text and primary buttons
  muted: "#5B6B78", // secondary text
  hairline: "#D5E6E3", // borders
  accent: "#0653B1", // logo blue: buttons, links, active tab, progress, selection
  accentSoft: "#E7F0FB", // pale logo blue: gentle highlight cards
  danger: "#C23B2A", // errors and destructive actions only
  success: "#168A66", // teal: success only
  onInk: "#FFFFFF", // text on ink buttons
} as const;

export const fonts = {
  display: "Archivo_800ExtraBold",
  displayBold: "Archivo_900Black",
  body: "Archivo_400Regular",
  bodyMedium: "Archivo_500Medium",
  bodySemibold: "Archivo_600SemiBold",
  bodyBold: "Archivo_700Bold",
  /** Hebrew text (Archivo has no Hebrew letters). */
  hebrew: "Assistant_400Regular",
  hebrewBold: "Assistant_700Bold",
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
