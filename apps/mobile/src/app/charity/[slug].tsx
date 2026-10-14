import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Animated, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { BackIcon, CheckIcon, HeartIcon } from "@/components/icons";
import { InfoButton } from "@/components/info-button";
import { CharityImage } from "@/components/charity-image";
import { Sheet } from "@/components/sheet";
import { Drop } from "@/components/splash";
import { GiveSheet } from "@/components/give-sheet";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { HebrewText, Text } from "@/components/text";
import { ddmmyyyy } from "@/lib/format";
import { causeList, useCharity } from "@/lib/directory";
import { haptic } from "@/lib/haptics";
import { reduceMotion } from "@/lib/motion";
import { useSaved } from "@/lib/saved";
import { colors, fonts, photoCorners, space, touch } from "@/theme/tokens";

/** Screen 3: charity detail. The give sheet rises over it and hands the donor to the website. */
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text variant="label" style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue}>{value}</Text>
    </View>
  );
}

export default function CharityDetail() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ slug: string; sheet?: string; saved?: string }>();
  const { live, charity, failed, retry } = useCharity(params.slug);
  const [sheetOpen, setSheetOpen] = useState(params.sheet === "give");
  const savedList = useSaved();
  const [pop] = useState(() => new Animated.Value(1));
  const [scrollY] = useState(() => new Animated.Value(0));

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
      <Animated.ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} scrollEventThrottle={16} onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}>
        {/* The photo sits inset on the page with a lilac shape behind it, and the name below it. */}
        <View style={{ paddingTop: insets.top + 56 + touch + 14, paddingHorizontal: space.gutter }}>
          <View style={[styles.dropBack, { pointerEvents: "none" }]}><Drop size={170} color={colors.lilac} rotate={24} /></View>
          <CharityImage charity={charity} live={live} rounded={false} labelPosition="top" style={{ ...photoCorners.big, width: "100%", aspectRatio: 1 / 0.9 }} />
        </View>

        <View style={styles.sheet}>
          <Text variant="h1" accessibilityRole="header" style={{ fontSize: 34, lineHeight: 39 }}>{charity.nameEn}</Text>
          {charity.nameHe ? <HebrewText style={styles.hebrew}>{charity.nameHe}</HebrewText> : null}

          {charity.about[0] ? <Text style={styles.lead}>{charity.about[0]}</Text> : null}
          {charity.about[1] ? (
            <View style={{ gap: 6, marginTop: 18 }}>
              <Text style={styles.kicker}>Where your gift goes</Text>
              <Text>{charity.about[1]}</Text>
            </View>
          ) : null}

          {/* A plain fact sheet, ruled like a form, instead of badges. */}
          <View style={styles.facts}>
            {causeLabel ? <Fact label="Cause" value={causeLabel} /> : null}
            {charity.area ? <Fact label="Area" value={charity.area} /> : null}
            <View style={styles.fact}>
              <Text variant="label" style={styles.factLabel}>Tax receipt</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" }}>
                {charity.issues18a ? <CheckIcon size={16} color={colors.sage} /> : null}
                <Text style={styles.factValue}>{charity.issues18a ? "s18A receipt" : "No s18A receipt"}</Text>
                <InfoButton terms={["s18a"]} />
              </View>
            </View>
          </View>

          {updates.length ? (
            <View style={styles.section}>
              <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }} accessibilityRole="header">What&apos;s been happening</Text>
              {updates.map((u) => (
                <View key={u.id} style={styles.note}>
                  <Text style={styles.noteDate}>{ddmmyyyy(u.date)}</Text>
                  <Text>{u.body}</Text>
                  {u.photoUrl ? (
                    <Image source={{ uri: u.photoUrl }} style={styles.updatePhoto} resizeMode="cover" accessibilityLabel={`Photo with ${charity.nameEn}'s update`} />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          {photos.length ? (
            <View style={styles.section}>
              <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }} accessibilityRole="header">From their week</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingRight: space.gutter, paddingVertical: 4 }} style={{ marginRight: -space.gutter }}>
                {photos.map((ph) => (
                  <View key={ph.id} style={{ width: 220, gap: 8 }}>
                    <Image source={{ uri: ph.url }} style={styles.photo} resizeMode="cover" accessibilityLabel={ph.caption ?? `Photo from ${charity.nameEn}`} />
                    {ph.caption ? <Text style={styles.caption} numberOfLines={2}>{ph.caption}</Text> : null}
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}

          <Text variant="bodyMuted" style={{ fontSize: 15, lineHeight: 22, marginTop: space.block }}>
            {charity.issues18a
              ? `Every donation counts towards one s18A receipt a year, issued on ${charity.nameEn}'s behalf after the tax year closes.`
              : `${charity.nameEn} is not s18A-approved, so donations don't get a tax receipt. You can still give.`}
          </Text>
          {live ? null : <Text variant="label" style={{ marginTop: 12 }}>Sample charity for design review</Text>}
        </View>
      </Animated.ScrollView>

      {/* Once the photo has scrolled away, a cream bar slides in behind the back and heart buttons. */}
      <Animated.View pointerEvents="none" style={[styles.headerBar, { height: insets.top + 56 + touch + 10, opacity: scrollY.interpolate({ inputRange: [180, 260], outputRange: [0, 1], extrapolate: "clamp" }) }]} />

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
        <LinearGradient colors={["rgba(254,253,247,0)", colors.cream]} style={styles.fade} pointerEvents="none" />
        <Button label={`Give to ${charity.nameEn}`} onPress={() => setSheetOpen(true)} />
      </View>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <GiveSheet charityName={charity.nameEn} slug={charity.slug} onDone={() => setSheetOpen(false)} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, overflow: "hidden" },
  dropBack: { position: "absolute", right: space.gutter - 18, top: 80, zIndex: 0 },
  sheet: { paddingHorizontal: space.gutter, paddingTop: 22 },
  hebrew: { fontSize: 19, color: colors.muted, marginTop: 2 },
  lead: { fontSize: 20, lineHeight: 30, color: colors.ink, marginTop: 18 },
  kicker: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.blue },
  facts: { marginTop: space.block, borderTopWidth: 1, borderTopColor: colors.hairline },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, borderBottomWidth: 1, borderBottomColor: colors.hairline, gap: 12 },
  factLabel: { color: colors.muted, flexShrink: 0 },
  factValue: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink, textAlign: "right", flexShrink: 1 },
  section: { marginTop: space.block + 8, gap: 14 },
  note: { gap: 6, paddingLeft: 16, borderLeftWidth: 3, borderLeftColor: colors.lilac },
  noteDate: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.blue },
  updatePhoto: { ...photoCorners.mid, width: "100%", aspectRatio: 4 / 3, marginTop: 6, backgroundColor: colors.lilacSoft },
  photo: { ...photoCorners.mid, width: "100%", aspectRatio: 4 / 4.6, backgroundColor: colors.lilacSoft },
  caption: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.ink, paddingHorizontal: 2 },
  headerBar: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: colors.cream, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  topBar: { position: "absolute", left: space.gutter, right: space.gutter, flexDirection: "row", justifyContent: "space-between" },
  round: { width: touch, height: touch, borderRadius: touch / 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.hairline },
  roundOn: { borderColor: colors.orange, backgroundColor: colors.lilacSoft },
  giveBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.gutter, paddingTop: 12, backgroundColor: colors.cream },
  fade: { position: "absolute", left: 0, right: 0, top: -28, height: 28 },
});
