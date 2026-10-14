import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import type { Charity } from "@/data/sample";
import { haptic } from "@/lib/haptics";
import { colors, fonts, photoCorners, radius } from "@/theme/tokens";
import { CharityImage } from "./charity-image";
import { CheckIcon } from "./icons";
import { PressableScale } from "./pressable-scale";
import { Drop } from "./splash";
import { Text } from "./text";

/** "s18A receipt" as a quiet line of text with a tick, not a badge. */
function Receipt18a({ issues18a }: { issues18a: boolean }) {
  if (!issues18a) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <CheckIcon size={14} color={colors.sage} />
      <Text style={styles.receipt}>s18A receipt</Text>
    </View>
  );
}

/**
 * A charity in the directory. Featured: its photo cut as a photoCorners with a lilac shape peeking out
 * behind it, the name set below on the page, and a Give button that goes straight to the give
 * sheet. Otherwise: a plain row in an editorial list (photoCorners thumbnail, name, where and what),
 * divided by a hairline, with no box around it.
 */
export function CharityCard({ charity, featured = false, live = false, last = false }: { charity: Charity; featured?: boolean; live?: boolean; last?: boolean }) {
  const open = () => router.push(`/charity/${charity.slug}`);
  const where = [charity.area, charity.cause].filter(Boolean).join(" · ");
  if (featured) {
    return (
      <View style={styles.featured}>
        <View style={styles.dropBack} pointerEvents="none"><Drop size={150} color={colors.lilac} rotate={24} /></View>
        <PressableScale onPress={open} accessibilityRole="button" accessibilityLabel={`${charity.nameEn}, featured. ${where}`} style={{ gap: 16 }}>
          <CharityImage charity={charity} live={live} rounded={false} bare style={{ ...photoCorners.big, aspectRatio: 1 / 0.82, width: "100%" }} />
          <View style={{ gap: 4 }}>
            <Text style={styles.coverName} numberOfLines={3}>{charity.nameEn}</Text>
            <Text variant="bodyMuted" numberOfLines={2}>{where}</Text>
          </View>
        </PressableScale>
        <View style={styles.giveRow}>
          <Receipt18a issues18a={charity.issues18a} />
          <PressableScale
            onPress={() => {
              haptic.press();
              router.push(`/charity/${charity.slug}?sheet=give`);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Give to ${charity.nameEn}`}
            style={styles.giveNow}
          >
            <Text style={styles.giveNowText}>Give</Text>
          </PressableScale>
        </View>
      </View>
    );
  }
  return (
    <PressableScale onPress={open} accessibilityRole="button" accessibilityLabel={`${charity.nameEn}. ${where}`} style={last ? styles.row : [styles.row, styles.rule]} to={0.98}>
      <CharityImage charity={charity} live={live} compact rounded={false} style={{ ...photoCorners.small, ...styles.thumb }} />
      <View style={styles.rowText}>
        <Text style={styles.name}>{charity.nameEn}</Text>
        {charity.area ? <Text style={styles.area}>{charity.area}</Text> : null}
        <Text variant="bodyMuted" numberOfLines={2} style={{ fontSize: 15, lineHeight: 21 }}>{charity.cause}</Text>
        <Receipt18a issues18a={charity.issues18a} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  featured: { gap: 14 },
  dropBack: { position: "absolute", right: -14, top: -26, zIndex: 0 },
  coverName: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: colors.blue },
  giveRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  giveNow: { minHeight: 48, minWidth: 104, paddingHorizontal: 26, borderRadius: radius.pill, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center" },
  giveNowText: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.onInk },
  row: { flexDirection: "row", gap: 16, alignItems: "flex-start", paddingVertical: 16 },
  rule: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  thumb: { width: 92, aspectRatio: 1 },
  rowText: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24, color: colors.blue },
  area: { fontFamily: fonts.bodySemibold, fontSize: 14, letterSpacing: 0.2, color: colors.orangeText },
  receipt: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.successText },
});
