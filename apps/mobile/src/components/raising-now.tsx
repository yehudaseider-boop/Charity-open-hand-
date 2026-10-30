import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { rand } from "@/lib/format";
import { campaignPercent, type RaisingNow } from "@/lib/live-charities";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { Text } from "./text";

/**
 * "Raising now" on Discover: the campaigns charities are running, with their goal bars, so donors
 * see them without opening each charity. Tapping one opens the charity's page, where its campaigns are.
 * Soft pastel cards (pale lilac and peach in turn), the raised amount large in blue, as on the website.
 */
export function RaisingNowRow({ items }: { items: RaisingNow[] }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ paddingHorizontal: space.gutter }}>
        <Text style={styles.head} accessibilityRole="header">
          Raising <Text style={[styles.head, { color: colors.blue }]}>now</Text>
        </Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: space.gutter }}>
        {items.map(({ campaign: c, charity }, i) => {
          const pct = campaignPercent(c);
          return (
            <Pressable
              key={c.id}
              onPress={() => router.push({ pathname: "/charity/[slug]", params: { slug: charity.slug } })}
              accessibilityRole="button"
              accessibilityLabel={`${c.title}, ${charity.nameEn}. ${rand(c.raisedCents)} raised${c.targetCents ? ` of ${rand(c.targetCents)}` : ""}.`}
              style={({ pressed }) => [styles.card, { backgroundColor: i % 2 ? colors.peach : colors.lilacSoft }, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.charity} numberOfLines={1}>{charity.nameEn}</Text>
              <Text style={styles.title} numberOfLines={2}>{c.title}</Text>
              <View style={{ flex: 1, minHeight: 10 }} />
              <Text style={styles.raised} numberOfLines={1} adjustsFontSizeToFit>{rand(c.raisedCents)}</Text>
              <Text style={styles.figures} numberOfLines={1}>{c.targetCents ? `of ${rand(c.targetCents)}` : "raised"}</Text>
              {c.targetCents ? (
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.max(pct, 3)}%` }]} />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, letterSpacing: -0.3, color: colors.navy },
  card: { width: 240, minHeight: 186, padding: 20, gap: 4, borderRadius: radius.card },
  charity: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  title: { fontFamily: fonts.display, fontSize: 20, lineHeight: 24, letterSpacing: -0.2, color: colors.navy },
  raised: { fontFamily: fonts.displayBold, fontVariant: ["tabular-nums"], fontSize: 28, lineHeight: 32, color: colors.blue },
  figures: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.muted },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: "hidden", marginTop: 8 },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.blue },
});
