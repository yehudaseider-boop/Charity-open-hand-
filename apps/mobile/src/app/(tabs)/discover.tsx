import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RaisingNowRow } from "@/components/raising-now";
import { CharityPhotoCard, CheckedBadge } from "@/components/charity-photo-card";
import { CharityImage } from "@/components/charity-image";
import { GiveSheet } from "@/components/give-sheet";
import { GIVE_IN_APP, openGiveScreen } from "@/lib/give-entry";
import { Sheet } from "@/components/sheet";
import type { Charity } from "@/data/sample";
import { FadeUp } from "@/components/fade-up";
import { PressableScale } from "@/components/pressable-scale";
import { SearchIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingList, OfflineNote, SkeletonBlock } from "@/components/states";
import { Text } from "@/components/text";
import { useDirectory } from "@/lib/directory";
import { haptic } from "@/lib/haptics";
import { loadCausePrefs } from "@/lib/cause-prefs";
import { causesFirst, inCause } from "@/lib/live-charities";
import { useScreenState } from "@/lib/screen-state";
import { SeasonalCard } from "@/components/day-greeting";
import { colors, fonts, radius, space, touch } from "@/theme/tokens";

/** Discover: search on lilac, cause chips, the cause of the week, then every charity as a photo card. */
export default function Discover() {
  const insets = useSafeAreaInsets();
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
  const sortedByCauses = picked.length > 0 && cause === "all" && !query.trim();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = charities.filter(
      (c) =>
        inCause(c, cause) &&
        (!q || c.nameEn.toLowerCase().includes(q) || c.cause.toLowerCase().includes(q) || c.area.toLowerCase().includes(q)),
    );
    return !q && cause === "all" ? causesFirst(found, picked) : found;
  }, [query, cause, charities, picked]);

  const featured = !query && cause === "all" ? results.find((c) => c.featured) : undefined;
  const noneYet = live && charities.length === 0;
  const rest = results.filter((c) => c !== featured);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ paddingTop: insets.top + 16, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={live ? <RefreshControl refreshing={directory.refreshing} onRefresh={directory.refresh} /> : undefined}
    >
      <View style={[styles.gutter, { gap: 14 }]}>
        <Text variant="h1" accessibilityRole="header">Find a cause</Text>
        <View style={styles.searchBlock}>
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
          <EmptyState title="Charities are on their way" body="The first charities are joining Givezy. Check back soon." />
        ) : results.length === 0 ? (
          <EmptyState
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
            <View style={{ gap: 16 }}>
              {rest.length ? <Text style={styles.listHead}>{cause === "all" && !query ? (sortedByCauses ? "Charities for the causes you chose, first" : "More charities") : `${rest.length} ${rest.length === 1 ? "charity" : "charities"}`}</Text> : null}
              {rest.map((c, i) => (
                <FadeUp key={c.slug} index={i + 1}>
                  <CharityPhotoCard charity={c} live={live} onGive={onGive} />
                </FadeUp>
              ))}
            </View>
            {live ? null : <Text variant="label" style={{ textAlign: "center", marginTop: 8 }}>Sample charities for design review</Text>}
          </View>
        )}
      </View>
      <Sheet visible={giveTo !== null} onClose={() => setGiveTo(null)}>
        {giveTo ? <GiveSheet charityName={giveTo.nameEn} slug={giveTo.slug} onDone={() => setGiveTo(null)} /> : null}
      </Sheet>
    </ScrollView>
  );
}

/** The featured charity as a big photo with a navy overlay and its name in white. */
function CauseOfTheWeek({ charity, live }: { charity: Charity; live: boolean }) {
  return (
    <PressableScale onPress={() => router.push(`/charity/${charity.slug}`)} accessibilityRole="button" accessibilityLabel={`Cause of the week: ${charity.nameEn}. ${charity.cause}`} style={styles.week} to={0.98}>
      <CharityImage charity={charity} live={live} rounded={false} bare style={StyleSheet.absoluteFill} />
      <View style={styles.weekShade} />
      <CheckedBadge issues18a={charity.issues18a} style={{ alignSelf: "flex-start" }} />
      <View style={{ flex: 1 }} />
      <Text style={styles.weekKicker}>Cause of the week</Text>
      <Text style={styles.weekName} numberOfLines={2}>{charity.nameEn}</Text>
      <Text style={styles.weekLine} numberOfLines={2}>{charity.cause}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  gutter: { paddingHorizontal: space.gutter },
  searchBlock: { padding: 12, borderRadius: radius.card, backgroundColor: colors.lilac },
  search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: touch + 4, paddingHorizontal: 14, borderRadius: radius.control, backgroundColor: colors.surface },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: colors.ink, paddingVertical: 12, outlineStyle: "none" } as object,
  chips: { gap: 8, paddingHorizontal: space.gutter, paddingVertical: space.block },
  chip: { minHeight: 44, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface, justifyContent: "center" },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.navy },
  listHead: { fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 0.3, color: colors.muted },
  week: { minHeight: 300, borderRadius: radius.card, overflow: "hidden", padding: 18, gap: 4 },
  weekShade: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.navy, opacity: 0.55 },
  weekKicker: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.lilac },
  weekName: { fontFamily: fonts.display, fontSize: 30, lineHeight: 35, color: colors.onInk },
  weekLine: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22, color: colors.lilacSoft },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
