import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { pullToRefresh, RefreshDrops } from "@/components/refresh-drops";
import { StoryDeck } from "@/components/story-deck";
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
import { EmptyState, ErrorState, LoadingList, LoadingNote, OfflineNote, SkeletonBlock } from "@/components/states";
import { Text } from "@/components/text";
import { SEARCH_MAX_LENGTH, useDirectory } from "@/lib/directory";
import { matchesSearch } from "@shared/charity/search-text";
import { haptic } from "@/lib/haptics";
import { loadCausePrefs } from "@/lib/cause-prefs";
import { causesFirst, inCause } from "@/lib/live-charities";
import { useScreenState } from "@/lib/screen-state";
import { useRequestsOpen } from "@/lib/charity-request";
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
  const [query, setQuery] = useState(state === "empty" ? "Moon base" : "");
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
  // "Ask us to add a charity" (15/11/2026): shown only once our server says requests are open.
  const requestsOpen = useRequestsOpen();
  const askToAdd = () => {
    haptic.tap();
    router.push({ pathname: "/request-charity", params: query.trim() ? { name: query.trim() } : {} });
  };

  const results = useMemo(() => {
    const q = query.trim();
    // Capitals, accents and signs between words don't matter, as on the website ("cafe" finds "Café").
    const found = charities.filter((c) => inCause(c, cause) && (!q || matchesSearch(q, [c.nameEn, c.cause, c.area])));
    return !q && cause === "all" ? causesFirst(found, picked) : found;
  }, [query, cause, charities, picked]);

  const featured = !searching && cause === "all" ? results.find((c) => c.featured) : undefined;
  // Only say "the causes you chose, first" when at least one charity is in them.
  const sortedByCauses = !searching && cause === "all" && results.some((c) => picked.some((p) => inCause(c, p)));
  const noneYet = live && charities.length === 0;
  // Kept between renders unless the charities or the search change (review 24/11/2026), so the list isn't redrawn on every scroll tick.
  const { deck, list, rest } = useMemo(() => {
    const others = results.filter((c) => c !== featured);
    // Swipeable stories first (when not searching and there are enough to swipe through); the list carries on after them.
    const stories = !searching && cause === "all" && others.length >= 3 ? others.slice(0, 8) : [];
    return { deck: stories, list: stories.length ? others.slice(stories.length) : others, rest: others };
  }, [results, featured, searching, cause]);
  // The last branch of the states below: a list with at least one charity.
  const showList = state === "ready" && !noneYet && results.length > 0;
  // The same array between renders unless the list changes, so the list isn't redrawn on every scroll tick (review 24/11/2026).
  const shownList = useMemo(() => (showList ? list : []), [showList, list]);

  return (
    <>
      <RefreshDrops active={directory.refreshing} top={insets.top + 6} />
      <FlatList
        style={styles.screen}
        // Recycling list (24/11/2026): only the cards on screen (and a little either side) are drawn, so 500 charities cost no more than 20.
        data={shownList}
        keyExtractor={(c) => c.slug}
        renderItem={({ item, index }) => (
          <View style={styles.cardRow}>
            <FadeUp index={index < 7 ? index + 1 : 0}>
              <CharityPhotoCard charity={item} live={live} onGive={onGive} />
            </FadeUp>
          </View>
        )}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        onScroll={status.onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={live ? pullToRefresh(directory.refreshing, directory.refresh) : undefined}
        ListFooterComponent={
          <>
            {showList ? (
              <View style={[styles.gutter, { gap: space.block, marginTop: space.block }]}>
                {requestsOpen ? (
                  <Pressable onPress={askToAdd} accessibilityRole="button" accessibilityLabel="Can't find your charity? Ask us to add it" style={({ pressed }) => [styles.askRow, pressed && { opacity: 0.85 }]}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.askTitle}>Can&apos;t find your charity?</Text>
                      <Text style={styles.askLink}>Ask us to add it</Text>
                    </View>
                    <View style={styles.askPlus}><Text style={styles.askPlusText}>+</Text></View>
                  </Pressable>
                ) : null}
                {live ? null : <Text variant="label" style={{ textAlign: "center", marginTop: 8 }}>Sample charities (demo data)</Text>}
              </View>
            ) : null}
            <Sheet visible={giveTo !== null} onClose={() => setGiveTo(null)}>
              {giveTo ? <GiveSheet charityName={giveTo.nameEn} slug={giveTo.slug} onDone={() => setGiveTo(null)} /> : null}
            </Sheet>
          </>
        }
        ListHeaderComponent={
          <>
        <View style={[styles.gutter, { gap: 14 }]}>
          <View style={styles.hero}>
            <Bubbles
              items={[
                { size: 170, color: colors.peach, at: { right: -60, top: -70 } },
                { size: 14, color: colors.orange, float: true, at: { right: 30, top: 24 } },
                { size: 22, color: colors.blue, ring: true, float: true, at: { left: width < 360 ? 120 : 150, top: 18 } },
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
                // As on the website: a search is a few words, and a pasted page of text would push "Ask us to add it" off the screen.
                maxLength={SEARCH_MAX_LENGTH}
                placeholder="Name, cause or area"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Search charities"
                returnKeyType="search"
                style={styles.searchInput}
              />
            </View>
          </View>
          {directory.offlineSince ? <OfflineNote savedAt={directory.offlineSince} /> : null}
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
              <LoadingNote />
              <SkeletonBlock height={258} />
              <LoadingList count={2} imageHeight={99} />
            </View>
          ) : state === "error" ? (
            <ErrorState body="We couldn't load the charities. Check your connection and try again." onRetry={() => (live ? directory.retry() : router.replace("/discover"))} />
          ) : noneYet ? (
            <EmptyState art="dreamGift" title="Charities are on their way" body="The first charities are joining Givezy. Check back soon." away={requestsOpen ? { label: "Ask us to add a charity", onPress: askToAdd } : undefined} />
          ) : results.length === 0 ? (
            <EmptyState
              art="checklist"
              title="No charities found"
              body={query.trim() ? `Nothing matches “${query.trim()}”. Try another name or a different cause.` : "No charities in this cause yet. Try another one."}
              action={requestsOpen && query.trim() ? { label: "Ask us to add it", onPress: askToAdd } : { label: "Clear search", onPress: () => { setQuery(""); setCause("all"); } }}
              away={requestsOpen && query.trim() ? { label: "Clear search", onPress: () => { setQuery(""); setCause("all"); } } : requestsOpen ? { label: "Ask us to add a charity", onPress: askToAdd } : undefined}
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
              {deck.length ? (
                <View style={{ marginHorizontal: -space.gutter }}>
                  <StoryDeck charities={deck} live={live} onGive={onGive} />
                </View>
              ) : null}
              <View style={{ gap: 14 }}>
                {list.length ? <Text style={styles.listHead} accessibilityRole="header">{cause === "all" && !searching ? (sortedByCauses && !deck.length ? "Charities for the causes you chose, first" : deck.length ? "More charities" : "More charities") : `${rest.length} ${rest.length === 1 ? "charity" : "charities"}`}</Text> : null}
              </View>
            </View>
          )}
        </View>
          </>
        }
      />
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
  askRow: { flexDirection: "row", alignItems: "center", gap: 14, padding: 18, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.lilacSoft },
  askTitle: { fontFamily: fonts.display, fontSize: 18, lineHeight: 23, color: colors.navy },
  askLink: { fontFamily: fonts.bodySemibold, fontSize: 16, lineHeight: 22, color: colors.blue },
  askPlus: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.blue, alignItems: "center", justifyContent: "center", borderBottomWidth: 3, borderBottomColor: colors.blueEdge },
  askPlusText: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 28, color: colors.onInk },
  gutter: { paddingHorizontal: space.gutter },
  cardRow: { paddingHorizontal: space.gutter, marginTop: 14 },
  hero: { backgroundColor: colors.lilacSoft, borderRadius: radius.card, padding: 16, paddingTop: 20, gap: 14, overflow: "hidden" },
  heroTop: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingHorizontal: 4 },
  heroArt: { marginBottom: -6 },
  title: { fontFamily: fonts.displayBold, fontSize: 38, lineHeight: 42, letterSpacing: -0.6, color: colors.navy, flexShrink: 1 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: touch + 6, paddingHorizontal: 16, borderRadius: radius.control, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.outline },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: colors.ink, paddingVertical: 12, outlineStyle: "none" } as object,
  chips: { gap: 8, paddingHorizontal: space.gutter, paddingTop: 20, paddingBottom: space.block },
  chip: { minHeight: 44, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.outline, backgroundColor: colors.surface, justifyContent: "center" },
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
