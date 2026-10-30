import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStatusCover } from "@/components/status-cover";
import { RaisingNowRow } from "@/components/raising-now";
import { CharityPhotoCard, CheckedBadge } from "@/components/charity-photo-card";
import { CharityImage } from "@/components/charity-image";
import { GiveSheet } from "@/components/give-sheet";
import { GIVE_IN_APP, openGiveScreen } from "@/lib/give-entry";
import { Sheet } from "@/components/sheet";
import type { Charity } from "@/data/sample";
import { FadeUp } from "@/components/fade-up";
import { PressableScale } from "@/components/pressable-scale";
import { SearchIcon, StarIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingList, OfflineNote, SkeletonBlock } from "@/components/states";
import { Text } from "@/components/text";
import { useDirectory } from "@/lib/directory";
import { haptic } from "@/lib/haptics";
import { loadCausePrefs } from "@/lib/cause-prefs";
import { causesFirst, inCause } from "@/lib/live-charities";
import { useScreenState } from "@/lib/screen-state";
import { SeasonalCard } from "@/components/day-greeting";
import { Bubbles, People } from "@/components/people";
import { colors, fonts, radius, space, touch } from "@/theme/tokens";

/**
 * Discover, in the For charities page's look (30/10/2026): a soft lilac header with the key word in blue,
 * someone giving and the search, then cause chips, campaigns raising now, the cause of the week as a blue
 * colour block, and every charity as a soft photo card.
 */
export default function Discover() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const status = useStatusCover();
  const demoState = useScreenState();
  const directory = useDirectory();
  const { live } = directory;
  // Live: the state comes from loading the directory; preview keeps the design-review states.
  const state = !live ? demoState : directory.data ? "ready" : directory.failed ? "error" : "loading";
  const charities = useMemo(() => directory.data?.charities ?? [], [directory.data]);
  const causes = directory.data?.causes ?? [{ id: "all", label: "All" }];
  const [query, setQuery] = useState(state === "empty" ? "Bnei Akiva" : "");
  const [cause, setCause] = useState("all");
  // The charity whose "Give" was tapped in the list: the same give sheet as on its page.
  const [giveTo, setGiveTo] = useState<Charity | null>(null);
  const onGive = (c: Charity) => (GIVE_IN_APP ? openGiveScreen(c.slug) : setGiveTo(c));

  // The causes picked on first open: those charities come first (nothing is hidden).
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    loadCausePrefs().then(setPicked);
  }, []);
  const searching = query.trim().length > 0;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = charities.filter(
      (c) =>
        inCause(c, cause) &&
        (!q || c.nameEn.toLowerCase().includes(q) || c.cause.toLowerCase().includes(q) || c.area.toLowerCase().includes(q)),
    );
    return !q && cause === "all" ? causesFirst(found, picked) : found;
  }, [query, cause, charities, picked]);

  const featured = !searching && cause === "all" ? results.find((c) => c.featured) : undefined;
  // Only say "the causes you chose, first" when at least one charity is in them.
  const sortedByCauses = !searching && cause === "all" && results.some((c) => picked.some((p) => inCause(c, p)));
  const noneYet = live && charities.length === 0;
  const rest = results.filter((c) => c !== featured);

  return (
    <>
      <ScrollView
        style={styles.screen}
        onScroll={status.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={live ? <RefreshControl refreshing={directory.refreshing} onRefresh={directory.refresh} /> : undefined}
      >
        <View style={[styles.gutter, { gap: 14 }]}>
          <View style={styles.hero}>
            <Bubbles
              items={[
                { size: 170, color: colors.peach, at: { right: -60, top: -70 } },
                { size: 14, color: colors.orange, float: true, at: { right: 30, top: 24 } },
                { size: 26, color: colors.blue, ring: true, float: true, at: { left: width < 360 ? 150 : 170, top: 70 } },
                { size: 9, color: colors.blue, float: true, at: { right: 118, top: 44 } },
              ]}
            />
            <View style={styles.heroTop}>
              <Text style={styles.title} accessibilityRole="header">
                Find a <Text style={[styles.title, { color: colors.blue }]}>cause</Text>
              </Text>
              <People name="loveIt" width={64} style={styles.heroArt} />
            </View>
            <View style={styles.search}>
              <SearchIcon />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search by name, cause or area"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Search charities"
                returnKeyType="search"
                style={styles.searchInput}
              />
            </View>
          </View>
          {directory.offlineSince ? <OfflineNote savedAt={directory.offlineSince} /> : null}
          <SeasonalCard />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} accessibilityRole="radiogroup">
          {causes.map((c) => {
            const on = cause === c.id;
            return (
              <Pressable key={c.id} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { haptic.tap(); setCause(c.id); }} style={[styles.chip, on && styles.chipOn]}>
                <Text style={[styles.chipText, on && { color: colors.onInk }]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.gutter}>
          {state === "loading" ? (
            <View style={{ gap: space.block }}>
              <SkeletonBlock height={258} />
              <LoadingList count={2} imageHeight={99} />
            </View>
          ) : state === "error" ? (
            <ErrorState body="We couldn't load the charities. Check your connection and try again." onRetry={() => (live ? directory.retry() : router.replace("/discover"))} />
          ) : noneYet ? (
            <EmptyState art="dreamGift" title="Charities are on their way" body="The first charities are joining Givezy. Check back soon." />
          ) : results.length === 0 ? (
            <EmptyState
              art="checklist"
              title="No charities found"
              body={query.trim() ? `Nothing matches "${query.trim()}". Try another name or a different cause.` : "No charities in this cause yet. Try another one."}
              action={{ label: "Clear search", onPress: () => { setQuery(""); setCause("all"); } }}
            />
          ) : (
            <View style={{ gap: space.block }}>
              {!query && cause === "all" && directory.data?.raising.length ? (
                <View style={{ marginHorizontal: -space.gutter }}>
                  <RaisingNowRow items={directory.data.raising} />
                </View>
              ) : null}
              {featured ? (
                <FadeUp index={0}>
                  <CauseOfTheWeek charity={featured} live={live} />
                </FadeUp>
              ) : null}
              <View style={{ gap: 14 }}>
                {rest.length ? <Text style={styles.listHead} accessibilityRole="header">{cause === "all" && !searching ? (sortedByCauses ? "Charities for the causes you chose, first" : "More charities") : `${rest.length} ${rest.length === 1 ? "charity" : "charities"}`}</Text> : null}
                {rest.map((c, i) => (
                  <FadeUp key={c.slug} index={i + 1}>
                    <CharityPhotoCard charity={c} live={live} onGive={onGive} />
                  </FadeUp>
                ))}
              </View>
              {live ? null : <Text variant="label" style={{ textAlign: "center", marginTop: 8 }}>Sample charities (demo data)</Text>}
            </View>
          )}
        </View>
        <Sheet visible={giveTo !== null} onClose={() => setGiveTo(null)}>
          {giveTo ? <GiveSheet charityName={giveTo.nameEn} slug={giveTo.slug} onDone={() => setGiveTo(null)} /> : null}
        </Sheet>
      </ScrollView>
      {status.cover}
    </>
  );
}

/**
 * The featured charity as the website's blue colour-block card: its photo inset at the top with the checked
 * badge, a "Cause of the week" tag, and its name in white, with a lavender ring and an orange dot bleeding off
 * the edges, so it stands apart from the soft cards below.
 */
function CauseOfTheWeek({ charity, live }: { charity: Charity; live: boolean }) {
  return (
    <PressableScale onPress={() => router.push(`/charity/${charity.slug}`)} accessibilityRole="button" accessibilityLabel={`Cause of the week: ${charity.nameEn}. ${charity.cause}`} style={styles.week} to={0.98}>
      <Bubbles
        items={[
          { size: 90, color: colors.lilac, ring: true, at: { right: -40, bottom: -44 } },
          { size: 16, color: colors.orange, float: true, at: { right: 26, bottom: 84 } },
        ]}
      />
      <View style={styles.weekPhoto}>
        <CharityImage charity={charity} live={live} rounded={false} bare style={StyleSheet.absoluteFill} />
        <CheckedBadge issues18a={charity.issues18a} style={styles.weekBadge} />
      </View>
      <View style={styles.weekBody}>
        <View style={styles.weekTag}>
          <StarIcon size={15} color={colors.navy} />
          <Text style={styles.weekTagText}>Cause of the week</Text>
        </View>
        <Text style={styles.weekName} numberOfLines={3}>{charity.nameEn}</Text>
        <Text style={styles.weekLine} numberOfLines={2}>{charity.cause}</Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  gutter: { paddingHorizontal: space.gutter },
  hero: { backgroundColor: colors.lilacSoft, borderRadius: radius.card, padding: 16, paddingTop: 20, gap: 14, overflow: "hidden" },
  heroTop: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingHorizontal: 4 },
  heroArt: { marginBottom: -6 },
  title: { fontFamily: fonts.displayBold, fontSize: 38, lineHeight: 42, letterSpacing: -0.6, color: colors.navy, flexShrink: 1 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: touch + 6, paddingHorizontal: 16, borderRadius: radius.control, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.lightPurple },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: colors.ink, paddingVertical: 12, outlineStyle: "none" } as object,
  chips: { gap: 8, paddingHorizontal: space.gutter, paddingTop: 20, paddingBottom: space.block },
  chip: { minHeight: 44, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface, justifyContent: "center" },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.navy },
  listHead: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, letterSpacing: -0.3, color: colors.navy },
  week: { borderRadius: radius.card, overflow: "hidden", padding: 10, backgroundColor: colors.blue },
  weekPhoto: { height: 190, borderRadius: radius.card - 6, overflow: "hidden", backgroundColor: colors.lilacSoft, borderWidth: 2, borderColor: colors.blueTrack },
  weekBadge: { position: "absolute", left: 10, top: 10 },
  weekBody: { paddingHorizontal: 12, paddingTop: 16, paddingBottom: 14, gap: 4 },
  weekTag: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginBottom: 8, paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.lilac },
  weekTagText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.navy },
  weekName: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.5, color: colors.onInk, paddingRight: 24 },
  weekLine: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22, color: colors.lilacSoft, paddingRight: 40 },
});


/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
