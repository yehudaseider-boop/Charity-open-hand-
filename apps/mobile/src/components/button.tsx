import { Pressable, StyleSheet, type PressableProps } from "react-native";
import { haptic } from "@/lib/haptics";
import { colors, radius, touch, type } from "@/theme/tokens";
import { Text } from "./text";

/** Primary button: accent fill, 17 px semibold, full width. */
export function Button({ label, style, ...rest }: Omit<PressableProps, "style"> & { label: string; style?: object }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(rest.disabled) }}
      {...rest}
      onPress={(e) => {
        haptic.press();
        rest.onPress?.(e);
      }}
      style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }, style]}
    >
      <Text style={[type.button, { color: colors.onInk }]}>{label}</Text>
    </Pressable>
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
    minHeight: 56,
    borderRadius: radius.control,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  link: { minHeight: touch, alignItems: "center", justifyContent: "center" },
  linkText: { color: colors.accent, textDecorationLine: "underline", textDecorationColor: colors.accent },
});
