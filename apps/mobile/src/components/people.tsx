import { useEffect, useMemo, useState } from "react";
import { Animated, Easing, StyleSheet, View, type ViewStyle } from "react-native";
import { SvgXml } from "react-native-svg";
import { reduceMotion } from "@/lib/motion";
import { colors } from "@/theme/tokens";
import { peopleArt, type PeopleName } from "./people-art";

/**
 * A people illustration in the Givezy colours, the same pictures as the website's For charities page
 * (30/10/2026). Decoration only: hidden from screen readers. It floats gently, unless the phone asks for less motion.
 */
export function People({ name, width, style, float = true }: { name: PeopleName; width: number; style?: ViewStyle; float?: boolean }) {
  const xml = useMemo(() => peopleArt[name].replace(/\{\{(\w+)\}\}/g, (_, k: string) => (colors as Record<string, string>)[k] ?? colors.blue), [name]);
  const ratio = useMemo(() => {
    const m = /viewBox="[\d.-]+ [\d.-]+ ([\d.]+) ([\d.]+)"/.exec(xml);
    return m ? Number(m[2]) / Number(m[1]) : 1;
  }, [xml]);
  const y = useBob(float, 6, 3200);
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height: width * ratio, transform: [{ translateY: y }] }, style]}
    >
      <SvgXml xml={xml} width={width} height={width * ratio} />
    </Animated.View>
  );
}

/** A slow up-and-down float, shared by the people and the bubbles. Still when the phone asks for less motion. */
export function useBob(on: boolean, distance: number, ms: number) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!on || reduceMotion()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: ms / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: ms / 2, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [on, v, ms]);
  return v.interpolate({ inputRange: [0, 1], outputRange: [0, -distance] });
}

export type Bubble = { size: number; color: string; ring?: boolean; float?: boolean; at: ViewStyle };

/** Dots and rings scattered round a picture or a heading, like the website's (decoration only). */
export function Bubbles({ items }: { items: Bubble[] }) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      {items.map((b, i) => (
        <OneBubble key={i} b={b} slow={i % 2 === 1} />
      ))}
    </View>
  );
}

function OneBubble({ b, slow }: { b: Bubble; slow: boolean }) {
  const y = useBob(Boolean(b.float), 8, slow ? 5200 : 4000);
  const ring = Math.max(3, Math.round(b.size / 9));
  return (
    <Animated.View
      style={[
        { position: "absolute", width: b.size, height: b.size, borderRadius: b.size / 2, transform: [{ translateY: y }] },
        b.ring ? { borderWidth: ring, borderColor: b.color } : { backgroundColor: b.color },
        b.at,
      ]}
    />
  );
}
