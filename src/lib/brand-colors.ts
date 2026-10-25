/**
 * Givezy colours for things that cannot read the website's CSS variables: receipt PDFs and emails.
 * The same values as `src/app/globals.css` and `apps/mobile/src/theme/tokens.ts`; change all three together.
 * Kept dependency-free.
 */
export const brandColors = {
  cream: "#FFFFFF", // page background (white in v2)
  surface: "#FFFFFF",
  ink: "#0E1B3D", // deep ink: body text and headlines
  blue: "#1749B5", // headlines, buttons, links
  blueSoft: "#E5D9FF",
  muted: "#4A5878", // slate (7.1:1 on white)
  hairline: "#ECE8F6", // light purple
  hairlineSoft: "#F4F1FF", // table rules on white
  orange: "#FF8A3D", // graphics and calls to action, ink text on it
  lilac: "#C9B4FA",
  lilacSoft: "#F4F1FF",
  danger: "#B3261E",
} as const;
