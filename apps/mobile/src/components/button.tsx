import { useState } from "react";
import { Animated, Pressable, StyleSheet, type PressableProps } from "react-native";
import { haptic } from "@/lib/haptics";
import { colors, lift, radius, touch, type } from "@/theme/tokens";
import { Text } from "./text";

/** Primary button: a blue pill with a springy press, 17 px semibold, full width. */
export function Button({ label, style, ...rest }: Omit<PressableProps, "style"> & { label: string; style?: object }) {
  const [scale] = useState(() => new Animated.Value(1));
  const to = (v: number) => Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 9 }).start();
  return (
    <Animated.View style={[{ transform: [{ scale }] }, !rest.disabled && lift, { borderRadius: radius.pill }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: Boolean(rest.disabled) }}
        {...rest}
        onPressIn={(e) => {
          to(0.96);
          rest.onPressIn?.(e);
        }}
        onPressOut={(e) => {
          to(1);
          rest.onPressOut?.(e);
        }}
        onPress={(e) => {
          haptic.press();
          rest.onPress?.(e);
        }}
        style={[styles.primary, style]}
      >
        <Text style={[type.button, { color: colors.onInk }]}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

/** Quiet text link with a full-size touch target. */
export function TextLink({ label, ...rest }: PressableProps & { label: string }) {
  return (
    <Pressable accessibilityRole="link" hitSlop={8} {...rest} style={styles.link}>
      <Text style={[type.button, styles.linkText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primary: {
    minHeight: 58,
    borderRadius: radius.pill,
    backgroundColor: colors.blue,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  link: { minHeight: touch, alignItems: "center", justifyContent: "center" },
  linkText: { color: colors.blue, textDecorationLine: "underline", textDecorationColor: colors.blue },
});
