import { useEffect, useState } from "react";
import { Animated, type StyleProp, type ViewStyle } from "react-native";
import { reduceMotion } from "@/lib/motion";

/** Motion 2: soft fade-up as list items appear. */
export function FadeUp({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const [v] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion()) return v.setValue(1);
    Animated.timing(v, { toValue: 1, duration: 320, delay: Math.min(index, 8) * 50, useNativeDriver: true }).start();
  }, [v, index]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}
