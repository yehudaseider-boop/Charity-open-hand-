import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import type { Charity } from "@/data/sample";
import { haptic } from "@/lib/haptics";
import { colors, space } from "@/theme/tokens";
import { CharityImage } from "./charity-image";
import { Text } from "./text";

/** "Your charities": the donor's saved charities, one tap from giving. */
export function SavedRow({ charities, live }: { charities: Charity[]; live: boolean }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 12, paddingHorizontal: space.gutter }}
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
            {c.area ? <Text variant="label" numberOfLines={1}>{c.area}</Text> : null}
          </View>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tile: { width: 148, gap: 8 },
  image: { width: 148, aspectRatio: 4 / 3 },
  name: { fontFamily: "Archivo_700Bold", fontSize: 16, lineHeight: 21, color: colors.ink },
});
