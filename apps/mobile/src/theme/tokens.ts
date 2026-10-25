/**
 * Givezy brand tokens, v2 (decided 16/10/2026). Every screen uses these and nothing else.
 *
 * Blue carries headlines, buttons, tabs and big colour-block sections (white text on it). Deep navy
 * is for headlines on light grounds, body text on lilac, and the 4px "pressable" edge under
 * buttons. Orange is one call to action per screen, splashes, goal rings and streaks: text on
 * orange is navy, never white. Lavender, light purple and pale lilac are for splashes, card borders,
 * ring tracks and soft cards; peach only for background splashes. Slate is secondary text. Pages
 * are white.
 */
export const colors = {
  cream: "#FFFFFF", // page background (white in v2; the name stays so every screen follows)
  surface: "#FFFFFF", // cards and forms
  ink: "#0E1B3D", // deep ink: body text and headlines on light grounds
  navy: "#0E1B3D", // deep ink: text on orange and lilac, the edge under buttons
  blue: "#1749B5", // confirmed logo blue: headlines, buttons, tabs, colour-block sections (white on it 7.0:1)
  blueSoft: "#E5D9FF", // selected chips and quiet tints (light purple)
  muted: "#4A5878", // slate: secondary text (7.1:1 on white)
  hairline: "#ECE8F6", // light purple: card borders and dividers
  orange: "#FF8A3D", // the one call to action, splashes, goal rings, streaks (ink text on it, 7.2:1)
  orangeText: "#B84A0A", // small orange text, if ever needed (5.1:1 on white)
  orangeSoft: "#FFEBDD", // peach tint: background splashes only
  peach: "#FFEBDD", // peach tint: background splashes only
  lilac: "#C9B4FA", // soft lavender: splashes, the edge under white buttons
  lightPurple: "#E5D9FF", // card borders, ring tracks
  lilacSoft: "#F4F1FF", // pale lilac: soft cards
  sage: "#2E9D6B", // s18A tick and success graphics (graphics only)
  successText: "#1F6B4A", // small success text (6.3:1)
  danger: "#B3261E", // errors and destructive actions only (6.4:1)
  onInk: "#FFFFFF", // text on blue
  navyEdge: "#04123D", // deep navy at half brightness: the pressable edge under navy buttons
  scrim: "rgba(14,27,61,0.45)", // deep ink veil behind pop-ups
  scrimSoft: "rgba(14,27,61,0.35)", // lighter veil behind bottom sheets
  creamClear: "rgba(255,255,255,0)", // the page colour, see-through: where a fade to the page starts
} as const;

export const fonts = {
  /** Headlines: Fredoka 600, rounded and friendly like the Givezy wordmark. */
  display: "Fredoka_600SemiBold",
  /** Big numbers and amounts of delight: Fredoka 700. */
  displayBold: "Fredoka_700Bold",
  /** Everything else: DM Sans 400, 500, 600, 700. */
  body: "DMSans_400Regular",
  bodyMedium: "DMSans_500Medium",
  bodySemibold: "DMSans_600SemiBold",
  bodyBold: "DMSans_700Bold",
  /** Hebrew text, set beside DM Sans. */
  hebrew: "Heebo_400Regular",
  hebrewBold: "Heebo_600SemiBold",
} as const;

/** Amounts: DM Sans 600 with tabular figures, so columns of Rand line up. */
export const tabular = { fontFamily: fonts.bodySemibold, fontVariant: ["tabular-nums" as const] };

/** Type scale: body never below 16, labels never below 14, buttons 17 semibold. */
export const type = {
  hero: { fontFamily: fonts.display, fontSize: 42, lineHeight: 46, color: colors.navy },
  h1: { fontFamily: fonts.display, fontSize: 32, lineHeight: 37, color: colors.navy },
  h2: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, color: colors.navy },
  amount: { fontFamily: fonts.displayBold, fontVariant: ["tabular-nums" as const], fontSize: 48, lineHeight: 52, color: colors.blue },
  body: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: colors.ink },
  bodyMuted: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.muted },
  label: { fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 20, color: colors.muted },
  button: { fontFamily: fonts.bodyBold, fontSize: 18, lineHeight: 23 },
} as const;

export const space = {
  gutter: 24, // screen side padding
  block: 28, // between major blocks (24 to 32)
  sm: 8,
  md: 16,
} as const;

export const radius = {
  card: 24, // cards and sheets: big, soft corners
  control: 18, // inputs, buttons and small controls
  pill: 999, // chips and tags
} as const;

/** Corners for charity photos: plain rounded rectangles, big for hero photos and small for thumbnails. */
export const photoCorners = {
  big: { borderRadius: 28 },
  mid: { borderRadius: 20 },
  small: { borderRadius: 20 },
} as const;

/** A soft, blue-tinted lift for cards, so they float a little off the cream. */
export const lift = {
  shadowColor: "#1749B5",
  shadowOpacity: 0.1,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 8 },
  elevation: 3,
} as const;

/** Minimum touch target. */
export const touch = 48;
