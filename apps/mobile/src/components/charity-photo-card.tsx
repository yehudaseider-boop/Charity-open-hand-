import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import type { Charity } from "@/data/sample";
import { haptic } from "@/lib/haptics";
import { causeList } from "@/lib/directory";
import { campaignPercent } from "@/lib/live-charities";
import { colors, fonts, radius } from "@/theme/tokens";
import { CharityImage } from "./charity-image";
import { CheckIcon } from "./icons";
import { PressableScale } from "./pressable-scale";
import { Text } from "./text";

/** "Checked · s18A" on the photo, or "Checked by Givezy" when the charity doesn't issue s18A receipts. */
export function CheckedBadge({ issues18a, style }: { issues18a: boolean; style?: object }) {
  return (
    <View style={[styles.badge, style]}>
      <CheckIcon size={14} color={colors.sage} />
      <Text style={styles.badgeText}>{issues18a ? "Checked · s18A" : "Checked by Givezy"}</Text>
    </View>
  );
}

/**
 * A charity as a photo story card: its cover photo with the checked badge, the cause and area as a
 * small blue label, the name, its one-line description, and (when it is raising for a campaign) an
 * orange progress bar, with a small Give button. `width` for the sideways row on Home; full width on Discover.
 */
export function CharityPhotoCard({ charity, live, width, onGive }: { charity: Charity; live: boolean; width?: number; onGive?: (c: Charity) => void }) {
  const campaign = charity.campaigns?.[0];
  const pct = campaign?.targetCents ? campaignPercent(campaign) : null;
  const causeName = causeList().find((c) => c.id === charity.causeId)?.label;
  const kicker = [causeName, charity.area].filter(Boolean).join(" · ");
  return (
    <PressableScale
      onPress={() => router.push(`/charity/${charity.slug}`)}
      accessibilityRole="button"
      accessibilityLabel={`${charity.nameEn}. ${charity.cause}`}
      style={width ? { ...styles.card, width } : styles.card}
      to={0.98}
    >
      <View>
        <CharityImage charity={charity} live={live} rounded={false} bare style={styles.photo} />
        <CheckedBadge issues18a={charity.issues18a} style={styles.badgeOnPhoto} />
      </View>
      <View style={styles.body}>
        {kicker ? <Text style={styles.kicker} numberOfLines={1}>{kicker.toUpperCase()}</Text> : null}
        <Text style={styles.name} numberOfLines={2}>{charity.nameEn}</Text>
        <Text variant="bodyMuted" numberOfLines={2} style={{ fontSize: 15, lineHeight: 21 }}>{charity.cause}</Text>
        {pct !== null ? (
          <View style={{ gap: 6, marginTop: 4 }}>
            <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(pct, 3)}%` }]} /></View>
            <View style={styles.footer}>
              <Text style={styles.progressText} numberOfLines={1}>{campaign!.title} · {pct}% of goal</Text>
              {onGive ? <SmallGive charity={charity} onGive={onGive} /> : null}
            </View>
          </View>
        ) : onGive ? (
          <View style={[styles.footer, { marginTop: 4 }]}>
            <View />
            <SmallGive charity={charity} onGive={onGive} />
          </View>
        ) : null}
      </View>
    </PressableScale>
  );
}

function SmallGive({ charity, onGive }: { charity: Charity; onGive: (c: Charity) => void }) {
  return (
    <PressableScale
      onPress={() => {
        haptic.tap();
        onGive(charity);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Give to ${charity.nameEn}`}
      style={styles.give}
    >
      <Text style={styles.giveText}>Give</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, overflow: "hidden" },
  photo: { height: 130, width: "100%", borderRadius: 0 },
  badgeOnPhoto: { position: "absolute", left: 12, top: 12 },
  badge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.navy },
  body: { padding: 16, gap: 4 },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.8, color: colors.blue },
  name: { fontFamily: fonts.display, fontSize: 21, lineHeight: 26, color: colors.navy },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.lightPurple, overflow: "hidden" },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.orange },
  footer: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  progressText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.muted },
  give: { minHeight: 40, paddingHorizontal: 18, borderRadius: 14, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center", borderBottomWidth: 3, borderBottomColor: colors.navy },
  giveText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.onInk },
});
