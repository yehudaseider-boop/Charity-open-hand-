import { StyleSheet, View } from "react-native";
import { rand } from "@/lib/format";
import { colors, lift, radius } from "@/theme/tokens";
import { Text } from "./text";

/** Component 3: maaser (or chomesh) progress. Given vs target for the month or the year, one bar, one sentence. */
export function MaaserProgress({
  title,
  givenCents,
  targetCents,
  period,
  periodLabel,
  endLabel,
}: {
  /** "Maaser" or "Chomesh". */
  title: string;
  givenCents: number;
  targetCents: number;
  period: "month" | "year";
  periodLabel: string;
  endLabel: string;
}) {
  const ratio = targetCents > 0 ? Math.min(givenCents / targetCents, 1) : 0;
  const remaining = targetCents - givenCents;
  const sentence =
    remaining > 0
      ? `${rand(remaining)} to go to reach your target by ${endLabel}.`
      : remaining === 0
        ? `You've reached your target for this ${period}.`
        : `You've given ${rand(-remaining)} more than your target this ${period}.`;

  return (
    <View style={styles.block} accessible accessibilityLabel={`${title}: ${rand(givenCents)} given of ${rand(targetCents)}. ${sentence}`}>
      <Text variant="label">{title} this {period}</Text>
      <Text variant="label" style={{ marginTop: -8 }}>{periodLabel}</Text>
      <View style={styles.figures}>
        <Text variant="amount" style={{ fontSize: 44, lineHeight: 50 }}>{rand(givenCents)}</Text>
        <Text variant="bodyMuted" style={{ marginBottom: 6 }}>of {rand(targetCents)}</Text>
      </View>
      <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}>
        <View style={[styles.fill, { width: `${ratio * 100}%` }]} />
      </View>
      <Text style={{ fontSize: 17 }}>{sentence}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { padding: 24, borderRadius: radius.card, backgroundColor: colors.surface, gap: 10, ...lift },
  figures: { flexDirection: "row", alignItems: "flex-end", gap: 10, flexWrap: "wrap" },
  track: { height: 14, borderRadius: 7, backgroundColor: colors.lilacSoft, overflow: "hidden" },
  fill: { height: 14, borderRadius: 7, backgroundColor: colors.blue },
});
