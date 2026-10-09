import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { Animated, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { DottedArc } from "@/components/dotted-arc";
import { BackIcon, HeartIcon } from "@/components/icons";
import { CharityImage } from "@/components/charity-image";
import { Sheet } from "@/components/sheet";
import { GiveSheet } from "@/components/give-sheet";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { Status18a } from "@/components/status-18a";
import { Text } from "@/components/text";
import { ddmmyyyy } from "@/lib/format";
import { causeList, useCharity } from "@/lib/directory";
import { haptic } from "@/lib/haptics";
import { reduceMotion } from "@/lib/motion";
import { useSaved } from "@/lib/saved";
import { colors, radius, space, touch } from "@/theme/tokens";

/** Screen 3: charity detail. The give sheet rises over it and hands the donor to the website. */
export default function CharityDetail() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ slug: string; sheet?: string; saved?: string }>();
  const { live, charity, failed, retry } = useCharity(params.slug);
  const [sheetOpen, setSheetOpen] = useState(params.sheet === "give");
  const savedList = useSaved();
  const pop = useRef(new Animated.Value(1)).current;

  if (charity === undefined) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 40, paddingHorizontal: space.gutter, gap: space.block }]}>
        {failed ? (
          <ErrorState body="We couldn't load this charity. Check your connection and try again." onRetry={retry} />
        ) : (
          <>
            <SkeletonBlock height={220} />
            <SkeletonBlock height={120} />
          </>
        )}
      </View>
    );
  }
  if (!charity) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top + 40, paddingHorizontal: space.gutter }]}>
        <EmptyState title="Charity not found" body="It may have been removed from the directory." action={{ label: "Back to Discover", onPress: () => router.replace("/discover") }} />
      </View>
    );
  }
  const causeLabel = causeList().find((c) => c.id === charity.causeId)?.label;
  const photos = charity.photos ?? [];
  const saved = savedList.isSaved(charity.slug);
  const updates = charity.updates ?? [];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }}>
        <View>
          <CharityImage charity={charity} live={live} rounded={false} labelPosition="top" labelOffset={insets.top + 12} style={{ width: "100%", aspectRatio: 16 / 9, minHeight: 240 }} />
          <LinearGradient colors={["rgba(244,251,250,0)", colors.parchment]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
        </View>

        <View style={styles.body}>
          <View style={styles.arc}><DottedArc size={180} opacity={0.4} /></View>
          {causeLabel ? <Text variant="label" style={{ color: colors.accent }}>{causeLabel}</Text> : null}
          <Text variant="h1" accessibilityRole="header">{charity.nameEn}</Text>
          <View style={{ marginTop: 6 }}><Status18a issues18a={charity.issues18a} /></View>

          <View style={styles.paras}>
            {charity.area ? <Text variant="label">{charity.area}</Text> : null}
            {charity.about[0] ? (
              <>
                <Text variant="label" style={{ color: colors.ink }}>What they do</Text>
                <Text>{charity.about[0]}</Text>
              </>
            ) : null}
            {charity.about[1] ? (
              <>
                <Text variant="label" style={{ color: colors.ink, marginTop: 6 }}>How your donation is used</Text>
                <Text>{charity.about[1]}</Text>
              </>
            ) : null}
          </View>

          {updates.length ? (
            <View style={styles.section}>
              <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }} accessibilityRole="header">Latest from them</Text>
              {updates.map((u) => (
                <View key={u.id} style={styles.update}>
                  <Text variant="label">{ddmmyyyy(u.date)}</Text>
                  <Text>{u.body}</Text>
                  {u.photoUrl ? <Image source={{ uri: u.photoUrl }} style={styles.updatePhoto} resizeMode="cover" accessibilityLabel={`Photo with ${charity.nameEn}'s update`} /> : null}
                </View>
              ))}
            </View>
          ) : null}

          {photos.length ? (
            <View style={styles.section}>
              <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }} accessibilityRole="header">Photos</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingRight: space.gutter }} style={{ marginRight: -space.gutter }}>
                {photos.map((ph) => (
                  <View key={ph.id} style={{ width: 220, gap: 6 }}>
                    <Image source={{ uri: ph.url }} style={styles.photo} resizeMode="cover" accessibilityLabel={ph.caption ?? `Photo from ${charity.nameEn}`} />
                    {ph.caption ? <Text variant="label" numberOfLines={2}>{ph.caption}</Text> : null}
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <View style={styles.note}>
            <Text variant="bodyMuted" style={{ fontSize: 16 }}>
              {charity.issues18a
                ? `Donations qualify for one annual 18A tax receipt, issued on ${charity.nameEn}'s behalf after the tax year closes.`
                : `${charity.nameEn} is not s18A-approved, so donations don't get a tax receipt. You can still give.`}
            </Text>
          </View>
          {live ? null : <Text variant="label" style={{ marginTop: 12 }}>Sample charity for design review</Text>}
        </View>
      </ScrollView>

      {/* Header controls over the photo */}
      <View style={[styles.topBar, { top: insets.top + 56 }]} pointerEvents="box-none">
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/discover"))} accessibilityRole="button" accessibilityLabel="Back" style={styles.round}>
          <BackIcon />
        </Pressable>
        <Pressable
          onPress={() => {
            haptic.press();
            // A small pop as the heart fills (skipped when the phone asks for less motion).
            if (!saved && !reduceMotion()) {
              pop.setValue(0.6);
              Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }).start();
            }
            savedList.toggle(charity.slug);
          }}
          accessibilityRole="button"
          accessibilityLabel={saved ? "Remove from your charities" : "Save to your charities"}
          accessibilityState={{ selected: saved }}
          style={[styles.round, saved && styles.roundOn]}
        >
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <HeartIcon filled={saved} size={24} />
          </Animated.View>
        </Pressable>
      </View>

      {/* Sticky give bar */}
      <View style={[styles.giveBar, { paddingBottom: insets.bottom + 12 }]}>
        <Button label="Give" onPress={() => setSheetOpen(true)} />
      </View>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <GiveSheet charityName={charity.nameEn} slug={charity.slug} onDone={() => setSheetOpen(false)} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment, overflow: "hidden" },
  body: { paddingHorizontal: space.gutter, marginTop: -24, gap: 4 },
  arc: { position: "absolute", right: -50, top: -40 },
  paras: { gap: 14, marginTop: space.block },
  section: { marginTop: space.block, gap: 12 },
  update: { gap: 6, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  updatePhoto: { width: "100%", aspectRatio: 4 / 3, borderRadius: radius.control, marginTop: 4, backgroundColor: colors.hairline },
  photo: { width: 220, aspectRatio: 1, borderRadius: radius.card, backgroundColor: colors.hairline },
  note: { marginTop: space.block, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.hairline },
  topBar: { position: "absolute", left: space.gutter, right: space.gutter, flexDirection: "row", justifyContent: "space-between" },
  round: { width: touch, height: touch, borderRadius: touch / 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.hairline },
  roundOn: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  giveBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.gutter, paddingTop: 12, backgroundColor: colors.parchment, borderTopWidth: 1, borderTopColor: colors.hairline },
});
