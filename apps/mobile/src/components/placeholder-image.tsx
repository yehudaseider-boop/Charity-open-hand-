import { StyleSheet, View, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme/tokens";
import { Drop } from "./splash";
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
  compact = false,
}: {
  subject: string;
  style?: ViewStyle;
  rounded?: boolean;
  labelPosition?: "top" | "bottom";
  /** Distance of the label from its edge (use the safe-area inset at the top of a screen). */
  labelOffset?: number;
  /** Small thumbnails show a short "Placeholder" tag instead of the full label. */
  compact?: boolean;
}) {
  return (
    <View
      style={[styles.box, rounded && { borderRadius: radius.card }, style]}
      accessibilityRole="image"
      accessibilityLabel={`Placeholder image: ${subject}`}
    >
      {/* Playful splashes standing in for the photo, in the logo's colours. */}
      <View style={{ position: "absolute", right: "6%", top: "-10%" }}><Drop size={150} color={colors.lilac} rotate={24} opacity={0.6} /></View>
      <View style={{ position: "absolute", left: "8%", bottom: "-22%" }}><Drop size={110} color={colors.orange} rotate={-30} opacity={0.5} /></View>
      <View style={{ position: "absolute", left: "38%", top: "22%" }}><Drop size={46} color={colors.blue} rotate={70} opacity={0.35} /></View>
      <View style={[styles.chip, labelPosition === "top" ? { top: labelOffset, right: 12 } : compact ? { bottom: 6, left: 6 } : { bottom: labelOffset, left: 12 }]}>
        <Text variant="label" style={{ color: colors.muted }}>{compact ? "Placeholder" : `Placeholder photo: ${subject}`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.lilacSoft, overflow: "hidden" },
  chip: {
    position: "absolute",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.surface,
  },
});
