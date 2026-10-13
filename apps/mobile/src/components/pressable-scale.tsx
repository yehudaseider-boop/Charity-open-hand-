import { useState } from "react";
import { Animated, Pressable, type PressableProps, type ViewStyle } from "react-native";
import { reduceMotion } from "@/lib/motion";

/** A pressable that gives a little as it is touched and springs back: cards feel alive under the finger. */
export function PressableScale({ style, children, to = 0.97, ...rest }: Omit<PressableProps, "style" | "children"> & { style?: ViewStyle | ViewStyle[]; children: React.ReactNode; to?: number }) {
  const [scale] = useState(() => new Animated.Value(1));
  const spring = (v: number) => {
    if (reduceMotion()) return;
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 7 }).start();
  };
  return (
    <Animated.View style={[{ transform: [{ scale }] }]}>
      <Pressable
        {...rest}
        onPressIn={(e) => {
          spring(to);
          rest.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          spring(1);
          rest.onPressOut?.(e);
        }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
