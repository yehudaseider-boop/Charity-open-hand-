import { StyleSheet, View } from "react-native";
import { rand } from "@/lib/format";
import { colors, radius } from "@/theme/tokens";
import { Text } from "./text";

/** Decorative asset 2: small geometric corner marker. */
function Corner({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const s = 10;
  const edge = {
    tl: { top: 8, left: 8, borderTopWidth: 1.5, borderLeftWidth: 1.5 },
    tr: { top: 8, right: 8, borderTopWidth: 1.5, borderRightWidth: 1.5 },
    bl: { bottom: 8, left: 8, borderBottomWidth: 1.5, borderLeftWidth: 1.5 },
    br: { bottom: 8, right: 8, borderBottomWidth: 1.5, borderRightWidth: 1.5 },
  }[pos];
  return <View style={[{ position: "absolute", width: s, height: s, borderColor: colors.accent, opacity: 0.6 }, edge]} />;
}

/** Component 3: maaser progress. Given vs target, one bar, one sentence. */
export function MaaserProgress({ givenCents, targetCents, yearEndLabel }: { givenCents: number; targetCents: number; yearEndLabel: string }) {
  const ratio = targetCents > 0 ? Math.min(givenCents / targetCents, 1) : 0;
  const remaining = targetCents - givenCents;
  const sentence =
    remaining > 0
      ? `${rand(remaining)} to go to reach your target by ${yearEndLabel}.`
      : remaining === 0
        ? "You've reached your target for this tax year."
        : `You've given ${rand(-remaining)} more than your target this tax year.`;

  return (
    <View style={styles.block} accessibilityLabel={`Maaser: ${rand(givenCents)} given of ${rand(targetCents)}. ${sentence}`}>
      <Corner pos="tl" />
      <Corner pos="tr" />
      <Corner pos="bl" />
      <Corner pos="br" />
      <Text variant="label">Maaser this tax year</Text>
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
  block: { padding: 24, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, gap: 10 },
  figures: { flexDirection: "row", alignItems: "flex-end", gap: 10, flexWrap: "wrap" },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.hairline, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.accent },
});
