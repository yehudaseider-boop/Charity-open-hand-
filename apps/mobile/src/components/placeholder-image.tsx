import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme/tokens";
import { PaperGrain } from "./paper-grain";
import { Text } from "./text";

/**
 * Stand-in for an editorial photograph. Clearly labelled as a placeholder;
 * swap for real community photography (warm natural light) before launch.
 */
export function PlaceholderImage({
  subject,
  style,
  rounded = true,
  labelPosition = "bottom",
  labelOffset = 12,
}: {
  subject: string;
  style?: ViewStyle;
  rounded?: boolean;
  labelPosition?: "top" | "bottom";
  /** Distance of the label from its edge (use the safe-area inset at the top of a screen). */
  labelOffset?: number;
}) {
  return (
    <View
      style={[styles.box, rounded && { borderRadius: radius.card }, style]}
      accessibilityRole="image"
      accessibilityLabel={`Placeholder image: ${subject}`}
    >
      {/* Soft warm forms suggesting light falling across a scene. */}
      <View style={[styles.form, { width: "70%", height: "80%", left: "-12%", top: "-20%" }]} />
      <View style={[styles.form, { width: "55%", height: "65%", right: "-10%", bottom: "-18%", opacity: 0.5 }]} />
      <PaperGrain opacity={0.6} />
      <View style={[styles.chip, labelPosition === "top" ? { top: labelOffset, right: 12 } : { bottom: labelOffset, left: 12 }]}>
        <Text variant="label" style={{ color: colors.muted }}>Placeholder photo: {subject}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.hairline, overflow: "hidden" },
  form: { position: "absolute", borderRadius: 999, backgroundColor: colors.surface, opacity: 0.55 },
  chip: {
    position: "absolute",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.surface,
  },
});
