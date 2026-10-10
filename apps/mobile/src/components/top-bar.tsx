import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, space, touch } from "@/theme/tokens";
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
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <View style={{ width: touch }} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space.gutter - 12, paddingBottom: 4, backgroundColor: colors.parchment },
  back: { width: touch, height: touch, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: "Archivo_600SemiBold", fontSize: 17, color: colors.ink },
});
