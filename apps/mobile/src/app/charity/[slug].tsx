import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AmountPicker } from "@/components/amount-picker";
import { Button } from "@/components/button";
import { DottedArc } from "@/components/dotted-arc";
import { BackIcon, HeartIcon } from "@/components/icons";
import { PlaceholderImage } from "@/components/placeholder-image";
import { Sheet } from "@/components/sheet";
import { EmptyState } from "@/components/states";
import { Status18a } from "@/components/status-18a";
import { HebrewText, Text } from "@/components/text";
import { causes, findCharity } from "@/data/sample";
import { colors, space, touch } from "@/theme/tokens";

/** Screen 3: charity detail. Screen 4 (amount sheet) rises over it. */
export default function CharityDetail() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ slug: string; sheet?: string; amount?: string; saved?: string }>();
  const charity = findCharity(params.slug);
  const [sheetOpen, setSheetOpen] = useState(params.sheet === "amount");
  const [saved, setSaved] = useState(params.saved === "1");

  if (!charity) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 40, paddingHorizontal: space.gutter }]}>
        <EmptyState title="Charity not found" body="It may have been removed from the directory." action={{ label: "Back to Discover", onPress: () => router.replace("/discover") }} />
      </View>
    );
  }
  const causeLabel = causes.find((c) => c.id === charity.causeId)?.label;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <View>
          <PlaceholderImage subject={charity.photo} rounded={false} labelPosition="top" labelOffset={insets.top + 12} style={{ width: "100%", aspectRatio: 16 / 9, minHeight: 240 }} />
          <LinearGradient colors={["rgba(245,239,228,0)", colors.parchment]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
        </View>

        <View style={styles.body}>
          <View style={styles.arc}><DottedArc size={180} opacity={0.4} /></View>
          {causeLabel ? <Text variant="label" style={{ color: colors.accent }}>{causeLabel}</Text> : null}
          <Text variant="h1" accessibilityRole="header">{charity.nameEn}</Text>
          <HebrewText variant="h2" style={{ color: colors.muted }}>{charity.nameHe}</HebrewText>
          <View style={{ marginTop: 6 }}><Status18a issues18a={charity.issues18a} /></View>

          <View style={styles.paras}>
            <Text>{charity.about[0]}</Text>
            <Text>{charity.about[1]}</Text>
          </View>

          <View style={styles.note}>
            <Text variant="bodyMuted" style={{ fontSize: 16 }}>
              {charity.issues18a
                ? `Gifts qualify for one annual 18A tax receipt, issued in ${charity.nameEn}'s name after the tax year closes.`
                : `${charity.nameEn} is not s18A-approved, so gifts don't get a tax receipt. You can still give.`}
            </Text>
          </View>
          <Text variant="label" style={{ marginTop: 12 }}>Sample charity for design review</Text>
        </View>
      </ScrollView>

      {/* Header controls over the photo */}
      <View style={[styles.topBar, { top: insets.top + 56 }]} pointerEvents="box-none">
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/discover"))} accessibilityRole="button" accessibilityLabel="Back" style={styles.round}>
          <BackIcon />
        </Pressable>
        <Pressable
          onPress={() => setSaved((s) => !s)}
          accessibilityRole="button"
          accessibilityLabel={saved ? "Remove from Giving" : "Save to Giving"}
          accessibilityState={{ selected: saved }}
          style={styles.round}
        >
          <HeartIcon filled={saved} />
        </Pressable>
      </View>

      {/* Sticky give bar */}
      <View style={[styles.giveBar, { paddingBottom: insets.bottom + 12 }]}>
        <Button label="Give" onPress={() => setSheetOpen(true)} />
      </View>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <AmountPicker
          charityName={charity.nameEn}
          initialCustom={params.amount}
          onContinue={(cents, frequency) => {
            setSheetOpen(false);
            router.push({ pathname: "/give/[slug]/checkout", params: { slug: charity.slug, cents: String(cents), frequency } });
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment, overflow: "hidden" },
  body: { paddingHorizontal: space.gutter, marginTop: -24, gap: 4 },
  arc: { position: "absolute", right: -50, top: -40 },
  paras: { gap: 14, marginTop: space.block },
  note: { marginTop: space.block, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.hairline },
  topBar: { position: "absolute", left: space.gutter, right: space.gutter, flexDirection: "row", justifyContent: "space-between" },
  round: { width: touch, height: touch, borderRadius: touch / 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.hairline },
  giveBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.gutter, paddingTop: 12, backgroundColor: colors.parchment, borderTopWidth: 1, borderTopColor: colors.hairline },
});
