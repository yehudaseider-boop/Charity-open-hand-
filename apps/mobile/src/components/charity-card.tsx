import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import type { Charity } from "@/data/sample";
import { colors, fonts, radius } from "@/theme/tokens";
import { CharityImage } from "./charity-image";
import { CheckIcon } from "./icons";
import { PressableScale } from "./pressable-scale";
import { Text } from "./text";

/** "s18A receipt" as a quiet line of text with a tick, not a badge. */
function Receipt18a({ issues18a, light = false }: { issues18a: boolean; light?: boolean }) {
  if (!issues18a) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <CheckIcon size={14} color={light ? colors.onInk : colors.sage} />
      <Text style={[styles.receipt, light && { color: colors.onInk }]}>s18A receipt</Text>
    </View>
  );
}

/**
 * A charity in the directory. Featured: its photo, big, with the name set over it like a magazine
 * cover. Otherwise: a plain row in an editorial list (photo, name, where and what), divided by a
 * hairline, with no box around it.
 */
export function CharityCard({ charity, featured = false, live = false, last = false }: { charity: Charity; featured?: boolean; live?: boolean; last?: boolean }) {
  const open = () => router.push(`/charity/${charity.slug}`);
  const where = [charity.area, charity.cause].filter(Boolean).join(" · ");
  if (featured) {
    return (
      <PressableScale onPress={open} accessibilityRole="button" accessibilityLabel={`${charity.nameEn}, featured. ${where}`} style={styles.featured}>
        <CharityImage charity={charity} live={live} rounded={false} style={{ aspectRatio: 4 / 4.4, width: "100%" }} />
        <LinearGradient colors={["rgba(16,40,72,0)", "rgba(16,40,72,0.78)"]} locations={[0.3, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.cover}>
          <View style={styles.kickerPill}><Text style={styles.coverKicker}>In the spotlight</Text></View>
          <Text style={styles.coverName}>{charity.nameEn}</Text>
          <Text style={styles.coverWhere} numberOfLines={2}>{where}</Text>
          <Receipt18a issues18a={charity.issues18a} light />
        </View>
      </PressableScale>
    );
  }
  return (
    <PressableScale onPress={open} accessibilityRole="button" accessibilityLabel={`${charity.nameEn}. ${where}`} style={last ? styles.row : [styles.row, styles.rule]} to={0.98}>
      <CharityImage charity={charity} live={live} compact style={styles.thumb} />
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
  featured: { borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.lilacSoft },
  cover: { position: "absolute", left: 20, right: 20, bottom: 20, gap: 4 },
  kickerPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.lilac, marginBottom: 4 },
  coverKicker: { fontFamily: fonts.bodySemibold, fontSize: 13, color: colors.ink },
  coverName: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: colors.onInk },
  coverWhere: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: "rgba(255,255,255,0.88)" },
  row: { flexDirection: "row", gap: 16, alignItems: "flex-start", paddingVertical: 16 },
  rule: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  thumb: { width: 92, aspectRatio: 1, borderRadius: 18 },
  rowText: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24, color: colors.blue },
  area: { fontFamily: fonts.bodySemibold, fontSize: 13, letterSpacing: 0.3, color: colors.orangeText },
  receipt: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.successText },
});
