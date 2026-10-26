import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, fonts, radius } from "@/theme/tokens";
import { ChartIcon, ChevronIcon } from "./icons";
import { Text } from "./text";

/** The way into "Your giving" (insights), the same on Progress and on Account. */
export function InsightsLink() {
  return (
    <Pressable onPress={() => router.push("/insights")} accessibilityRole="button" accessibilityLabel="Your giving insights" style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}>
      <View style={styles.icon}><ChartIcon color={colors.blue} size={24} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.title}>Your giving insights</Text>
        <Text variant="label">Month by month, where it went and how you give</Text>
      </View>
      <ChevronIcon color={colors.blue} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 76, padding: 16, borderRadius: radius.card, backgroundColor: colors.lilacSoft, borderWidth: 1.5, borderColor: colors.lightPurple },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 22, color: colors.ink },
});
