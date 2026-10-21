import { StyleSheet, View } from "react-native";
import type { Campaign } from "@/data/sample";
import { ddmmyyyy, jhbDay, rand } from "@/lib/format";
import { campaignPercent } from "@/lib/live-charities";
import { colors, fonts, radius } from "@/theme/tokens";
import { Button } from "./button";
import { ShareButton } from "./share-button";
import { Text } from "./text";

/** A campaign: its name, what it's for, a goal bar that fills as people give, and (optionally) a Give button. */
export function CampaignCard({ campaign, onGive, shareText, charityName, compact = false }: { campaign: Campaign; onGive?: () => void; shareText?: string | null; charityName?: string; compact?: boolean }) {
  const pct = campaignPercent(campaign);
  const c = campaign;
  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{charityName ? `Campaign · ${charityName}` : "Campaign"}</Text>
      <Text style={styles.title}>{c.title}</Text>
      {!compact && c.description ? <Text style={{ fontSize: 16, lineHeight: 23 }}>{c.description}</Text> : null}
      <View style={{ gap: 6, marginTop: 4 }}>
        <Text style={styles.figures}>
          <Text style={styles.raised}>{rand(c.raisedCents)}</Text>
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
      {onGive ? <Button label="Give to this campaign" onPress={onGive} style={{ marginTop: 6 }} /> : null}
      {shareText !== undefined ? <ShareButton text={shareText} label={`Share ${c.title} on WhatsApp`} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.lilacSoft, borderRadius: radius.card, padding: 18, gap: 6, borderWidth: 1, borderColor: colors.lilac },
  kicker: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.blue },
  title: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.blue },
  figures: { fontFamily: fonts.body, fontSize: 16, color: colors.ink },
  raised: { fontFamily: fonts.bodySemibold, fontSize: 18, color: colors.ink },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.surface, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.blue },
});
