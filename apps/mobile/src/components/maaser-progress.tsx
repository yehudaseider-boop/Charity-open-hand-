import { StyleSheet, View } from "react-native";
import { rand } from "@/lib/format";
import { colors, fonts, radius } from "@/theme/tokens";
import { Text } from "./text";

/**
 * Maaser (or chomesh) progress for the month or the year. Not a box: it sits straight on the page,
 * like the first lines of a pocket ledger. `compact` is the smaller second line (chomesh).
 */
export function MaaserProgress({
  title,
  givenCents,
  targetCents,
  period,
  periodLabel,
  endLabel,
  compact = false,
}: {
  /** "Maaser" or "Chomesh". */
  title: string;
  givenCents: number;
  targetCents: number;
  period: "month" | "year";
  periodLabel: string;
  endLabel: string;
  compact?: boolean;
}) {
  const ratio = targetCents > 0 ? Math.min(givenCents / targetCents, 1) : 0;
  const remaining = targetCents - givenCents;
  const sentence =
    remaining > 0
      ? `${rand(remaining)} to go to reach your goal by ${endLabel}.`
      : remaining === 0
        ? `You've reached your goal for this ${period}.`
        : `You've given ${rand(-remaining)} more than your goal this ${period}.`;

  return (
    <View style={{ gap: compact ? 6 : 10 }} accessible accessibilityLabel={`${title}: ${rand(givenCents)} given of ${rand(targetCents)}. ${sentence}`}>
      <Text style={styles.kicker}>{title} · {periodLabel}</Text>
      <View style={styles.figures}>
        <Text variant="amount" style={compact ? { fontSize: 30, lineHeight: 34 } : { fontSize: 52, lineHeight: 56 }}>{rand(givenCents)}</Text>
        <Text variant="bodyMuted" style={{ marginBottom: compact ? 3 : 8 }}>of {rand(targetCents)}</Text>
      </View>
      <View style={[styles.track, compact && { height: 10 }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(ratio * 100) }}>
        <View style={[styles.fill, compact && { backgroundColor: colors.orange }, { width: `${ratio * 100}%` }]} />
      </View>
      <Text style={{ fontSize: compact ? 15 : 17, lineHeight: compact ? 21 : 24, color: compact ? colors.muted : colors.ink }}>{sentence}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  kicker: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.blue },
  figures: { flexDirection: "row", alignItems: "flex-end", gap: 10, flexWrap: "wrap" },
  track: { height: 16, borderRadius: radius.pill, backgroundColor: colors.lilacSoft, overflow: "hidden" },
  fill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.blue },
});
