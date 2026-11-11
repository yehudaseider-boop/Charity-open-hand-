import { useEffect, useState } from "react";
import { Animated, Easing, View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";
import { reduceMotion } from "@/lib/motion";

/**
 * A progress bar that fills when it appears and glides to the new amount when people give (11/11/2026), instead of
 * jumping. The track and fill keep each screen's own look (their styles are passed in); this only moves the width.
 */
export function LiveBar({ percent, minPercent = 3, trackStyle, fillStyle, ...rest }: { percent: number; minPercent?: number; trackStyle: StyleProp<ViewStyle>; fillStyle: StyleProp<ViewStyle> } & ViewProps) {
  const to = Math.min(100, Math.max(percent, minPercent));
  const [v] = useState(() => new Animated.Value(reduceMotion() ? to : 0));
  useEffect(() => {
    if (reduceMotion()) return v.setValue(to);
    Animated.timing(v, { toValue: to, duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [v, to]);
  return (
    <View {...rest} style={[trackStyle, { overflow: "hidden" }]}>
      <Animated.View style={[fillStyle, { width: v.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }) }]} />
    </View>
  );
}
