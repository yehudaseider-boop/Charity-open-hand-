import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import type { Charity } from "@/data/sample";
import { colors, radius } from "@/theme/tokens";
import { PlaceholderImage } from "./placeholder-image";
import { Status18a } from "./status-18a";
import { Text } from "./text";

/** Component 1: photo-led charity card (4:3 photo). */
export function CharityCard({ charity, featured = false }: { charity: Charity; featured?: boolean }) {
  const open = () => router.push(`/charity/${charity.slug}`);
  if (featured) {
    return (
      <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={`${charity.nameEn}, featured`} style={styles.featured}>
        <PlaceholderImage subject={charity.photo} style={{ aspectRatio: 4 / 3, width: "100%" }} />
        <View style={styles.featuredText}>
          <Text variant="label" style={{ color: colors.accent }}>Featured</Text>
          <Text variant="h1" style={{ fontSize: 28, lineHeight: 34 }}>{charity.nameEn}</Text>
          <Text variant="bodyMuted">{charity.area} · {charity.cause}</Text>
          <Status18a issues18a={charity.issues18a} />
        </View>
      </Pressable>
    );
  }
  return (
    <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={charity.nameEn} style={styles.row}>
      <PlaceholderImage subject={charity.photo} compact style={styles.thumb} />
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
  featured: { gap: 14 },
  featuredText: { gap: 4 },
  row: { flexDirection: "row", gap: 16, alignItems: "flex-start", paddingVertical: 4 },
  thumb: { width: 132, aspectRatio: 4 / 3, borderRadius: radius.control },
  rowText: { flex: 1, gap: 3 },
  name: { fontFamily: "Archivo_800ExtraBold", fontSize: 20, lineHeight: 25, color: colors.ink },
});
