import { router } from "expo-router";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { CheckIcon } from "@/components/icons";
import { Text } from "@/components/text";
import { TopBar } from "@/components/top-bar";
import { feeSettings } from "@/config/fees";
import { rand } from "@/lib/format";
import { colors, radius, space } from "@/theme/tokens";

const steps = [
  { title: "Find a charity", body: "Search by name or cause, in English or Hebrew. Every charity page shows whether it issues 18A receipts." },
  { title: "Choose your amount", body: `Give once or every month. The minimum donation is ${rand(feeSettings.minDonationCents)}. You don't need an account to give once.` },
  { title: "Give securely", body: "You pay on the payment provider's secure page. We never see or store your card details." },
  { title: "Get your receipt", body: "If the charity issues 18A receipts, you get one annual receipt from the charity covering all your donations to it." },
];

/** How it works: four plain steps, then the fee promise. */
export default function HowItWorks() {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.screen}>
      <TopBar title="How it works" fallback="/" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: insets.bottom + 32, gap: space.block }}>
        <Text variant="h1" accessibilityRole="header">Generosity made simple.</Text>

        <View style={{ gap: 20 }}>
          {steps.map((s, i) => (
            <View key={s.title} style={styles.step}>
              <View style={styles.number}><Text style={styles.numberText}>{i + 1}</Text></View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: "Archivo_600SemiBold", fontSize: 18 }}>{s.title}</Text>
                <Text variant="bodyMuted">{s.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.promise}>
          <View style={{ marginTop: 3 }}><CheckIcon /></View>
          <Text style={{ flex: 1, fontSize: 17 }}>The charity receives 100% of your donation. A processing fee is added on top, and you see the total before you pay.</Text>
        </View>

        <Button label="Find a charity" onPress={() => router.push("/discover")} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment },
  step: { flexDirection: "row", gap: 14, alignItems: "flex-start" },
  number: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  numberText: { fontFamily: "Archivo_700Bold", fontSize: 17, color: colors.onInk },
  promise: { flexDirection: "row", gap: 10, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
});
