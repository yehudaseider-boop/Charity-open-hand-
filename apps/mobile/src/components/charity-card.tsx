import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { haptic } from "@/lib/haptics";
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
/** A small "Give" pill beside the card, so the donor can give without opening the charity's page first. */
function GiveButton({ charity, onGive, light = false }: { charity: Charity; onGive: (c: Charity) => void; light?: boolean }) {
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        onGive(charity);
      }}
      accessibilityRole="button"
      accessibilityLabel={`Give to ${charity.nameEn}`}
      hitSlop={6}
      style={({ pressed }) => [styles.give, light && styles.giveLight, pressed && { opacity: 0.7 }]}
    >
      <Text style={[styles.giveText, light && { color: colors.blue }]}>Give</Text>
    </Pressable>
  );
}

export function CharityCard({ charity, featured = false, live = false, last = false, onGive }: { charity: Charity; featured?: boolean; live?: boolean; last?: boolean; onGive?: (c: Charity) => void }) {
  const open = () => router.push(`/charity/${charity.slug}`);
  const where = [charity.area, charity.cause].filter(Boolean).join(" · ");
  if (featured) {
    return (
      <View>
      <PressableScale onPress={open} accessibilityRole="button" accessibilityLabel={`${charity.nameEn}, featured. ${where}`} style={styles.featured}>
        <CharityImage charity={charity} live={live} rounded={false} bare style={{ aspectRatio: 4 / 4.4, width: "100%" }} />
        <LinearGradient colors={["rgba(16,40,72,0)", "rgba(16,40,72,0.88)"]} locations={[0.2, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.cover}>
          <View style={styles.kickerPill}><Text style={styles.coverKicker}>In the spotlight</Text></View>
          <Text style={styles.coverName} numberOfLines={3}>{charity.nameEn}</Text>
          <Text style={styles.coverWhere} numberOfLines={2}>{where}</Text>
          <Receipt18a issues18a={charity.issues18a} light />
        </View>
      </PressableScale>
      {/* A sibling, not inside the card, so screen readers reach it on its own. */}
      {onGive ? <View style={styles.coverGive}><GiveButton charity={charity} onGive={onGive} light /></View> : null}
      </View>
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
        {/* For the donor who doesn't need to read more: give straight from the list. */}
        {onGive ? <View style={{ alignSelf: "flex-start", marginTop: 8 }}><GiveButton charity={charity} onGive={onGive} /></View> : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  featured: { borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.lilacSoft },
  cover: { position: "absolute", left: 20, right: 20, bottom: 20, gap: 4 },
  kickerPill: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.lilac, marginBottom: 4 },
  coverKicker: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.ink },
  coverName: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, color: colors.onInk },
  coverWhere: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.onInk },
  row: { flexDirection: "row", gap: 16, alignItems: "flex-start", paddingVertical: 16 },
  give: { minHeight: 40, minWidth: 72, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.blue, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  giveLight: { borderColor: colors.surface },
  giveText: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.blue },
  coverGive: { position: "absolute", top: 16, right: 16 },
  rule: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  thumb: { width: 92, aspectRatio: 1, borderRadius: 18 },
  rowText: { flex: 1, gap: 2 },
  name: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24, color: colors.blue },
  area: { fontFamily: fonts.bodySemibold, fontSize: 14, letterSpacing: 0.2, color: colors.orangeText },
  receipt: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.successText },
});
