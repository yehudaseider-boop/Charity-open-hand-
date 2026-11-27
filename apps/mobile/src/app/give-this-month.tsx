import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Backdrop } from "@/components/backdrop";
import { Button } from "@/components/button";
import { CheckIcon } from "@/components/icons";
import { Text } from "@/components/text";
import { TopBar } from "@/components/top-bar";
import { gifts as sampleGifts, recurring as sampleRecurring } from "@/data/giving";
import { useAccount } from "@/lib/account";
import { haptic } from "@/lib/haptics";
import { useReminder } from "@/lib/reminder";
import { ddmmyyyy, monthKeyOf } from "@/lib/reminders";
import { colors, fonts, radius, space } from "@/theme/tokens";

/** The most charities listed: the ones given to most recently. */
const MOST = 8;

/**
 * "Give this month" (27/11/2026): where the payday reminder opens. The charities the donor gave to, most recent first,
 * each with Give; a monthly donation already running is marked, not offered again; "Find another charity"; and a
 * quiet "Not this month", which moves the reminder to next month. No amount is filled in and nothing is pushed.
 */
export default function GiveThisMonth() {
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const reminder = useReminder();
  const preview = account.status === "preview";
  const gifts = useMemo(() => (preview ? sampleGifts : (account.live?.gifts ?? [])), [preview, account.live]);
  const monthly = useMemo(() => (preview ? sampleRecurring : (account.live?.recurring ?? [])), [preview, account.live]);
  const [skipped, setSkipped] = useState<{ next: Date | null } | null>(null);

  const thisMonth = monthKeyOf(new Date());
  const gaveThisMonth = gifts.some((g) => monthKeyOf(g.date) === thisMonth);
  const running = new Set(monthly.filter((m) => m.status === "active").map((m) => m.charitySlug));
  const charities = useMemo(() => {
    const seen = new Map<string, { slug: string; name: string; last: Date }>();
    for (const g of [...gifts].sort((a, b) => b.date.getTime() - a.date.getTime())) {
      if (!seen.has(g.charitySlug)) seen.set(g.charitySlug, { slug: g.charitySlug, name: g.charityName, last: g.date });
    }
    return [...seen.values()].slice(0, MOST);
  }, [gifts]);

  const [skipProblem, setSkipProblem] = useState(false);
  const notThisMonth = async () => {
    const r = await reminder.skipThisMonth();
    if (r === "not-saved") {
      haptic.soft();
      setSkipProblem(true);
      return;
    }
    haptic.press();
    setSkipProblem(false);
    setSkipped({ next: r.next });
  };

  return (
    <View style={styles.screen}>
      <Backdrop variant="page" />
      <TopBar title="Give this month" fallback="/(tabs)/home" />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: insets.bottom + 40, gap: space.block }}>
        {gaveThisMonth ? (
          <View style={styles.doneCard} accessibilityLiveRegion="polite">
            <View style={styles.tick}><CheckIcon color={colors.onInk} /></View>
            <Text style={styles.doneText}>You&apos;ve already given this month. Thank you. Anything more is extra.</Text>
          </View>
        ) : null}

        {charities.length ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.sectionTitle}>Your charities</Text>
            {charities.map((c) => (
              <View key={c.slug} style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={2} style={styles.name}>{c.name}</Text>
                  <Text variant="label">{running.has(c.slug) ? "Monthly donation already set" : `Last gift ${ddmmyyyy(c.last)}`}</Text>
                </View>
                {running.has(c.slug) ? null : <Button label="Give" onPress={() => router.push(`/charity/${c.slug}` as never)} style={{ minWidth: 88 }} />}
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardText}>Your charities show here once you&apos;ve given through Givezy.</Text>
          </View>
        )}

        <Button variant="secondary" label="Find another charity" onPress={() => router.push("/(tabs)/discover" as never)} />

        {reminder.settings?.on ? (
          skipped ? (
            <View style={styles.card} accessibilityRole="alert" accessibilityLiveRegion="polite">
              <Text style={styles.cardText}>{skipped.next ? `No problem. Your next reminder is on ${ddmmyyyy(skipped.next)}.` : "No problem. No reminder this month."}</Text>
            </View>
          ) : !gaveThisMonth ? (
            <View style={{ gap: 10 }}>
              {skipProblem ? (
                <Text style={styles.problemText} accessibilityRole="alert">That wasn&apos;t saved just now, so this month&apos;s reminder is still on. Please try again.</Text>
              ) : null}
              <Button variant="secondary" label="Not this month" onPress={notThisMonth} />
            </View>
          ) : null
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, color: colors.navy },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  name: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 21, color: colors.navy },
  card: { padding: 18, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
  problemText: { fontFamily: fonts.bodySemibold, fontSize: 16, lineHeight: 22, color: colors.danger },
  cardText: { fontFamily: fonts.bodySemibold, fontSize: 16, lineHeight: 23, color: colors.navy },
  doneCard: { flexDirection: "row", gap: 14, alignItems: "flex-start", padding: 18, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
  tick: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  doneText: { flex: 1, fontFamily: fonts.bodySemibold, fontSize: 17, lineHeight: 24, color: colors.navy },
});

export { ScreenError as ErrorBoundary } from "@/components/screen-error";
