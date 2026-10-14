/**
 * Givezy brand tokens. Every screen uses these and nothing else.
 *
 * Colours are read off the Givezy logo: blue wordmark, navy tagline, an orange and a lilac
 * splash, on warm cream. Blue carries headlines, tabs, buttons and links. Navy is body text.
 * Orange is the one bright accent per screen (the heart, a big number, a splash). Lilac is
 * for soft highlight cards and play. Bright orange and lilac fall below 4.5:1 on cream, so
 * they are for graphics and large type only: small orange text uses `orangeText`.
 */
export const colors = {
  cream: "#FEFDF7", // page background (from the logo)
  surface: "#FFFFFF", // raised surface, forms
  ink: "#102848", // navy: body text (14.5:1)
  blue: "#1848A8", // primary: headlines, buttons, links, tabs, selected (8.1:1 on cream, white on it 8.3:1)
  blueSoft: "#E8EEFB", // pale blue tint for selected chips and quiet cards (blue text on it 7.1:1)
  muted: "#5B6B84", // secondary text (5.3:1)
  hairline: "#E6E3D8", // warm border, derived from cream
  orange: "#F88038", // the accent: heart, big numbers, splashes (2.5:1: graphics and large type only)
  orangeText: "#B84A0A", // small orange text (5.1:1 on cream)
  orangeSoft: "#FEEBDC", // pale orange tint (orangeText on it 4.5:1)
  lilac: "#CCB3FB", // splashes and play (navy text on it 8.0:1)
  lilacSoft: "#F1EAFE", // soft highlight cards (navy text on it 12.6:1)
  sage: "#2E9D6B", // s18A badge icon and outline, progress (3.4:1: graphics only)
  successText: "#1F6B4A", // darker green for small success text (6.3:1)
  danger: "#B3261E", // errors and destructive actions only (6.4:1)
  onInk: "#FFFFFF", // text on buttons
} as const;

export const fonts = {
  /** Headlines: Fredoka 600, rounded and friendly like the Givezy wordmark. */
  display: "Fredoka_600SemiBold",
  /** Big numbers and amounts of delight: Fredoka 700. */
  displayBold: "Fredoka_700Bold",
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
  hero: { fontFamily: fonts.display, fontSize: 42, lineHeight: 46, color: colors.blue },
  h1: { fontFamily: fonts.display, fontSize: 32, lineHeight: 37, color: colors.blue },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, color: colors.blue },
  amount: { fontFamily: fonts.displayBold, fontVariant: ["tabular-nums" as const], fontSize: 48, lineHeight: 52, color: colors.blue },
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
  card: 28, // cards and sheets: big, soft corners
  control: 20, // inputs and small controls
  pill: 999, // buttons, chips, tags
} as const;

/**
 * The petal: two opposite corners rounded right out, the other two kept tight, like the logo's
 * shapes. It is the app's signature for photos, so a charity's picture is never a plain rectangle.
 * `big` is for hero photos, `small` for thumbnails.
 */
export const petal = {
  big: { borderTopLeftRadius: 120, borderBottomRightRadius: 120, borderTopRightRadius: 26, borderBottomLeftRadius: 26 },
  mid: { borderTopLeftRadius: 72, borderBottomRightRadius: 72, borderTopRightRadius: 18, borderBottomLeftRadius: 18 },
  small: { borderTopLeftRadius: 40, borderBottomRightRadius: 40, borderTopRightRadius: 10, borderBottomLeftRadius: 10 },
} as const;

/** A soft, blue-tinted lift for cards, so they float a little off the cream. */
export const lift = {
  shadowColor: "#1848A8",
  shadowOpacity: 0.1,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;

/** Minimum touch target. */
export const touch = 48;
