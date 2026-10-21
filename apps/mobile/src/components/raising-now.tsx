import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { rand } from "@/lib/format";
import { campaignPercent, type RaisingNow } from "@/lib/live-charities";
import { colors, fonts, radius, space } from "@/theme/tokens";
import { Text } from "./text";

/**
 * "Raising now" on Discover: the campaigns charities are running, with their goal bars, so donors
 * see them without opening each charity. Tapping one opens the charity's page, where its campaigns are.
 */
export function RaisingNowRow({ items }: { items: RaisingNow[] }) {
  if (!items.length) return null;
  return (
    <View style={{ gap: 12 }}>
      <Text variant="h2" style={{ fontSize: 22, lineHeight: 28, paddingHorizontal: space.gutter }} accessibilityRole="header">Raising now</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: space.gutter }}>
        {items.map(({ campaign: c, charity }) => {
          const pct = campaignPercent(c);
          return (
            <Pressable
              key={c.id}
              onPress={() => router.push({ pathname: "/charity/[slug]", params: { slug: charity.slug } })}
              accessibilityRole="button"
              accessibilityLabel={`${c.title}, ${charity.nameEn}. ${rand(c.raisedCents)} raised${c.targetCents ? ` of ${rand(c.targetCents)}` : ""}.`}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.charity} numberOfLines={1}>{charity.nameEn}</Text>
              <Text style={styles.title} numberOfLines={2}>{c.title}</Text>
              <View style={{ flex: 1 }} />
              <Text style={styles.figures} numberOfLines={1}>
                <Text style={styles.raised}>{rand(c.raisedCents)}</Text>
                {c.targetCents ? ` of ${rand(c.targetCents)}` : " raised"}
              </Text>
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
  card: { width: 240, minHeight: 150, padding: 16, gap: 4, borderRadius: radius.card, backgroundColor: colors.lilacSoft, borderWidth: 1, borderColor: colors.lilac },
  charity: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.blue },
  title: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24, color: colors.blue },
  figures: { fontFamily: fonts.body, fontSize: 15, color: colors.ink, marginTop: 6 },
  raised: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.ink },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surface, overflow: "hidden", marginTop: 6 },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.blue },
});
