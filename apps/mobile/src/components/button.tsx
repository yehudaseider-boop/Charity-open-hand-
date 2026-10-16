import { Pressable, StyleSheet, View, type PressableProps } from "react-native";
import { haptic } from "@/lib/haptics";
import { colors, radius, touch, type } from "@/theme/tokens";
import { Text } from "./text";

type Variant = "primary" | "cta" | "secondary" | "white" | "dark";

/** Face colour, text colour and the solid edge under each kind of button. */
const look: Record<Variant, { bg: string; text: string; edge: string; border?: string }> = {
  /** Blue, white text, navy edge: the usual button. */
  primary: { bg: colors.blue, text: colors.onInk, edge: colors.navy },
  /** Orange, navy text, navy edge: the one call to action on a screen. */
  cta: { bg: colors.orange, text: colors.navy, edge: colors.navy },
  /** White, blue text, lavender edge: for actions that should not shout, and on blue grounds. */
  secondary: { bg: colors.surface, text: colors.blue, edge: colors.lilac, border: colors.lightPurple },
  white: { bg: colors.surface, text: colors.blue, edge: colors.lilac },
  /** Navy, white text (Continue with Apple). */
  dark: { bg: colors.navy, text: colors.onInk, edge: "#04123D" },
};

/**
 * A pressable button: big rounded corners, bold DM Sans 18, and a solid bottom edge so it looks
 * tappable. It nudges down 2px when pressed, as the edge squashes.
 */
export function Button({ label, style, variant = "primary", icon, ...rest }: Omit<PressableProps, "style"> & { label: string; style?: object; variant?: Variant; icon?: React.ReactNode }) {
  const l = look[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(rest.disabled) }}
      {...rest}
      onPress={(e) => {
        haptic.press();
        rest.onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: l.bg, borderBottomColor: l.edge, borderBottomWidth: pressed ? 2 : 5, marginTop: pressed ? 3 : 0 },
        l.border ? { borderColor: l.border, borderWidth: 1.5, borderBottomWidth: pressed ? 2 : 5, borderBottomColor: l.edge } : null,
        rest.disabled && { opacity: 0.45 },
        style,
      ]}
    >
      <View style={styles.inner}>
        {icon}
        <Text style={[type.button, { color: l.text }]}>{label}</Text>
      </View>
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
  base: { minHeight: 58, borderRadius: radius.control, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  inner: { flexDirection: "row", alignItems: "center", gap: 10 },
  link: { minHeight: touch, alignItems: "center", justifyContent: "center" },
  linkText: { color: colors.blue, textDecorationLine: "underline", textDecorationColor: colors.blue, fontSize: 17 },
});
