import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import type { Charity } from "@/data/sample";
import { colors, fonts, lift, radius } from "@/theme/tokens";
import { CharityImage } from "./charity-image";
import { Status18a } from "./status-18a";
import { Text } from "./text";

/** Component 1: photo-led charity card (4:3 photo). */
export function CharityCard({ charity, featured = false, live = false }: { charity: Charity; featured?: boolean; live?: boolean }) {
  const open = () => router.push(`/charity/${charity.slug}`);
  if (featured) {
    return (
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${charity.nameEn}, featured`} style={styles.featured}>
        <CharityImage charity={charity} live={live} rounded={false} style={{ aspectRatio: 4 / 3, width: "100%" }} />
        <View style={styles.featuredText}>
          <View style={styles.tag}><Text variant="label" style={{ color: colors.blue }}>Featured</Text></View>
          <Text variant="h1" style={{ fontSize: 28, lineHeight: 34 }}>{charity.nameEn}</Text>
          <Text variant="bodyMuted">{[charity.area, charity.cause].filter(Boolean).join(" · ")}</Text>
          <Status18a issues18a={charity.issues18a} />
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={charity.nameEn} style={styles.row}>
      <CharityImage charity={charity} live={live} compact style={styles.thumb} />
      <View style={styles.rowText}>
        <Text style={styles.name}>{charity.nameEn}</Text>
        <Text variant="label">{charity.area}</Text>
        <Text variant="bodyMuted" numberOfLines={2}>{charity.cause}</Text>
        <Status18a issues18a={charity.issues18a} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  featured: { gap: 0, borderRadius: radius.card, backgroundColor: colors.surface, overflow: "hidden", ...lift },
  featuredText: { gap: 6, padding: 20, paddingTop: 16 },
  tag: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.lilacSoft },
  row: { flexDirection: "row", gap: 14, alignItems: "flex-start", padding: 12, borderRadius: radius.card, backgroundColor: colors.surface, ...lift },
  thumb: { width: 120, aspectRatio: 1, borderRadius: radius.control + 4 },
  rowText: { flex: 1, gap: 3 },
  name: { fontFamily: fonts.display, fontSize: 20, lineHeight: 25, color: colors.blue },
});
