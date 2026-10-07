import { useEffect, useRef } from "react";
import { Animated, type ViewStyle } from "react-native";

/** Motion 2: soft fade-up as list items appear. */
export function FadeUp({ index = 0, children, style }: { index?: number; children: React.ReactNode; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 320, delay: index * 50, useNativeDriver: false }).start();
  }, [v, index]);
  return (
    <Animated.View
      style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}
    >
      {children}
    </Animated.View>
  );
}
