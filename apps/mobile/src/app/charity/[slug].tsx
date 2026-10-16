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
import { CheckedBadge } from "@/components/charity-photo-card";
import { Blob } from "@/components/blob";
import { CampaignCard } from "@/components/campaign-card";
import { GiveSheet } from "@/components/give-sheet";
import { GIVE_IN_APP, openGiveScreen } from "@/lib/give-entry";
import { openUrl } from "@/lib/open-site";
import { campaignShareText, charityShareText } from "@/lib/share";
import { ShareButton } from "@/components/share-button";
import { donateUrl, SITE_URL } from "@/lib/website";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { HebrewText, Text } from "@/components/text";
import { ddmmyyyy, rand } from "@/lib/format";
import { causeList, useCharity } from "@/lib/directory";
import { haptic } from "@/lib/haptics";
import { reduceMotion } from "@/lib/motion";
import { useSaved } from "@/lib/saved";
import { useJewishMode } from "@/lib/jewish-mode";
import { campaignPercent } from "@/lib/live-charities";
import { colors, fonts, photoCorners, radius, space, touch } from "@/theme/tokens";

/** Charity page: a tall cover photo, the story, what a gift does, the facts, their week, and a sticky Give. */
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
  const jewish = useJewishMode();
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
  const kicker = [causeLabel, charity.area].filter(Boolean).join(" · ");
  const firstCampaign = charity.campaigns?.[0];
  const firstPct = firstCampaign?.targetCents ? campaignPercent(firstCampaign) : null;

  return (
    <View style={styles.screen}>
      <Animated.ScrollView contentContainerStyle={{ paddingBottom: 120 + insets.bottom }} scrollEventThrottle={16} onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}>
        <View style={styles.cover}>
          <CharityImage charity={charity} live={live} rounded={false} bare={Boolean(charity.coverUrl)} style={StyleSheet.absoluteFill} />
          <CheckedBadge issues18a={charity.issues18a} style={styles.badgeOnCover} />
        </View>

        <View style={styles.sheet}>
          {kicker ? <Text style={styles.kickerCaps}>{kicker.toUpperCase()}</Text> : null}
          <Text accessibilityRole="header" style={styles.name}>{charity.nameEn}</Text>
          {jewish && charity.nameHe ? <HebrewText style={styles.hebrew}>{charity.nameHe}</HebrewText> : null}
          {charity.about[0] ? <Text style={styles.lead}>{charity.about[0]}</Text> : null}

          {/* What a gift does, in the charity's own words, and how this month's campaign is going. */}
          {charity.impact || firstCampaign ? (
            <View style={styles.impactCard}>
              <Blob size={100} color={colors.orange} rotate={20} style={{ right: -55, top: -60 }} />
              <Blob size={80} color={colors.lilac} rotate={-15} stretch={1.2} style={{ left: -45, bottom: -55 }} />
              <Text style={styles.impactKicker}>Your rand at work</Text>
              {charity.impact ? <Text style={styles.impactLine}>{charity.impact}</Text> : null}
              {firstCampaign ? (
                <View style={{ gap: 6, marginTop: 6 }}>
                  <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(firstPct ?? 0, 3)}%` }]} /></View>
                  <Text style={styles.impactSub}>
                    {firstCampaign.title} · {rand(firstCampaign.raisedCents)}{firstCampaign.targetCents ? ` of ${rand(firstCampaign.targetCents)} (${firstPct}%)` : " raised"}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {charity.about[1] ? (
            <View style={{ gap: 8, marginTop: space.block }}>
              <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }} accessibilityRole="header">Where your gift goes</Text>
              <Text>{charity.about[1]}</Text>
            </View>
          ) : null}

          {/* A plain fact sheet. */}
          <View style={styles.facts}>
            {causeLabel ? <Fact label="Cause" value={causeLabel} /> : null}
            {charity.area ? <Fact label="Area" value={charity.area} /> : null}
            <View style={[styles.fact, { borderBottomWidth: 0 }]}>
              <Text variant="label" style={styles.factLabel}>Tax receipt</Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" }}>
                {charity.issues18a ? <CheckIcon size={16} color={colors.sage} /> : null}
                <Text style={[styles.factValue, charity.issues18a && { color: colors.blue, fontFamily: fonts.bodyBold }]}>{charity.issues18a ? "s18A receipt" : "No s18A receipt"}</Text>
                <InfoButton terms={["s18a"]} />
              </View>
            </View>
          </View>

          {/* Campaigns come first after the story: they are what the charity is raising for now. */}
          {(charity.campaigns ?? []).length ? (
            <View style={{ gap: 12, marginTop: space.block }}>
              {(charity.campaigns ?? []).map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  shareText={campaignShareText(SITE_URL, charity, { id: c.id, title: c.title, raised: rand(c.raisedCents), target: c.targetCents ? rand(c.targetCents) : null })}
                  onGive={() => (GIVE_IN_APP ? openGiveScreen(charity.slug, { campaign: c.id }) : openUrl(donateUrl(SITE_URL, charity.slug, null, c.id)))} />
              ))}
            </View>
          ) : null}

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

      {/* Once the photo has scrolled away, a white bar slides in behind the round buttons. */}
      <Animated.View pointerEvents="none" style={[styles.headerBar, { height: insets.top + touch + 20, opacity: scrollY.interpolate({ inputRange: [220, 300], outputRange: [0, 1], extrapolate: "clamp" }) }]} />

      {/* Header controls over the photo */}
      <View style={[styles.topBar, { top: insets.top + 10 }]} pointerEvents="box-none">
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/discover"))} accessibilityRole="button" accessibilityLabel="Back" style={styles.round}>
          <BackIcon />
        </Pressable>
        <View style={{ flexDirection: "row", gap: 10 }}>
        <ShareButton variant="round" text={charityShareText(SITE_URL, charity)} label={`Share ${charity.nameEn} on WhatsApp`} />
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
      </View>

      {/* Sticky give bar */}
      <View style={[styles.giveBar, { paddingBottom: insets.bottom + 12 }]}>
        <LinearGradient colors={[colors.creamClear, colors.cream]} style={styles.fade} pointerEvents="none" />
        <Button variant="cta" label={`Give to ${charity.nameEn}`} onPress={() => (GIVE_IN_APP ? openGiveScreen(charity.slug) : setSheetOpen(true))} />
      </View>

      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)}>
        <GiveSheet charityName={charity.nameEn} slug={charity.slug} onDone={() => setSheetOpen(false)} />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, overflow: "hidden" },
  cover: { height: 320, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: "hidden", backgroundColor: colors.lilacSoft },
  badgeOnCover: { position: "absolute", left: space.gutter, bottom: 18 },
  sheet: { paddingHorizontal: space.gutter, paddingTop: 22 },
  kickerCaps: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 0.8, color: colors.blue, marginBottom: 6 },
  name: { fontFamily: fonts.display, fontSize: 34, lineHeight: 39, color: colors.blue },
  hebrew: { fontSize: 19, color: colors.muted, marginTop: 2, textAlign: "right" },
  lead: { fontSize: 18, lineHeight: 27, color: colors.ink, marginTop: 14 },
  impactCard: { marginTop: space.block, padding: 20, gap: 6, borderRadius: radius.card, backgroundColor: colors.blue, overflow: "hidden" },
  impactKicker: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.lilac },
  impactLine: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.onInk },
  impactSub: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.lilacSoft },
  track: { height: 10, borderRadius: 5, backgroundColor: colors.navy, overflow: "hidden" },
  fill: { height: 10, borderRadius: 5, backgroundColor: colors.orange },
  facts: { marginTop: space.block, paddingHorizontal: 16, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface },
  fact: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 52, borderBottomWidth: 1.5, borderBottomColor: colors.lightPurple, gap: 12 },
  factLabel: { color: colors.muted, flexShrink: 0 },
  factValue: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink, textAlign: "right", flexShrink: 1 },
  section: { marginTop: space.block + 8, gap: 14 },
  note: { gap: 6, paddingLeft: 16, borderLeftWidth: 3, borderLeftColor: colors.lilac },
  noteDate: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.blue },
  updatePhoto: { ...photoCorners.mid, width: "100%", aspectRatio: 4 / 3, marginTop: 6, backgroundColor: colors.lilacSoft },
  photo: { ...photoCorners.mid, width: "100%", aspectRatio: 4 / 4.6, backgroundColor: colors.lilacSoft },
  caption: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.ink, paddingHorizontal: 2 },
  headerBar: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: colors.cream, borderBottomWidth: 1.5, borderBottomColor: colors.lightPurple },
  topBar: { position: "absolute", left: space.gutter, right: space.gutter, flexDirection: "row", justifyContent: "space-between" },
  round: { width: touch, height: touch, borderRadius: touch / 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  roundOn: { backgroundColor: colors.lilacSoft },
  giveBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space.gutter, paddingTop: 12, backgroundColor: colors.cream },
  fade: { position: "absolute", left: 0, right: 0, top: -28, height: 28 },
});
