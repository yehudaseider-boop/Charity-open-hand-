import { router } from "expo-router";
import { ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { CheckIcon } from "@/components/icons";
import { Text } from "@/components/text";
import { TopBar } from "@/components/top-bar";
import { Backdrop } from "@/components/backdrop";
import { Bubbles, People } from "@/components/people";
import { GIVE_IN_APP } from "@/lib/give-entry";
import { colors, fonts, radius, space } from "@/theme/tokens";

const steps = [
  { title: "Find a charity", body: "Search by name, cause or area. Every charity page shows whether it issues s18A receipts." },
  GIVE_IN_APP
    ? { title: "Give in the app", body: "Tap Give and choose the amount. You pay on the payment provider's secure page. We never see or store your card details." }
    : { title: "Give on our website", body: "Tap Give and choose the amount. You pay on a secure payment page. We never see or store your card details." },
  { title: "Back in the app", body: "Sign in with the email you gave with. Every donation, and how you are doing against your giving goal, shows up here." },
  { title: "Get your receipt", body: "If the charity issues s18A receipts, you get one annual receipt covering all your donations to it." },
];

/** How it works: four plain steps, then the fee promise, in the For charities page's look (30/10/2026). */
export default function HowItWorks() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return (
    <View style={styles.screen}>
      <Backdrop variant="page" />
      <TopBar title="How it works" fallback="/discover" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: insets.bottom + 32, gap: space.block }}>
        <View style={styles.hero}>
          <Bubbles
            items={[
              { size: 150, color: colors.peach, at: { right: -50, top: -46 } },
              { size: 14, color: colors.orange, float: true, at: { right: 34, top: 26 } },
              { size: 26, color: colors.blue, ring: true, float: true, at: { left: 18, bottom: 26 } },
              { size: 10, color: colors.blue, float: true, at: { right: 60, bottom: 50 } },
            ]}
          />
          <Text style={styles.heroTitle} accessibilityRole="header">
            Generosity made <Text style={styles.key}>simple</Text>.
          </Text>
          <People name="checklist" width={Math.min(250, width - space.gutter * 2 - 60)} style={styles.heroArt} />
        </View>

        <View style={{ gap: 12 }}>
          {steps.map((s, i) => (
            <View key={s.title} style={[styles.step, i % 2 === 1 && styles.stepAlt]}>
              <View style={styles.number}><Text style={styles.numberText}>{i + 1}</Text></View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.stepTitle}>{s.title}</Text>
                <Text variant="bodyMuted">{s.body}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* The fee promise on the website's blue colour-block card, a ring and a dot bleeding off its edges. */}
        <View style={styles.promise}>
          <Bubbles
            items={[
              { size: 90, color: colors.lilac, ring: true, at: { right: -30, bottom: -34 } },
              { size: 14, color: colors.orange, float: true, at: { right: 26, top: 20 } },
            ]}
          />
          <View style={styles.promiseTick}><CheckIcon color={colors.blue} /></View>
          <Text style={styles.promiseText}>Givezy charges no fee on donations. You can choose to add a contribution to Givezy.</Text>
        </View>

        <Button variant="cta" label="Find a charity" onPress={() => router.dismissTo("/discover")} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  hero: { backgroundColor: colors.lilacSoft, borderRadius: radius.card, paddingTop: 24, paddingHorizontal: 22, overflow: "hidden", gap: 10 },
  heroTitle: { fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 39, letterSpacing: -0.4, color: colors.navy, paddingRight: 30 },
  key: { fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 39, letterSpacing: -0.4, color: colors.blue },
  heroArt: { alignSelf: "center", marginBottom: -2 },
  step: { flexDirection: "row", gap: 14, alignItems: "flex-start", padding: 18, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface },
  stepAlt: { backgroundColor: colors.lilacSoft },
  stepTitle: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24, color: colors.navy },
  number: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center", borderBottomWidth: 3, borderBottomColor: colors.navy },
  numberText: { fontFamily: fonts.displayBold, fontSize: 18, color: colors.onInk },
  promise: { gap: 12, padding: 22, borderRadius: radius.card, backgroundColor: colors.blue, overflow: "hidden" },
  promiseTick: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  promiseText: { fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 25, color: colors.onInk, paddingRight: 24 },
});
