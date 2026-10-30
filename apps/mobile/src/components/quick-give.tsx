import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { gifts as sampleGifts } from "@/data/giving";
import type { Charity } from "@/data/sample";
import { useAccount } from "@/lib/account";
import { useDirectory } from "@/lib/directory";
import { GIVE_IN_APP, openGiveScreen } from "@/lib/give-entry";
import { haptic } from "@/lib/haptics";
import { givenBefore, savedCharities } from "@/lib/live-charities";
import { useSaved } from "@/lib/saved";
import { colors, fonts, radius } from "@/theme/tokens";
import { CharityImage } from "./charity-image";
import { BackIcon, SearchIcon } from "./icons";
import { GiveSheet } from "./give-sheet";
import { EmptyState, ErrorState, SkeletonBlock } from "./states";
import { Text } from "./text";

/**
 * The big Give button's sheet: "Who would you like to give to?" Charities the donor gave to
 * before and saved ones come first, one tap each; anyone else is a search away. Choosing one
 * moves straight on to the usual give step for that charity.
 */
export function QuickGive({ onDone }: { onDone: () => void }) {
  const account = useAccount();
  const directory = useDirectory();
  const all = directory.data?.charities ?? [];
  const saved = savedCharities(useSaved().slugs, all);
  const myGifts = account.status === "preview" ? sampleGifts : (account.live?.gifts ?? []);
  const again = givenBefore(myGifts, all);
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<Charity | null>(null);

  if (chosen) {
    return (
      <View style={{ gap: 12 }}>
        <Pressable onPress={() => setChosen(null)} accessibilityRole="button" accessibilityLabel="Choose another charity" style={styles.back} hitSlop={8}>
          <BackIcon size={18} color={colors.blue} />
          <Text style={styles.backText}>Another charity</Text>
        </Pressable>
        <GiveSheet charityName={chosen.nameEn} slug={chosen.slug} onDone={onDone} />
      </View>
    );
  }

  const q = query.trim().toLowerCase();
  const matches = q ? all.filter((c) => c.nameEn.toLowerCase().includes(q) || c.cause.toLowerCase().includes(q) || c.area.toLowerCase().includes(q)) : [];
  const pick = (c: Charity) => {
    haptic.tap();
    if (GIVE_IN_APP) {
      // Straight to the one-screen give step: amount, what it counts as, done.
      onDone();
      openGiveScreen(c.slug);
    } else setChosen(c);
  };
  // Saved ones not already under "Give again".
  const savedOnly = saved.filter((c) => !again.includes(c));

  return (
    <View style={{ gap: 18 }}>
      <Text style={styles.title} accessibilityRole="header">
        Who would you like to <Text style={[styles.title, styles.key]}>give</Text> to?
      </Text>
      <View style={styles.search}>
        <SearchIcon />
        <TextInput value={query} onChangeText={setQuery} placeholder="Search charities" placeholderTextColor={colors.muted} accessibilityLabel="Search charities" style={styles.searchInput} returnKeyType="search" />
      </View>

      {q ? (
        matches.length ? (
          <View>{matches.slice(0, 8).map((c, i) => <Row key={c.slug} charity={c} live={directory.live} last={i === Math.min(matches.length, 8) - 1} onPress={() => pick(c)} />)}</View>
        ) : (
          <EmptyState title="No charities found" body={`Nothing matches "${query.trim()}". Try another name or a different cause.`} action={{ label: "Clear search", onPress: () => setQuery("") }} />
        )
      ) : (
        <>
          {again.length ? <Faces title="Give again" charities={again} live={directory.live} onPick={pick} /> : null}
          {savedOnly.length ? <Faces title="Your charities" charities={savedOnly} live={directory.live} onPick={pick} /> : null}
          <View style={{ gap: 6 }}>
            <Text style={styles.head}>All charities</Text>
            {all.map((c, i) => <Row key={c.slug} charity={c} live={directory.live} last={i === all.length - 1} onPress={() => pick(c)} />)}
            {!all.length && directory.failed ? (
              <ErrorState body="We couldn't load the charities. Check your connection and try again." onRetry={directory.retry} />
            ) : !all.length ? (
              <SkeletonBlock height={120} />
            ) : null}
          </View>
        </>
      )}
    </View>
  );
}

function Faces({ title, charities, live, onPick }: { title: string; charities: Charity[]; live: boolean; onPick: (c: Charity) => void }) {
  return (
    <View style={{ gap: 10 }}>
      <Text style={styles.head}>{title}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
        {charities.map((c) => (
          <Pressable key={c.slug} onPress={() => onPick(c)} accessibilityRole="button" accessibilityLabel={`Give to ${c.nameEn}`} style={({ pressed }) => [styles.face, pressed && { opacity: 0.8 }]}>
            <CharityImage charity={c} live={live} compact style={styles.faceImage} />
            <Text style={styles.faceName} numberOfLines={2}>{c.nameEn}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function Row({ charity, live, last, onPress }: { charity: Charity; live: boolean; last: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Give to ${charity.nameEn}`} style={({ pressed }) => [styles.row, !last && styles.rule, pressed && { opacity: 0.7 }]}>
      <CharityImage charity={charity} live={live} compact style={styles.rowImage} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{charity.nameEn}</Text>
        {charity.area ? <Text variant="label" numberOfLines={1}>{charity.area}</Text> : null}
      </View>
      <View style={styles.rowGivePill}><Text style={styles.rowGive}>Give</Text></View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 26, lineHeight: 31, color: colors.navy },
  key: { color: colors.blue },
  search: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 52, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.lilacSoft, backgroundColor: colors.lilacSoft },
  searchInput: { flex: 1, fontFamily: fonts.body, fontSize: 17, color: colors.ink, paddingVertical: 10, outlineStyle: "none" } as object,
  head: { fontFamily: fonts.display, fontSize: 18, lineHeight: 23, color: colors.navy },
  face: { width: 88, gap: 8, alignItems: "center", paddingVertical: 4 },
  faceImage: { width: 70, height: 70, borderRadius: 35, borderWidth: 3, borderColor: colors.lilac },
  faceName: { fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 18, color: colors.ink, textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64, paddingVertical: 10 },
  rule: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowImage: { width: 46, height: 46, borderRadius: 16 },
  rowName: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.ink },
  rowGivePill: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: colors.lilacSoft, justifyContent: "center" },
  rowGive: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.blue },
  back: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start", minHeight: 44 },
  backText: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.blue },
});
