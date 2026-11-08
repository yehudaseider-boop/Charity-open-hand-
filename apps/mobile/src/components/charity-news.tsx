import { router } from "expo-router";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { initials } from "@shared/charity/initials";
import { openGiveScreen } from "@/lib/give-entry";
import type { NewsItem } from "@/lib/charity-news";
import { colors, fonts, radius } from "@/theme/tokens";
import { Text } from "./text";

/**
 * One update from a charity the donor gave to, on Home: who posted it and when, how the donor is connected, the
 * charity's own words, then "Read more" (its page) and "Give again" (the normal give screen, no amount filled in).
 */
export function NewsCard({ item }: { item: NewsItem }) {
  // One colour per charity, so two updates from the same charity look like the same charity.
  const soft = [...item.slug].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 2 === 1;
  return (
    <View style={styles.card}>
      {item.photoUrl ? <Image source={{ uri: item.photoUrl }} style={styles.photo} resizeMode="cover" accessibilityLabel={`Photo with ${item.charityName}'s update`} /> : null}
      <View style={styles.by}>
        <View style={[styles.mark, { backgroundColor: soft ? colors.lilacSoft : colors.peach }]}>
          <Text style={styles.markText}>{initials(item.charityName)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={2}>{item.charityName}</Text>
          <Text style={styles.meta}>{item.when} · {item.relation}</Text>
        </View>
      </View>
      <Text style={styles.body} numberOfLines={5}>{item.body}</Text>
      <View style={styles.actions}>
        <Pressable onPress={() => router.push(`/charity/${item.slug}`)} accessibilityRole="link" accessibilityLabel={`Read more from ${item.charityName}`} hitSlop={8} style={styles.action}>
          <Text style={styles.actionText}>Read more</Text>
        </Pressable>
        <Pressable onPress={() => openGiveScreen(item.slug)} accessibilityRole="button" accessibilityLabel={`Give again to ${item.charityName}`} hitSlop={8} style={styles.action}>
          <Text style={styles.actionText}>Give again</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: "hidden" },
  photo: { width: "100%", height: 140, backgroundColor: colors.lilacSoft },
  by: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingTop: 16 },
  mark: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  markText: { fontFamily: fonts.displayBold, fontSize: 14, color: colors.blue },
  name: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 21, color: colors.ink },
  meta: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19, color: colors.muted },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.ink, paddingHorizontal: 16, paddingTop: 10 },
  actions: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 6 },
  action: { minHeight: 44, justifyContent: "center" },
  actionText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.blue },
});
