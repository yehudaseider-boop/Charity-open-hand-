import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors } from "@/theme/tokens";
import { Blob } from "./blob";
import { Bubbles } from "./people";

type Spot = { color: string; size: number; rotate: number; stretch?: number; at: ViewStyle };

/**
 * White screens get three soft splashes behind all content, in pale lilac and peach, placed
 * differently on each screen so they don't feel stamped on. The tab bar stays solid white over them.
 */
const LAYOUTS: Record<string, Spot[]> = {
  home: [
    { color: colors.lilacSoft, size: 260, rotate: 20, at: { right: -110, top: 380 } },
    { color: colors.peach, size: 220, rotate: -15, stretch: 1.2, at: { left: -120, top: 640 } },
    { color: colors.lilacSoft, size: 180, rotate: 40, at: { right: -60, bottom: 60 } },
  ],
  discover: [
    { color: colors.peach, size: 240, rotate: 30, at: { left: -120, top: 300 } },
    { color: colors.lilacSoft, size: 280, rotate: -10, stretch: 1.1, at: { right: -140, top: 620 } },
    { color: colors.peach, size: 170, rotate: 10, at: { left: -50, bottom: 40 } },
  ],
  giving: [
    { color: colors.lilacSoft, size: 230, rotate: -25, at: { left: -110, top: 420 } },
    { color: colors.peach, size: 200, rotate: 15, at: { right: -90, top: 700 } },
    { color: colors.lilacSoft, size: 260, rotate: 5, stretch: 1.2, at: { left: -80, bottom: -40 } },
  ],
  receipts: [
    { color: colors.peach, size: 220, rotate: 20, at: { right: -100, top: 260 } },
    { color: colors.lilacSoft, size: 260, rotate: -30, at: { left: -130, top: 560 } },
    { color: colors.peach, size: 160, rotate: 0, at: { right: -40, bottom: 80 } },
  ],
  account: [
    { color: colors.lilacSoft, size: 250, rotate: 35, at: { left: -120, top: 320 } },
    { color: colors.peach, size: 210, rotate: -20, at: { right: -100, top: 600 } },
    { color: colors.lilacSoft, size: 170, rotate: 10, at: { left: -40, bottom: 30 } },
  ],
  page: [
    { color: colors.lilacSoft, size: 240, rotate: 18, at: { right: -110, top: 340 } },
    { color: colors.peach, size: 200, rotate: -22, at: { left: -100, top: 640 } },
    { color: colors.lilacSoft, size: 180, rotate: 30, at: { right: -60, bottom: 40 } },
  ],
};

export type BackdropVariant = keyof typeof LAYOUTS;

/** The background behind a screen's content. Purely decorative: never touchable, never read aloud. */
export function Backdrop({ variant }: { variant: BackdropVariant }) {
  const spots = LAYOUTS[variant] ?? LAYOUTS.page;
  return (
    <View style={[StyleSheet.absoluteFill, styles.base, { pointerEvents: "none" }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {spots.map((s, i) => (
        <Blob key={`${variant}-${i}`} size={s.size} color={s.color} rotate={s.rotate} stretch={s.stretch} style={s.at} />
      ))}
    </View>
  );
}

/**
 * A blue colour-block header in the For charities page's look (30/10/2026): a lavender ring and an
 * orange dot bleeding off its edges, two small dots drifting, and big rounded bottom corners. Put white
 * text in it. It scrolls with the page; a blue block above it fills the gap when pulling down to refresh.
 */
export function BlueHeader({ children, paddingTop, style }: { children: React.ReactNode; paddingTop: number; style?: ViewStyle }) {
  return (
    <View style={[styles.header, { paddingTop }, style]}>
      <View style={styles.above} />
      <Bubbles
        items={[
          { size: 128, color: colors.lilac, ring: true, at: { right: -52, bottom: -64 } },
          { size: 64, color: colors.orange, at: { right: -22, top: paddingTop - 34 } },
          { size: 12, color: colors.lilac, float: true, at: { right: 62, top: paddingTop + 44 } },
          { size: 9, color: colors.orange, float: true, at: { left: 20, bottom: 12 } },
        ]}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.cream, overflow: "hidden" },
  header: { backgroundColor: colors.blue, borderBottomLeftRadius: 40, borderBottomRightRadius: 40, overflow: "hidden", paddingHorizontal: 24, paddingBottom: 32, gap: 10 },
  above: { position: "absolute", left: 0, right: 0, top: -800, height: 800, backgroundColor: colors.blue },
});
