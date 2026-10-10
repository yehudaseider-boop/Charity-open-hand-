/**
 * Nadiv Lev brand kit tokens. Every screen uses these and nothing else.
 *
 * Indigo and cream carry most of every screen. Coral is the one accent: a
 * single coral element per screen (the heart, a big number, the logo dot).
 * Buttons and links use deep coral. Coral and sage fall below 4.5:1 on cream,
 * so they are for graphics and large type only: small green or red text uses
 * `successText` / `danger` instead.
 */
export const colors = {
  parchment: "#FBF6EC", // cream: screen background
  surface: "#FFFFFF", // raised surface, forms
  ink: "#191C2B", // body text (15.7:1)
  indigo: "#1F2A5E", // primary: headlines, logo, selected states (12.6:1)
  muted: "#6A6E80", // stone: secondary text (4.7:1)
  hairline: "#E4DCCB", // warm border, derived from cream
  accent: "#C4442F", // deep coral: buttons, links, active tab (4.6:1; white on it 5.0:1)
  accentSoft: "#FBE9E4", // pale coral tint for gentle highlight cards (ink text on it)
  coral: "#E5604B", // the accent: heart, big type, logo dot (3.2:1: large or graphic only)
  honey: "#F2B84B", // highlights and chart accent (indigo on it 7.6:1)
  sage: "#4F8A73", // s18A badge icon and outline, progress (3.7:1: graphics only)
  successText: "#2F6B55", // darker sage for small success text (5.8:1)
  danger: "#A32818", // errors and destructive actions only (6.8:1)
  onInk: "#FFFFFF", // text on buttons
} as const;

export const fonts = {
  /** Headlines: Fraunces 600, never below 20 px. */
  display: "Fraunces_600SemiBold",
  /** Everything else: Inter 400, 500, 600. */
  body: "Inter_400Regular",
  bodyMedium: "Inter_500Medium",
  bodySemibold: "Inter_600SemiBold",
  /** Hebrew text, set beside Inter. */
  hebrew: "Heebo_400Regular",
  hebrewBold: "Heebo_600SemiBold",
} as const;

/** Amounts: Inter 600 with tabular figures, so columns of Rand line up. */
export const tabular = { fontFamily: fonts.bodySemibold, fontVariant: ["tabular-nums" as const] };

/** Type scale: body never below 16, labels never below 14, buttons 17 semibold. */
export const type = {
  hero: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, color: colors.indigo },
  h1: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.indigo },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.indigo },
  amount: { ...tabular, fontSize: 48, lineHeight: 54, color: colors.indigo },
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
