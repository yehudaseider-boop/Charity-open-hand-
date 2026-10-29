import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, fonts, space, touch } from "@/theme/tokens";
import { BackIcon } from "./icons";
import { Text } from "./text";

/** Stack screen header: back button and a small title. */
export function TopBar({ title, fallback = "/discover" }: { title: string; fallback?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bar, { paddingTop: insets.top + 4 }]}>
      <Pressable
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as never))}
        accessibilityRole="button"
        accessibilityLabel="Back"
        style={styles.back}
      >
        <BackIcon />
      </Pressable>
      <Text style={styles.title} accessibilityRole="header" numberOfLines={2}>{title}</Text>
      <View style={{ width: touch }} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.gutter - 12, paddingBottom: 4, backgroundColor: "transparent" },
  back: { width: touch, height: touch, alignItems: "center", justifyContent: "center" },
  // A very long charity name stays on two lines, so the screen below doesn't get pushed down.
  title: { flex: 1, textAlign: "center", fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.ink },
});
