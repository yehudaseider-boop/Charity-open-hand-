import { useEffect, useState } from "react";
import { Animated, Easing, Platform, RefreshControl, StyleSheet, View } from "react-native";
import { reduceMotion } from "@/lib/motion";
import { colors } from "@/theme/tokens";
import { Drop } from "./splash";

/**
 * Pull to refresh, in our own shapes (11/11/2026): three of the logo's drops bounce at the top while it loads, in
 * place of the grey spinner. On iPhones the system spinner is made invisible and these show instead. Android keeps
 * its own spinner, in our blue. Standing still for anyone who asks for less motion.
 */
export function pullToRefresh(refreshing: boolean, onRefresh: () => void) {
  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Platform.OS === "ios" ? "transparent" : colors.blue} colors={[colors.blue]} progressBackgroundColor={colors.surface} />;
}

export function RefreshDrops({ active, top }: { active: boolean; top: number }) {
  const [t] = useState(() => new Animated.Value(0));
  const show = active && Platform.OS === "ios";
  useEffect(() => {
    if (!show || reduceMotion()) return;
    t.setValue(0);
    const loop = Animated.loop(Animated.timing(t, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [show, t]);
  if (!show) return null;
  const items = [
    { color: colors.lilac, size: 20, at: 0 },
    { color: colors.orange, size: 18, at: 0.16 },
    { color: colors.blue, size: 24, at: 0.32 },
  ] as const;
  return (
    <View pointerEvents="none" style={[styles.wrap, { top }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.pill}>
        {items.map((d, i) => (
          <Animated.View key={i} style={{ transform: [{ translateY: t.interpolate({ inputRange: [0, d.at, d.at + 0.25, d.at + 0.5, 1], outputRange: [0, 0, -9, 0, 0], extrapolate: "clamp" }) }] }}>
            <Drop size={d.size} color={d.color} />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 5 },
  pill: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.hairline, shadowColor: colors.navy, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
});
