import { DayLine } from "@/components/day-greeting";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { bigAmountSize } from "@/lib/amount-size";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Blob } from "@/components/blob";
import { Bubbles, People } from "@/components/people";
import { Button } from "@/components/button";
import { CharityPhotoCard } from "@/components/charity-photo-card";
import { GoalRing } from "@/components/goal-ring";
import { CalendarIcon, ChevronIcon, GivingIcon, ReceiptsIcon } from "@/components/icons";
import { useStatusCover } from "@/components/status-cover";
import { Logo } from "@/components/logo";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { useScreenState } from "@/lib/screen-state";
import { Text } from "@/components/text";
import { gifts as sampleGifts, givenElsewhere as sampleElsewhere, receipts as sampleReceipts, recurring as sampleRecurring, sampleGoals } from "@/data/giving";
import { useAccount } from "@/lib/account";
import { useDirectory } from "@/lib/directory";
import { ddmmyyyy, rand, jhbToday } from "@/lib/format";
import { taxYearFor, taxYearName } from "@/lib/tax-year";
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
import { colors, fonts, radius, space, tabular } from "@/theme/tokens";

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
  // At a glance, quieter than the goal card: one list, a full-width row each, so nothing is ever cut short.
  // Each row opens the exact place it is about: its section on Progress, or the Receipts page.
  // "Through Givezy" because the goal above also counts giving logged elsewhere, so the two totals can differ.
  const monthlyList = preview ? sampleRecurring : (account.live?.recurring ?? []);
  const receiptList = preview ? sampleReceipts : (account.live?.receipts ?? []);
  const thisYear = taxYearFor(jhbToday());
  const yearGifts = gifts.filter((g) => taxYearFor(g.date) === thisYear);
  const yearCents = yearGifts.reduce((n, g) => n + g.cents, 0);
  const nextMonthly = monthlyList.filter((r) => r.status === "active" && r.nextDate).sort((a, b) => (a.nextDate as Date).getTime() - (b.nextDate as Date).getTime())[0] ?? null;
  const glance = [
    yearGifts.length ? { key: "year", Icon: GivingIcon, title: "Given through Givezy", value: rand(yearCents), sub: `${taxYearName(thisYear)} tax year · ${yearGifts.length} ${yearGifts.length === 1 ? "gift" : "gifts"}`, to: "/giving?section=year" } : null,
    nextMonthly ? { key: "next", Icon: CalendarIcon, title: "Next monthly donation", value: rand(nextMonthly.cents), sub: `${ddmmyyyy(nextMonthly.nextDate as Date)} · ${nextMonthly.charityName}`, to: "/giving?section=monthly" } : null,
    receiptList.length ? { key: "receipts", Icon: ReceiptsIcon, title: "s18A receipts", value: `${receiptList.length}`, sub: "To download", to: "/receipts" } : null,
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

        {/* The hello, in the For charities page's look (30/10/2026): a soft card, the key word in blue,
            people giving, and dots and rings drifting round them. */}
        <View style={styles.gutter}>
          <View style={styles.hero}>
            <Bubbles
              items={[
                { size: 150, color: colors.peach, at: { right: -50, top: -40 } },
                { size: 14, color: colors.orange, float: true, at: { right: 34, top: 26 } },
                { size: 26, color: colors.blue, ring: true, float: true, at: { left: 18, bottom: 28 } },
                { size: 10, color: colors.blue, float: true, at: { right: 120, bottom: 54 } },
              ]}
            />
            <View style={{ gap: 6 }}>
              <DayLine />
              <Text variant="h1" accessibilityRole="header">
                {firstGift ? <>Welcome in. Ready for your <Text variant="h1" style={styles.key}>first gift</Text>?</> : <>Ready to do some <Text variant="h1" style={styles.key}>good</Text>?</>}
              </Text>
            </View>
            <People name="workingTogether" width={Math.min(300, width - space.gutter * 2 - 40)} style={styles.heroArt} />
          </View>
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
                  <Text style={styles.goalKicker} numberOfLines={1}>{goal.name}</Text>
                  <Text style={styles.goalWindow} numberOfLines={2}>{progress.window.label}</Text>
                  <Text style={[styles.goalAmount, bigAmountSize(rand(progress.givenCents), width, 34)]}>{rand(progress.givenCents)}</Text>
                  <Text style={styles.goalSub}>{progress.targetCents !== null ? `of ${rand(progress.targetCents)}` : "Log income to see the target"}</Text>
                  <Text style={styles.goalSub}>{counted} {counted === 1 ? "gift" : "gifts"}</Text>
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
          <View style={styles.gutter}>
            <View style={styles.glance}>
              {glance.map((t, i) => (
                <Pressable key={t.key} onPress={() => router.push((t.to.includes("?") ? `${t.to}&at=${Date.now()}` : t.to) as never)} accessibilityRole="button" accessibilityLabel={`${t.title}: ${t.value}. ${t.sub}`} style={({ pressed }) => [styles.glanceRow, i > 0 && styles.glanceDivider, pressed && { backgroundColor: colors.lilacSoft }]}>
                  <View style={styles.glanceIcon}><t.Icon size={22} color={colors.blue} /></View>
                  <View style={{ flex: 1, gap: 1 }}>
                    <Text style={styles.glanceTitle}>{t.title}</Text>
                    <Text style={styles.glanceValue}>{t.value}</Text>
                    <Text style={styles.glanceSub}>{t.sub}</Text>
                  </View>
                  <ChevronIcon />
                </Pressable>
              ))}
            </View>
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

        {/* The website's blue colour-block card, with a ring and a dot bleeding off its edges. */}
        <View style={styles.gutter}>
          <Pressable onPress={() => router.push("/receipts")} accessibilityRole="button" accessibilityLabel="s18A receipts, done for you. Ask for one when you give, and it arrives on its own at tax time. See your receipts" style={({ pressed }) => [styles.receiptsCard, pressed && { opacity: 0.92 }]}>
            <Bubbles
              items={[
                { size: 90, color: colors.lilac, ring: true, at: { right: -30, bottom: -34 } },
                { size: 14, color: colors.orange, float: true, at: { right: 26, top: 22 } },
              ]}
            />
            <View style={styles.receiptsIcon}><ReceiptsIcon color={colors.blue} /></View>
            <Text style={styles.receiptsTitle}>s18A receipts, done for you</Text>
            <Text style={styles.receiptsBody}>Ask for an s18A receipt when you give, and it arrives on its own at tax time.</Text>
            <Text style={styles.receiptsLink}>See your receipts ›</Text>
          </Pressable>
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
  goalWindow: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.lilacSoft, marginBottom: 2 },
  goalAmount: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.onInk },
  glance: { borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: "hidden" },
  glanceRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 72, paddingVertical: 14, paddingLeft: 14, paddingRight: 12 },
  glanceDivider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  glanceIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.lilacSoft, alignItems: "center", justifyContent: "center" },
  glanceTitle: { fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 19, color: colors.muted },
  glanceValue: { ...tabular, fontFamily: fonts.bodyBold, fontSize: 20, lineHeight: 26, color: colors.ink },
  glanceSub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 19, color: colors.muted },
  notNow: { minHeight: 44, alignItems: "center", justifyContent: "center" },
  notNowText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.lilacSoft, textDecorationLine: "underline" },
  goalSub: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.lilacSoft },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seeAll: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.blue },
  hero: { backgroundColor: colors.lilacSoft, borderRadius: radius.card, paddingTop: 22, paddingHorizontal: 20, overflow: "hidden", gap: 8 },
  heroArt: { alignSelf: "center", marginTop: 4, marginBottom: -2 },
  key: { color: colors.blue },
  receiptsCard: { backgroundColor: colors.blue, borderRadius: radius.card, padding: 22, overflow: "hidden", gap: 8 },
  receiptsIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  receiptsTitle: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27, color: colors.onInk },
  receiptsBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.lilacSoft },
  receiptsLink: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.onInk, marginTop: 6 },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
