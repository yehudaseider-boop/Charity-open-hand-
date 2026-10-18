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
import { Logo } from "@/components/logo";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { useScreenState } from "@/lib/screen-state";
import { Text } from "@/components/text";
import { gifts as sampleGifts, givenElsewhere as sampleElsewhere, sampleGoals } from "@/data/giving";
import { useAccount } from "@/lib/account";
import { useDirectory } from "@/lib/directory";
import { rand, jhbToday } from "@/lib/format";
import { openGiveScreen } from "@/lib/give-entry";
import { counts, goalProgress, type Goal } from "@/lib/goals";
import { loadGoals } from "@/lib/goals-store";
import { loadIncome } from "@/lib/income-store";
import { inCause, savedCharities } from "@/lib/live-charities";
import { loadCausePrefs } from "@/lib/cause-prefs";
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
  const progress = goal ? goalProgress(goal, [...gifts, ...elsewhere], income.value, jhbToday()) : null;
  const counted = goal && progress ? [...gifts, ...elsewhere].filter((g) => g.date >= progress.window.start && g.date <= progress.window.end && counts(goal, g.label)).length : 0;
  const pct = progress?.targetCents ? Math.floor((progress.givenCents * 100) / progress.targetCents) : 0;
  const initial = (account.email ?? (preview ? "Sarah" : "?")).slice(0, 1).toUpperCase();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, gap: space.block }}>
      <View style={[styles.gutter, styles.top]}>
        <Logo width={104} />
        <Pressable onPress={() => router.push("/account")} accessibilityRole="button" accessibilityLabel="Your account" style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </Pressable>
      </View>

      <View style={styles.gutter}>
        <Text variant="h1" accessibilityRole="header">{firstGift ? "Welcome in. Ready for your first gift?" : "Ready to do some good?"}</Text>
      </View>

      {/* The main goal, as a ring on blue. */}
      <View style={styles.gutter}>
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
            </View>
          )}
        </View>
      </View>

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
  goalSub: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.lilacSoft },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  seeAll: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.blue },
  strip: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
