import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions, type ViewStyle } from "react-native";
import { reduceMotion } from "@/lib/motion";
import { colors } from "@/theme/tokens";
import { Drop } from "./splash";

type Shape = { color: typeof colors.lilac | typeof colors.orange | typeof colors.blue; size: number; rotate: number; opacity: number; at: ViewStyle };

/**
 * The four tabs sit on plain cream: their colour comes from the lilac header curve (`HeaderCurve`),
 * which scrolls with the page. Other pages keep the logo's shapes, very faint and drifting off the
 * edges, over a lilac wash that fades into cream.
 */
const LAYOUTS: Record<string, Shape[]> = {
  discover: [],
  giving: [],
  receipts: [],
  account: [],
  page: [
    { color: colors.lilac, size: 170, rotate: 18, opacity: 0.14, at: { right: -90, top: 420 } },
    { color: colors.orange, size: 170, rotate: -22, opacity: 0.09, at: { left: -100, bottom: 160 } },
  ],
};

export type BackdropVariant = keyof typeof LAYOUTS;

/** A slow, gentle float. Still when the phone asks for less motion. */
function Floating({ index, children, style }: { index: number; children: React.ReactNode; style: ViewStyle }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion()) return;
    const half = 4200 + index * 900;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: half, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, index]);
  const drift = index % 2 === 0 ? 10 : -10;
  return (
    <Animated.View style={[{ position: "absolute" }, style, { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, drift] }) }] }]}>
      {children}
    </Animated.View>
  );
}

/** The background behind a screen's content. Purely decorative: never touchable, never read aloud. */
export function Backdrop({ variant }: { variant: BackdropVariant }) {
  const shapes = LAYOUTS[variant] ?? LAYOUTS.page;
  return (
    <View style={[StyleSheet.absoluteFill, styles.base, { pointerEvents: "none" }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {shapes.length ? <LinearGradient colors={[colors.lilacSoft, colors.cream]} locations={[0, 1]} style={styles.wash} /> : null}
      {shapes.map((s, i) => (
        <Floating key={`${variant}-${i}`} index={i} style={s.at}>
          <Drop size={s.size} color={s.color} rotate={s.rotate} opacity={s.opacity} />
        </Floating>
      ))}
    </View>
  );
}

/** Radius of the circle the curve is cut from: big, so the edge is a gentle arc across the phone. */
const CURVE_R = 560;

/**
 * The lilac header at the top of each tab, ending in a gentle curve with a lilac and an orange rim.
 * Put it first inside the screen's scroll content; it scrolls away with the header. `depth` is how
 * far down the middle of the curve reaches from the top of the content.
 */
export function HeaderCurve({ depth }: { depth: number }) {
  const { width } = useWindowDimensions();
  const d = CURVE_R * 2;
  const sag = CURVE_R - Math.sqrt(CURVE_R * CURVE_R - (width / 2) ** 2);
  const circle = (color: string, drop: number) => (
    <View style={{ position: "absolute", width: d, height: d, borderRadius: CURVE_R, left: (width - d) / 2, top: depth + drop - d, backgroundColor: color }} />
  );
  return (
    <View style={[styles.curve, { height: depth, pointerEvents: "none" }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {/* Reaches above the top, so pulling down to refresh shows lilac, not a gap. */}
      <View style={{ position: "absolute", left: 0, right: 0, top: -800, height: 800 + depth - sag - 20, backgroundColor: colors.lilacSoft }} />
      {circle(colors.orange, 8)}
      {circle(colors.lilac, 4)}
      {circle(colors.lilacSoft, 0)}
    </View>
  );
}

const styles = StyleSheet.create({
  curve: { position: "absolute", top: 0, left: 0, right: 0 },
  base: { backgroundColor: colors.cream, overflow: "hidden" },
  wash: { position: "absolute", top: 0, left: 0, right: 0, height: 340 },
});
