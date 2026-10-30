import { StyleSheet, View } from "react-native";
import type { Campaign } from "@/data/sample";
import { ddmmyyyy, jhbDay, rand } from "@/lib/format";
import { campaignPercent } from "@/lib/live-charities";
import { colors, fonts, radius } from "@/theme/tokens";
import { Button } from "./button";
import { Bubbles } from "./people";
import { ShareButton } from "./share-button";
import { Text } from "./text";

/**
 * A campaign: its name, what it's for, a goal bar that fills as people give, and (optionally) a Give button.
 * A soft peach card in the For charities page's look, with the raised amount large in blue.
 */
export function CampaignCard({ campaign, onGive, shareText, charityName, compact = false }: { campaign: Campaign; onGive?: () => void; shareText?: string | null; charityName?: string; compact?: boolean }) {
  const pct = campaignPercent(campaign);
  const c = campaign;
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Bubbles
        items={[
          { size: 70, color: colors.lilac, ring: true, at: { right: -24, top: -26 } },
          { size: 10, color: colors.orange, float: true, at: { right: 56, top: 20 } },
        ]}
      />
      <View style={styles.kickerPill}>
        <Text style={styles.kicker} numberOfLines={1}>{charityName ? `Campaign · ${charityName}` : "Campaign"}</Text>
      </View>
      <Text style={[styles.title, compact && { fontSize: 21, lineHeight: 26 }]}>{c.title}</Text>
      {!compact && c.description ? <Text style={styles.description}>{c.description}</Text> : null}
      <View style={{ gap: 8, marginTop: compact ? 4 : 10 }}>
        <Text style={styles.figures}>
          <Text style={[styles.raised, compact && { fontSize: 22, lineHeight: 28 }]}>{rand(c.raisedCents)}</Text>
          {c.targetCents ? ` of ${rand(c.targetCents)}` : " raised"}
        </Text>
        {c.targetCents ? (
          <View style={styles.track} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }} accessibilityLabel={`${pct} per cent of the goal`}>
            <View style={[styles.fill, { width: `${Math.max(pct, 3)}%` }]} />
          </View>
        ) : null}
        <Text variant="label">
          {c.giftCount} {c.giftCount === 1 ? "gift" : "gifts"}{/* The last day in South Africa, wherever the phone is. */}
          {c.endsAt ? ` · until ${ddmmyyyy(jhbDay(c.endsAt))}` : ""}
        </Text>
      </View>
      {onGive ? <Button label="Give to this campaign" onPress={onGive} style={{ marginTop: 10 }} /> : null}
      {shareText !== undefined ? <ShareButton text={shareText} label={`Share ${c.title} on WhatsApp`} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.peach, borderRadius: radius.card, padding: 22, gap: 8, overflow: "hidden" },
  cardCompact: { padding: 18, gap: 6 },
  kickerPill: { alignSelf: "flex-start", maxWidth: "85%", paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill, backgroundColor: colors.surface },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.blue },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, letterSpacing: -0.3, color: colors.navy, marginTop: 4 },
  description: { fontSize: 16, lineHeight: 23, color: colors.ink },
  figures: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.muted },
  raised: { fontFamily: fonts.displayBold, fontVariant: ["tabular-nums"], fontSize: 28, lineHeight: 34, color: colors.blue },
  track: { height: 12, borderRadius: 6, backgroundColor: colors.surface, overflow: "hidden" },
  fill: { height: 12, borderRadius: 6, backgroundColor: colors.blue },
});
