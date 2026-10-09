import { router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CharityCard } from "@/components/charity-card";
import { DottedArc } from "@/components/dotted-arc";
import { FadeUp } from "@/components/fade-up";
import { Logo } from "@/components/logo";
import { SearchIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingList, SkeletonBlock } from "@/components/states";
import { Text } from "@/components/text";
import { useDirectory } from "@/lib/directory";
import { haptic } from "@/lib/haptics";
import { inCause } from "@/lib/live-charities";
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
  const charities = directory.data?.charities ?? [];
  const causes = directory.data?.causes ?? [{ id: "all", label: "All" }];
  const [query, setQuery] = useState(state === "empty" ? "Bnei Akiva" : "");
  const [cause, setCause] = useState("all");

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
      <View style={styles.header}>
        <View style={{ marginBottom: 14 }}><Logo width={112} /></View>
        <View style={{ marginBottom: 6 }}><DayGreeting /></View>
        <Text variant="h1" accessibilityRole="header">Discover</Text>
        <View style={styles.arc}><DottedArc size={160} opacity={0.45} /></View>
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
              style={styles.filter}
            >
              <Text style={[styles.filterText, selected && { color: colors.ink, fontFamily: fonts.bodySemibold }]}>{c.label}</Text>
              <View style={[styles.underline, selected && { backgroundColor: colors.accent }]} />
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={[styles.gutter, { marginTop: space.block }]}>
        {state === "loading" ? (
          <View style={{ gap: space.block }}>
            <SkeletonBlock height={258} />
            <LoadingList count={2} imageHeight={99} />
          </View>
        ) : state === "error" ? (
          <ErrorState body="We couldn't load the charities. Check your connection and try again." onRetry={() => (live ? directory.retry() : router.replace("/discover"))} />
        ) : noneYet ? (
          <EmptyState title="Charities are on their way" body="The first charities are joining NEDIV lev. Check back soon." />
        ) : results.length === 0 ? (
          <EmptyState
            title="No charities found"
            body={`Nothing matches "${query.trim()}". Try another name or a different cause.`}
            action={{ label: "Clear search", onPress: () => { setQuery(""); setCause("all"); } }}
          />
        ) : (
          <View style={{ gap: space.block }}>
            {featured ? (
              <FadeUp index={0}>
                <CharityCard charity={featured} featured live={live} />
              </FadeUp>
            ) : null}
            <View style={{ gap: 20 }}>
              {rest.map((c, i) => (
                <FadeUp key={c.slug} index={i + 1}>
                  <CharityCard charity={c} live={live} />
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
  screen: { flex: 1, backgroundColor: colors.parchment },
  header: { paddingHorizontal: space.gutter, marginBottom: 16, overflow: "hidden" },
  arc: { position: "absolute", right: -30, top: -6 },
  gutter: { paddingHorizontal: space.gutter },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: touch + 4,
    paddingHorizontal: 14,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: colors.ink, paddingVertical: 12, outlineStyle: "none" } as object,
  filters: { paddingHorizontal: space.gutter, gap: 20, marginTop: 12 },
  filter: { minHeight: touch, justifyContent: "center" },
  filterText: { fontFamily: fonts.body, fontSize: 16, color: colors.muted },
  underline: { height: 2, borderRadius: 1, marginTop: 6, backgroundColor: "transparent" },
});
