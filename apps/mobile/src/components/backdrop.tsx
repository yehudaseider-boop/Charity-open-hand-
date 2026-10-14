import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View, type ViewStyle } from "react-native";
import { reduceMotion } from "@/lib/motion";
import { colors } from "@/theme/tokens";
import { Drop } from "./splash";

type Shape = { color: typeof colors.lilac | typeof colors.orange | typeof colors.blue; size: number; rotate: number; opacity: number; at: ViewStyle };

/**
 * Each screen gets its own arrangement of the logo's three shapes, very faint and drifting off
 * the edges, over a lilac wash that fades into cream. Related screens, never identical.
 */
const LAYOUTS: Record<string, Shape[]> = {
  discover: [
    { color: colors.lilac, size: 190, rotate: 18, opacity: 0.16, at: { right: -80, top: 300 } },
    { color: colors.orange, size: 200, rotate: -26, opacity: 0.1, at: { left: -110, top: 600 } },
    { color: colors.blue, size: 260, rotate: -12, opacity: 0.06, at: { right: -90, bottom: 90 } },
  ],
  giving: [
    { color: colors.orange, size: 190, rotate: 22, opacity: 0.11, at: { right: -100, top: 330 } },
    { color: colors.lilac, size: 170, rotate: -20, opacity: 0.16, at: { left: -90, top: 560 } },
    { color: colors.blue, size: 240, rotate: 8, opacity: 0.06, at: { right: -70, bottom: 110 } },
  ],
  receipts: [
    { color: colors.lilac, size: 180, rotate: -16, opacity: 0.16, at: { left: -90, top: 260 } },
    { color: colors.blue, size: 260, rotate: -6, opacity: 0.06, at: { right: -110, top: 520 } },
    { color: colors.orange, size: 170, rotate: 28, opacity: 0.1, at: { right: -70, bottom: 120 } },
  ],
  account: [
    { color: colors.orange, size: 180, rotate: -24, opacity: 0.1, at: { left: -100, top: 330 } },
    { color: colors.lilac, size: 190, rotate: 20, opacity: 0.16, at: { right: -90, bottom: 150 } },
    { color: colors.blue, size: 220, rotate: 10, opacity: 0.05, at: { left: -60, bottom: 40 } },
  ],
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
      <LinearGradient colors={[colors.lilacSoft, colors.cream]} locations={[0, 1]} style={styles.wash} />
      {shapes.map((s, i) => (
        <Floating key={`${variant}-${i}`} index={i} style={s.at}>
          <Drop size={s.size} color={s.color} rotate={s.rotate} opacity={s.opacity} />
        </Floating>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: colors.cream, overflow: "hidden" },
  wash: { position: "absolute", top: 0, left: 0, right: 0, height: 340 },
});
