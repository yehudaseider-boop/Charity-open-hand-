import { Pressable, StyleSheet, type PressableProps } from "react-native";
import { colors, radius, touch, type } from "@/theme/tokens";
import { Text } from "./text";

/** Primary button: ink fill, 17 px semibold, full width. */
export function Button({ label, ...rest }: PressableProps & { label: string }) {
  return (
    <Pressable
      accessibilityRole="button"
      {...rest}
      style={({ pressed }) => [styles.primary, pressed && { opacity: 0.85 }]}
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
    backgroundColor: colors.ink,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  link: { minHeight: touch, alignItems: "center", justifyContent: "center" },
  linkText: { color: colors.ink, textDecorationLine: "underline", textDecorationColor: colors.hairline },
});
