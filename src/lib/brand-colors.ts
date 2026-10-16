/**
 * Givezy colours for things that cannot read the website's CSS variables: receipt PDFs and emails.
 * The same values as `src/app/globals.css` and `apps/mobile/src/theme/tokens.ts`; change all three together.
 * Kept dependency-free.
 */
export const brandColors = {
  cream: "#FFFFFF", // page background (white in v2)
  surface: "#FFFFFF",
  ink: "#092577", // deep navy: body text
  blue: "#1749B5", // headlines, buttons, links
  blueSoft: "#E5D9FF",
  muted: "#34466A", // slate
  hairline: "#E5D9FF", // light purple
  hairlineSoft: "#F2ECFF", // table rules on white
  orange: "#FF914D", // graphics and calls to action, navy text on it
  lilac: "#C9B4FA",
  lilacSoft: "#F2ECFF",
  danger: "#B3261E",
} as const;
