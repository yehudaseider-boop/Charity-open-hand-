/**
 * Givezy colours for things that cannot read the website's CSS variables: receipt PDFs and emails.
 * The same values as `src/app/globals.css` and `apps/mobile/src/theme/tokens.ts`; change all three together.
 * Kept dependency-free.
 */
export const brandColors = {
  cream: "#FEFDF7",
  surface: "#FFFFFF",
  ink: "#102848", // navy: body text
  blue: "#1848A8", // headlines, buttons, links
  blueSoft: "#E8EEFB",
  muted: "#5B6B84",
  hairline: "#E6E3D8",
  hairlineSoft: "#F0EEE6", // table rules on white
  orange: "#F88038", // graphics only, never text
  lilac: "#CCB3FB",
  lilacSoft: "#F1EAFE",
  danger: "#B3261E",
} as const;
