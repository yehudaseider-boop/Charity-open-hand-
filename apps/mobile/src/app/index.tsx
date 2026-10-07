import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, TextLink } from "@/components/button";
import { DottedArc } from "@/components/dotted-arc";
import { Logo } from "@/components/logo";
import { PlaceholderImage } from "@/components/placeholder-image";
import { Text } from "@/components/text";
import { colors, space } from "@/theme/tokens";

/** Screen 1: Welcome. The cleanest screen in the app. */
export default function Welcome() {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <PlaceholderImage subject="Shabbos table" rounded={false} labelPosition="top" labelOffset={insets.top + 64} style={StyleSheet.absoluteFill} />
        <LinearGradient
          colors={["rgba(244,251,250,0)", "rgba(244,251,250,0.6)", colors.parchment]}
          locations={[0.35, 0.7, 1]}
          style={StyleSheet.absoluteFill}
        />
        <View style={[styles.logo, { top: insets.top + 12 }]}>
          <Logo />
        </View>
      </View>

      <View style={[styles.content, { paddingBottom: insets.bottom + space.md }]}>
        <View style={styles.arc}>
          <DottedArc size={240} />
        </View>
        <Text variant="hero" accessibilityRole="header">
          Give to the causes that carry our community.
        </Text>
        <Text variant="bodyMuted" style={styles.support}>
          Your gift goes straight to the charity. No sign-up needed to give.
        </Text>
        <View style={styles.actions}>
          <Button label="Find a charity" onPress={() => router.push("/discover")} />
          <TextLink label="How it works" onPress={() => router.push("/how-it-works")} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment, overflow: "hidden" },
  hero: { flex: 1, minHeight: 300 },
  logo: { position: "absolute", left: space.gutter, zIndex: 2 },
  content: { paddingHorizontal: space.gutter, marginTop: -40 },
  arc: { position: "absolute", top: -64, right: -40 },
  support: { marginTop: 12, fontSize: 17, lineHeight: 25 },
  actions: { marginTop: space.block, gap: 4 },
});
