import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, TextLink } from "@/components/button";
import { DottedArc } from "@/components/dotted-arc";
import { CheckIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { EmptyState } from "@/components/states";
import { Text } from "@/components/text";
import { FEE_SETTINGS_ARE_SAMPLE, feeSettings } from "@/config/fees";
import { findCharity } from "@/data/sample";
import { rand, randExact } from "@/lib/format";
import { givingKindLabels } from "@/lib/giving";
import { taxYearFor, taxYearRangeLabel } from "@/lib/tax-year";
import { calculateFees } from "@shared/fees";
import { colors, space } from "@/theme/tokens";

/** Screen 6: confirmation. Quiet and warm; the content rises in like a sheet. */
export default function Done() {
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ slug: string; cents?: string; frequency?: string; name?: string; r18a?: string; kind?: string }>();
  const charity = findCharity(p.slug);
  const cents = Number(p.cents);
  const monthly = p.frequency === "monthly";
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(rise, { toValue: 1, duration: 360, useNativeDriver: true }).start();
  }, [rise]);

  let fees: ReturnType<typeof calculateFees> | null = null;
  try {
    fees = calculateFees(cents, feeSettings);
  } catch {
    fees = null;
  }

  if (!charity || !fees) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 40, paddingHorizontal: space.gutter }]}>
        <EmptyState title="Nothing to show" body="This page appears after a donation." action={{ label: "Back to Discover", onPress: () => router.replace("/discover") }} />
      </View>
    );
  }
  const year = taxYearFor(new Date());
  const yearEnd = taxYearRangeLabel(year).split(" to ")[1];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24, paddingHorizontal: space.gutter, flexGrow: 1 }}>
      <Animated.View style={{ flex: 1, gap: space.block, opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }] }}>
        <Logo width={112} />
        <View>
          <View style={styles.arc}><DottedArc size={260} opacity={0.5} /></View>
          <Text variant="hero" accessibilityRole="header" style={{ fontSize: 44, lineHeight: 50 }}>
            Thank you{p.name ? `, ${p.name}` : ""}.
          </Text>
        </View>

        <View style={{ gap: 6 }}>
          <Text variant="amount">{rand(fees.amountCents)}</Text>
          <Text>
            {monthly ? "Every month to " : "To "}
            <Text style={{ fontFamily: "Archivo_600SemiBold" }}>{charity.nameEn}</Text>
          </Text>
          <Text variant="bodyMuted" style={{ fontSize: 16 }}>
            {monthly ? "Charged each month: " : "Charged: "}
            {randExact(fees.totalCents)}, including the processing fee{FEE_SETTINGS_ARE_SAMPLE ? " (sample rate)" : ""}.
          </Text>
        </View>

        <View style={styles.notes}>
          <Note text={`${charity.nameEn} receives 100% of your donation.`} />
          {p.kind === "maaser" || p.kind === "chomesh" || p.kind === "tzedaka" ? (
            <Note text={`Counted as ${givingKindLabels[p.kind].toLowerCase()} on your Giving page.`} />
          ) : null}
          {charity.issues18a ? (
            p.r18a === "1" ? (
              <Note text={`Your donation will be on your annual 18A receipt, issued after the tax year ends on ${yearEnd}.`} />
            ) : (
              <Note text="You didn't ask for an 18A receipt this time. You can add your details later in Account." />
            )
          ) : (
            <Note text={`${charity.nameEn} doesn't issue 18A receipts.`} />
          )}
          <Note text="A confirmation is on its way to your email." />
        </View>

        <View style={{ flex: 1 }} />
        <View style={{ gap: 4 }}>
          <Button label="Done" onPress={() => router.replace("/giving")} />
          <TextLink label="Give to another charity" onPress={() => router.replace("/discover")} />
        </View>
      </Animated.View>
    </ScrollView>
  );
}

function Note({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
      <View style={{ marginTop: 3 }}><CheckIcon /></View>
      <Text style={{ flex: 1, fontSize: 17 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment },
  arc: { position: "absolute", right: -70, top: -50 },
  notes: { gap: 14, paddingTop: space.block - 4, borderTopWidth: 1, borderTopColor: colors.hairline },
});
