import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { Charity } from "@/data/sample";
import { haptic } from "@/lib/haptics";
import { colors, fonts, space } from "@/theme/tokens";
import { CharityImage } from "./charity-image";
import { Text } from "./text";

/** "Your charities": the donor's saved charities, one tap from giving. */
export function SavedRow({ charities, live }: { charities: Charity[]; live: boolean }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingHorizontal: space.gutter }}
      accessibilityLabel="Your charities"
    >
      {charities.map((c) => (
        <Pressable
          key={c.slug}
          onPress={() => {
            haptic.tap();
            router.push(`/charity/${c.slug}`);
          }}
          accessibilityRole="button"
          accessibilityLabel={`${c.nameEn}, saved`}
          style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}
        >
          <CharityImage charity={c} live={live} compact style={styles.image} />
          <View style={{ gap: 2 }}>
            <Text style={styles.name} numberOfLines={2}>{c.nameEn}</Text>
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tile: { width: 96, gap: 8, alignItems: "center" },
  image: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, borderColor: colors.lilac },
  name: { fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 18, color: colors.ink, textAlign: "center" },
});
