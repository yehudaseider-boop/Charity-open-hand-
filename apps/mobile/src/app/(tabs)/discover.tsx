import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CharityCard } from "@/components/charity-card";
import { Splash } from "@/components/splash";
import { HeaderCurve } from "@/components/backdrop";
import { FadeUp } from "@/components/fade-up";
import { Logo } from "@/components/logo";
import { SearchIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingList, SkeletonBlock } from "@/components/states";
import { Text } from "@/components/text";
import { useDirectory } from "@/lib/directory";
import { haptic } from "@/lib/haptics";
import { inCause, savedCharities } from "@/lib/live-charities";
import { useSaved } from "@/lib/saved";
import { SavedRow } from "@/components/saved-row";
import { useScreenState } from "@/lib/screen-state";
import { DayGreeting, SeasonalCard } from "@/components/day-greeting";
import { colors, fonts, radius, space, touch } from "@/theme/tokens";

/** Screen 2: Discover. */
export default function Discover() {
  const insets = useSafeAreaInsets();
  const demoState = useScreenState();
  const directory = useDirectory();
  const { live } = directory;
  // Live: the state comes from loading the directory; preview keeps the design-review states.
  const state = !live ? demoState : directory.data ? "ready" : directory.failed ? "error" : "loading";
  const charities = useMemo(() => directory.data?.charities ?? [], [directory.data]);
  const saved = savedCharities(useSaved().slugs, charities);
  const causes = directory.data?.causes ?? [{ id: "all", label: "All" }];
  const [query, setQuery] = useState(state === "empty" ? "Bnei Akiva" : "");
  const [cause, setCause] = useState("all");
  // Where the filter chips end, so the header curve always sits just under them (the saved row and seasonal card change the height).
  const [chipsEnd, setChipsEnd] = useState<number | null>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return charities.filter(
      (c) =>
        inCause(c, cause) &&
        (!q || c.nameEn.toLowerCase().includes(q) || c.cause.toLowerCase().includes(q) || c.area.toLowerCase().includes(q)),
    );
  }, [query, cause, charities]);

  const featured = !query && cause === "all" ? results.find((c) => c.featured) : undefined;
  const noneYet = live && charities.length === 0;
  const rest = results.filter((c) => c !== featured);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <HeaderCurve depth={chipsEnd ? chipsEnd + 52 : insets.top + 328} />
      {/* Everything above the list, measured so the curve sits just under the chips. */}
      <View onLayout={(e) => setChipsEnd(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
      <View style={styles.header}>
        <View style={{ marginBottom: 18 }}><Logo width={96} /></View>
        <DayGreeting large />
        <View style={styles.arc}><Splash size={84} /></View>
      </View>

      <View style={styles.gutter}>
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
        <View style={{ marginTop: 14 }}><SeasonalCard /></View>
      </View>

      {saved.length && !query ? (
        <View style={{ marginTop: space.block, gap: 12 }}>
          <Text variant="h2" style={{ fontSize: 22, lineHeight: 28, paddingHorizontal: space.gutter }} accessibilityRole="header">Your charities</Text>
          <SavedRow charities={saved} live={live} />
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters} accessibilityRole="tablist">
        {causes.map((c) => {
          const selected = c.id === cause;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => {
                haptic.tap();
                setCause(c.id);
              }}
              style={[styles.filter, selected && styles.filterOn]}
            >
              <Text style={[styles.filterText, selected && { color: colors.onInk, fontFamily: fonts.bodySemibold }]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
      </View>

      <View style={[styles.gutter, { marginTop: space.block + 44 }]}>
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
            {featured ? (
              <FadeUp index={0}>
                <CharityCard charity={featured} featured live={live} />
              </FadeUp>
            ) : null}
            <View>
              {rest.length ? <Text style={styles.listHead}>{cause === "all" && !query ? "More charities" : `${rest.length} ${rest.length === 1 ? "charity" : "charities"}`}</Text> : null}
              {rest.map((c, i) => (
                <FadeUp key={c.slug} index={i + 1}>
                  <CharityCard charity={c} live={live} last={i === rest.length - 1} />
                </FadeUp>
              ))}
            </View>
            {live ? null : <Text variant="label" style={{ textAlign: "center", marginTop: 8 }}>Sample charities for design review</Text>}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  header: { paddingHorizontal: space.gutter, marginBottom: 16 },
  arc: { position: "absolute", right: space.gutter - 4, top: -6, zIndex: 2 },
  gutter: { paddingHorizontal: space.gutter },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: touch + 4,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.lilac,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: colors.ink, paddingVertical: 12, outlineStyle: "none" } as object,
  listHead: { fontFamily: fonts.bodySemibold, fontSize: 14, letterSpacing: 0.3, color: colors.muted, marginBottom: 2 },
  filters: { paddingHorizontal: space.gutter, gap: 10, marginTop: 16, paddingVertical: 4 },
  filter: { minHeight: 44, paddingHorizontal: 18, justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
  filterOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  filterText: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.ink },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
