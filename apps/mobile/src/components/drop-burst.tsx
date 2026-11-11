import { useEffect, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { reduceMotion } from "@/lib/motion";
import { colors } from "@/theme/tokens";
import { Drop } from "./splash";

/** Where each of the logo's drops flies to, how far across it is, how it tilts and when it leaves. */
const DROPS = [
  { color: colors.lilac, dx: -110, dy: -70, rot: -30, size: 46, delay: 0 },
  { color: colors.orange, dx: 100, dy: -90, rot: 25, size: 40, delay: 70 },
  { color: colors.blue, dx: 0, dy: -130, rot: 8, size: 64, delay: 140 },
  { color: colors.orange, dx: -60, dy: -150, rot: 18, size: 28, delay: 210 },
  { color: colors.lilac, dx: 70, dy: -40, rot: -18, size: 34, delay: 120 },
  { color: colors.blue, dx: -130, dy: -20, rot: 12, size: 36, delay: 260 },
] as const;

/**
 * A small burst of the logo's own drops (lilac, orange and blue), once, when a gift goes through. Never repeats and
 * is left out entirely for anyone who asks their phone for less motion. Decoration only.
 */
export function DropBurst() {
  const [t] = useState(() => new Animated.Value(0));
  const [calm] = useState(() => reduceMotion());
  useEffect(() => {
    if (calm) return;
    Animated.timing(t, { toValue: 1, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [t, calm]);
  if (calm) return null;
  return (
    <View pointerEvents="none" style={styles.box} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {DROPS.map((d, i) => {
        const a = d.delay / 1500;
        return (
          <Animated.View
            key={i}
            style={{
              position: "absolute",
              opacity: t.interpolate({ inputRange: [0, a, a + 0.08, 0.7, 1], outputRange: [0, 0, 1, 1, 0], extrapolate: "clamp" }),
              transform: [
                { translateX: t.interpolate({ inputRange: [0, a, 1], outputRange: [0, 0, d.dx], extrapolate: "clamp" }) },
                { translateY: t.interpolate({ inputRange: [0, a, 0.6, 1], outputRange: [0, 0, d.dy, d.dy + 40], extrapolate: "clamp" }) },
                { scale: t.interpolate({ inputRange: [0, a, a + 0.25, 1], outputRange: [0.2, 0.2, 1, 0.9], extrapolate: "clamp" }) },
              ],
            }}
          >
            <Drop size={d.size} color={d.color} rotate={d.rot} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
});
