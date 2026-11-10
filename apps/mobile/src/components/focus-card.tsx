import { StyleSheet, View } from "react-native";
import type { Focus } from "@shared/charity/focus";
import { focusUntil } from "@/lib/charity-extras";
import { colors, fonts, radius } from "@/theme/tokens";
import { Button } from "./button";
import { Bubbles } from "./people";
import { Text } from "./text";

/**
 * The charity's own focus, in its own words, at the top of its screen while its dates run: a pale lilac card
 * with a blue edge, a short title and message, and a button to give. The screen's one orange call to action
 * stays the Give bar at the bottom.
 */
export function FocusCard({ focus, giveLabel, onGive }: { focus: Focus; giveLabel: string; onGive: () => void }) {
  return (
    <View style={styles.card}>
      <Bubbles
        items={[
          { size: 84, color: colors.lilac, ring: true, at: { right: -28, top: -30 } },
          { size: 12, color: colors.orange, float: true, at: { right: 60, top: 18 } },
        ]}
      />
      <View style={styles.kickerPill}>
        <Text style={styles.kicker} numberOfLines={1}>What we&apos;re focused on right now</Text>
      </View>
      <Text accessibilityRole="header" style={styles.title}>{focus.title}</Text>
      <Text style={styles.message}>{focus.message}</Text>
      <Text variant="label">{focusUntil(focus)}</Text>
      <Button label={giveLabel} onPress={onGive} style={{ marginTop: 8 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 18, padding: 22, gap: 8, borderRadius: radius.card, backgroundColor: colors.lilacSoft, borderWidth: 1.5, borderColor: colors.blue, overflow: "hidden" },
  kickerPill: { alignSelf: "flex-start", maxWidth: "88%", paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, letterSpacing: -0.3, color: colors.navy, marginTop: 4 },
  message: { fontSize: 16, lineHeight: 23, color: colors.ink },
});
