import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { bigAmountSize } from "@/lib/amount-size";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Blob } from "@/components/blob";
import { Button } from "@/components/button";
import { CharityPhotoCard } from "@/components/charity-photo-card";
import { GoalRing } from "@/components/goal-ring";
import { ChevronIcon, ReceiptsIcon } from "@/components/icons";
import { useStatusCover } from "@/components/status-cover";
import { Logo } from "@/components/logo";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { useScreenState } from "@/lib/screen-state";
import { Text } from "@/components/text";
import { gifts as sampleGifts, givenElsewhere as sampleElsewhere, receipts as sampleReceipts, recurring as sampleRecurring, sampleGoals } from "@/data/giving";
import { useAccount } from "@/lib/account";
import { useDirectory } from "@/lib/directory";
import { ddmmyyyy, rand, jhbToday } from "@/lib/format";
import { taxYearFor } from "@/lib/tax-year";
import { openGiveScreen } from "@/lib/give-entry";
import { counts, goalProgress, type Goal } from "@/lib/goals";
import { loadGoals } from "@/lib/goals-store";
import { loadIncome } from "@/lib/income-store";
import { inCause, savedCharities } from "@/lib/live-charities";
import { loadCausePrefs } from "@/lib/cause-prefs";
import { dismissGoalCard, goalCardDismissed } from "@/lib/first-run";
import type { IncomeEntry } from "@/lib/ledger";
import { useSaved } from "@/lib/saved";
import { useStoredRecord } from "@/lib/use-stored-record";
import { colors, fonts, radius, space } from "@/theme/tokens";

const noGoals: Goal[] = [];
const noIncome: IncomeEntry[] = [];

/**
 * Home: a hello, the donor's main goal as a ring on a blue card, their causes as photo cards, and a
 * reminder that s18A receipts arrive on their own. Goals and income stay on this phone.
 */
export default function Home() {
  const insets = useSafeAreaInsets();
  const status = useStatusCover();
  const { width } = useWindowDimensions();
  const account = useAccount();
  const preview = account.status === "preview";
  const signedIn = account.status === "signed-in";
  const owner = signedIn ? account.userId : null;
  const ownerKnown = !preview && account.status !== "loading" && account.status !== "agreeing";
  const goals = useStoredRecord<Goal[]>({ enabled: !preview && ownerKnown, waiting: !preview && !ownerKnown, owner, load: loadGoals, initial: preview ? sampleGoals : noGoals });
  // Income logged on the Progress tab, so a goal set as a share of income shows its real target here.
  const income = useStoredRecord<IncomeEntry[]>({ enabled: !preview && ownerKnown, waiting: !preview && !ownerKnown, owner, load: loadIncome, initial: noIncome });
  const directory = useDirectory();
  const demoState = useScreenState();
  const all = preview && demoState === "empty" ? [] : (directory.data?.charities ?? []);
  const saved = savedCharities(useSaved().slugs, all);
  // The causes picked when the app was first opened (on this phone only).
  const [picked, setPicked] = useState<string[]>([]);
  useEffect(() => {
    loadCausePrefs().then(setPicked);
  }, []);
  const inPicked = picked.length ? all.filter((c) => picked.some((id) => inCause(c, id))) : [];
  // "Your causes": the charities they saved, else ones in the causes they picked, else a few to start with.
  const causes = (saved.length ? saved : inPicked.length ? inPicked : all).slice(0, 8);

  const gifts = preview ? sampleGifts : (account.live?.gifts ?? []);
  const elsewhere = preview ? sampleElsewhere : (account.live?.elsewhere ?? []);
  // "First gift" only when we know: fresh giving from the server with none in it (not while it loads or fails).
  const firstGift = preview ? demoState === "empty" : account.status === "signed-in" && account.live !== null && !account.live.fromCache && gifts.length === 0;
  const goal = goals.value[0] ?? null;
  // At a glance, quieter than the goal card: given this tax year, the next monthly gift, and receipts.
  const monthlyList = preview ? sampleRecurring : (account.live?.recurring ?? []);
  const receiptList = preview ? sampleReceipts : (account.live?.receipts ?? []);
  const thisYear = taxYearFor(jhbToday());
  const yearGifts = gifts.filter((g) => taxYearFor(g.date) === thisYear);
  const yearCents = yearGifts.reduce((n, g) => n + g.cents, 0);
  const nextMonthly = monthlyList.filter((r) => r.status === "active" && r.nextDate).sort((a, b) => (a.nextDate as Date).getTime() - (b.nextDate as Date).getTime())[0] ?? null;
  const glance = [
    yearGifts.length ? { key: "year", kicker: `Given, tax year ${thisYear}`, value: rand(yearCents), sub: `${yearGifts.length} ${yearGifts.length === 1 ? "gift" : "gifts"}`, to: "/giving" as const } : null,
    nextMonthly ? { key: "next", kicker: "Next monthly donation", value: rand(nextMonthly.cents), sub: `${ddmmyyyy(nextMonthly.nextDate as Date)}\n${nextMonthly.charityName}`, to: "/giving" as const } : null,
    receiptList.length ? { key: "receipts", kicker: "s18A receipts", value: `${receiptList.length}`, sub: receiptList.length === 1 ? "receipt to download" : "receipts to download", to: "/receipts" as const } : null,
  ].filter((x): x is NonNullable<typeof x> => x !== null);
  // No goal yet: a gentle card the donor can dismiss. Once dismissed it stays gone (and nothing pops up).
  // While the choice is being read it stays hidden, so it never flashes up and away.
  const [cardGone, setCardGone] = useState<boolean | null>(null);
  useEffect(() => {
    goalCardDismissed().then(setCardGone);
  }, []);
  const hideGoalCard = !preview && goals.status === "ready" && !goal && cardGone !== false;
  const progress = goal ? goalProgress(goal, [...gifts, ...elsewhere], income.value, jhbToday()) : null;
  const counted = goal && progress ? [...gifts, ...elsewhere].filter((g) => g.date >= progress.window.start && g.date <= progress.window.end && counts(goal, g.label)).length : 0;
  const pct = progress?.targetCents ? Math.floor((progress.givenCents * 100) / progress.targetCents) : 0;
  const initial = (account.email ?? (preview ? "Sarah" : "?")).slice(0, 1).toUpperCase();

  return (
    <>
      <ScrollView style={styles.screen} onScroll={status.onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, gap: space.block }}>
        <View style={[styles.gutter, styles.top]}>
          <Logo width={104} />
          <Pressable onPress={() => router.push("/account")} accessibilityRole="button" accessibilityLabel="Your account" style={styles.avatar}>
            <Text style={styles.avatarText}>{initial}</Text>
          </Pressable>
        </View>

        <View style={styles.gutter}>
          <Text variant="h1" accessibilityRole="header">{firstGift ? "Welcome in. Ready for your first gift?" : "Ready to do some good?"}</Text>
        </View>

        {/* The main goal, as a ring on blue. Without a goal it is a soft invitation that can be dismissed. */}
        {hideGoalCard ? null : <View style={styles.gutter}>
          <View style={styles.goalCard}>
            <Blob size={100} color={colors.orange} rotate={20} style={{ right: -55, top: -60 }} />
            <Blob size={90} color={colors.lilac} rotate={-15} stretch={1.2} style={{ left: -50, bottom: -60 }} />
            {goals.status === "problem" && !preview ? (
              <View style={{ gap: 12 }}>
                <Text style={styles.goalSub}>Your goals could not be opened on this phone. Nothing has been changed.</Text>
                <Button variant="white" label="Open Progress" onPress={() => router.push("/giving")} />
              </View>
            ) : goals.status !== "ready" && !preview ? (
              <SkeletonBlock height={120} />
            ) : goal && progress ? (
              <Pressable
                onPress={() => router.push("/giving")}
                accessibilityRole="button"
                accessibilityLabel={`${goal.name}: ${rand(progress.givenCents)}${progress.targetCents !== null ? ` of ${rand(progress.targetCents)}` : ""}. Open your goals`}
                style={({ pressed }) => [styles.goalRow, pressed && { opacity: 0.85 }]}
              >
                <GoalRing percent={pct} onBlue size={width < 360 ? 96 : 118} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.goalKicker}>{goal.name} · {progress.window.label}</Text>
                  <Text style={[styles.goalAmount, bigAmountSize(rand(progress.givenCents), width, 34)]}>{rand(progress.givenCents)}</Text>
                  <Text style={styles.goalSub}>
                    {progress.targetCents !== null ? `of ${rand(progress.targetCents)}` : "Log income to see the target"} · {counted} {counted === 1 ? "gift" : "gifts"}
                  </Text>
                </View>
                <ChevronIcon color={colors.onInk} />
              </Pressable>
            ) : (
              <View style={{ gap: 12 }}>
                <Text style={styles.goalAmount}>Set a giving goal</Text>
                <Text style={styles.goalSub}>A set amount or a share of your income. Only you see it.</Text>
                <Button variant="white" label="Set a goal" onPress={() => router.push("/giving")} />
                {preview ? null : (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Not now: hide the goal card"
                    hitSlop={8}
                    onPress={() => {
                      setCardGone(true);
                      void dismissGoalCard();
                    }}
                    style={styles.notNow}
                  >
                    <Text style={styles.notNowText}>Not now</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        </View>}

        {glance.length ? (
          <View style={[styles.gutter, styles.glanceRow]}>
            {glance.map((t) => (
              <Pressable key={t.key} onPress={() => router.push(t.to)} accessibilityRole="button" accessibilityLabel={`${t.kicker}: ${t.value}. ${t.sub.replace("\n", ", ")}`} style={({ pressed }) => [styles.glance, pressed && { opacity: 0.85 }]}>
                <Text style={styles.glanceKicker} numberOfLines={2}>{t.kicker}</Text>
                <Text style={styles.glanceValue} numberOfLines={1}>{t.value}</Text>
                <Text style={styles.glanceSub} numberOfLines={4}>{t.sub}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={{ gap: 12 }}>
          <View style={[styles.gutter, styles.sectionHead]}>
            <Text variant="h2" accessibilityRole="header">Your causes</Text>
            <Pressable onPress={() => router.push("/discover")} accessibilityRole="link" hitSlop={12}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>
          {(preview && demoState === "error") || (directory.failed && !causes.length) ? (
            <View style={styles.gutter}>
              <ErrorState body="We can't load charities right now. Check your connection, then try again." onRetry={directory.retry} />
            </View>
          ) : (preview && demoState === "loading") || (!directory.data && !directory.failed) ? (
            <View style={styles.gutter}><SkeletonBlock height={260} /></View>
          ) : !causes.length ? (
            <View style={styles.gutter}>
              <EmptyState title="No charities here yet" body="New charities join Givezy every week. Have a look again soon." action={{ label: "Go to Discover", onPress: () => router.push("/discover") }} />
            </View>
          ) : causes.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingHorizontal: space.gutter }}>
              {causes.map((c) => (
                <CharityPhotoCard key={c.slug} charity={c} live={directory.live} width={268} onGive={(ch) => openGiveScreen(ch.slug)} />
              ))}
            </ScrollView>
          ) : (
            <View style={styles.gutter}><SkeletonBlock height={260} /></View>
          )}
        </View>

        <View style={styles.gutter}>
          <View style={styles.strip}>
            <ReceiptsIcon color={colors.blue} />
            <Text style={{ flex: 1, color: colors.navy, fontSize: 16, lineHeight: 22 }}>Ask for an s18A receipt when you give, and it arrives on its own at tax time.</Text>
          </View>
        </View>
      </ScrollView>
      {status.cover}
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  gutter: { paddingHorizontal: space.gutter },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.lilacSoft, borderWidth: 1.5, borderColor: colors.lightPurple, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.display, fontSize: 18, color: colors.blue },
  goalCard: { backgroundColor: colors.blue, borderRadius: radius.card, padding: 20, overflow: "hidden" },
  goalRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  goalKicker: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.lilacSoft },
  goalAmount: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.onInk },
  glanceRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  glance: { flexGrow: 1, flexBasis: "40%", minWidth: 130, padding: 12, borderRadius: radius.control, backgroundColor: colors.lilacSoft, gap: 2 },
  glanceKicker: { fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 18, color: colors.muted },
  glanceValue: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy },
  glanceSub: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19, color: colors.muted },
  notNow: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  notNowText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.lilacSoft, textDecorationLine: "underline" },
  goalSub: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.lilacSoft },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seeAll: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.blue },
  strip: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
