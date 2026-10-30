import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, useWindowDimensions, View, type ScrollViewInstance } from "react-native";
import { bigAmountSize } from "@/lib/amount-size";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useStatusCover } from "@/components/status-cover";
import { Button, TextLink } from "@/components/button";
import { BlueHeader } from "@/components/backdrop";
import { GoalRing } from "@/components/goal-ring";
import { InsightsLink } from "@/components/insights-link";
import { FadeUp } from "@/components/fade-up";
import { Bubbles, People } from "@/components/people";
import { ChevronIcon } from "@/components/icons";
import { GoalProgressLine } from "@/components/goal-progress-line";
import { Sheet, type SheetGuard } from "@/components/sheet";
import { EmptyState, ErrorState, OfflineNote, SkeletonBlock } from "@/components/states";
import { UndoToast, type UndoMessage } from "@/components/undo-toast";
import { ElsewhereForm, IncomeForm } from "@/components/log-sheets";
import { GoalEditor } from "@/components/goal-editor";
import { Text } from "@/components/text";
import { gifts, givenElsewhere as sampleElsewhere, recurring as sampleRecurring, sampleGoals, type Gift, type Recurring } from "@/data/giving";
import { ddmmyyyy, hhmm, jhbDay, jhbToday, rand } from "@/lib/format";
import { openGiveScreen } from "@/lib/give-entry";
import { helpLine } from "@/lib/help";
import { byCharity, groupByMonth, percentOf, taxYearsGiven } from "@/lib/giving";
import { goalProgress, knownLabels, MAX_GOALS, monthTiles, type Goal } from "@/lib/goals";
import { monthDetail } from "@/lib/month-detail";
import { loadGoals, saveGoals, setAsideGoals } from "@/lib/goals-store";
import { taxYearFor, taxYearName, taxYearRangeLabel } from "@/lib/tax-year";
import { useAccount } from "@/lib/account";
import { loadIncome, saveIncome, startNewIncomeLog } from "@/lib/income-store";
import { isoToDate, type Elsewhere, type IncomeEntry } from "@/lib/ledger";
import { useScreenState } from "@/lib/screen-state";
import { useDirectory } from "@/lib/directory";
import { savedCharities } from "@/lib/live-charities";
import { useSaved } from "@/lib/saved";
import { SavedRow } from "@/components/saved-row";
import { confirmThen, notify, openUrl } from "@/lib/open-site";
import { requestNewCardPage } from "@/lib/pay-api";
import { SITE_URL } from "@/lib/website";
import { RecordProblem } from "@/components/record-problem";
import { useStoredRecord } from "@/lib/use-stored-record";
import type { SaveResult } from "@/lib/stored-result";
import { colors, fonts, radius, space, touch, type } from "@/theme/tokens";

/** Progress (was Giving): the main goal as a big ring on blue, month by month, then the donor's records and history. */
export default function Giving() {
  const insets = useSafeAreaInsets();
  const status = useStatusCover();
  const { width } = useWindowDimensions();
  const account = useAccount();
  const preview = account.status === "preview";
  const signedIn = account.status === "signed-in";
  const demoState = useScreenState();
  // Live: the screen's state comes from the account; preview keeps the design-review states.
  const state = preview
    ? demoState
    : account.status === "loading"
      ? "loading"
      : account.loadError && !account.live
        ? "error"
        : signedIn && !account.live
          ? "loading"
          : "ready";
  const p = useLocalSearchParams<{ demo?: string; sheet?: string; section?: "year" | "monthly"; at?: string }>();
  // Opened from a Home row: scroll to that row's section once it is laid out. `at` makes each tap a new jump.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const [bodyY, setBodyY] = useState<number | null>(null);
  const [sectionY, setSectionY] = useState<Partial<Record<"year" | "monthly", number>>>({});
  const jumped = useRef<string | null>(null);
  const newDonor = preview ? demoState === "empty" : !signedIn;
  const previewGoals = !preview || newDonor || p.demo === "first" ? noGoals : sampleGoals;
  // Goals are personal and stay on this phone (in its secure storage), never on our servers.
  // Each person has their own goals and income log on the phone; wait until we know who it is.
  const owner = signedIn ? account.userId : null;
  const ownerKnown = !preview && account.status !== "loading" && account.status !== "agreeing";
  // A record that could not be read is never treated as empty: nothing is saved over it until it
  // has loaded, or the person chooses to start again (the old text is kept aside).
  const goalsRecord = useStoredRecord<Goal[]>({ enabled: !preview && ownerKnown, waiting: !preview && !ownerKnown, owner, load: loadGoals, initial: previewGoals });
  const goals = goalsRecord.value;
  const goalsLoaded = goalsRecord.status === "ready";
  const goalsProblem = goalsRecord.reason;
  // A failed save belongs to the person it was for: someone else signing in never sees it.
  const [goalsSaveFailedFor, setGoalsSaveFailedFor] = useState<{ owner: string | null } | null>(null);
  const goalsSaveFailed = goalsSaveFailedFor !== null && goalsSaveFailedFor.owner === owner;
  const persistGoals = async (g: Goal[], forOwner: string | null) => {
    const r = await saveGoals(g, forOwner);
    setGoalsSaveFailedFor(r.ok ? null : { owner: forOwner });
    return r.ok;
  };
  const putGoals = (next: Goal[], said = "Goal saved.") => {
    goalsRecord.setValue(next);
    setEditing(null);
    if (preview) return setSaved(said);
    setSaved("Saving…");
    void persistGoals(next, owner).then((ok) => setSaved(ok ? said : null));
  };
  // Income (for a goal set as a share of income) stays on this phone only. Nothing is logged until the saved log has loaded.
  const incomeRecord = useStoredRecord<IncomeEntry[]>({ enabled: !preview && ownerKnown, waiting: !preview && !ownerKnown, owner, load: loadIncome, initial: noIncome });
  const income = incomeRecord.value;
  // Jump only once everything above the section has its final height (goals and income change the header).
  const settled = state === "ready" && goalsRecord.status !== "loading" && incomeRecord.status !== "loading";
  useEffect(() => {
    const target = p.section ? sectionY[p.section] : undefined;
    if (!p.section || !p.at || jumped.current === p.at || !settled || bodyY === null || target === undefined) return;
    jumped.current = p.at;
    scrollRef.current?.scrollTo({ y: Math.max(0, bodyY + target - insets.top - 16), animated: true });
  }, [p.section, p.at, settled, bodyY, sectionY, insets.top]);
  const incomeReady = incomeRecord.status === "ready";
  const incomeProblem = incomeRecord.reason;
  const [incomeSaveFailedFor, setIncomeSaveFailedFor] = useState<{ owner: string | null } | null>(null);
  const incomeSaveFailed = incomeSaveFailedFor !== null && incomeSaveFailedFor.owner === owner;
  const persistIncome = async (next: IncomeEntry[], forOwner: string | null) => {
    const r = await saveIncome(next, forOwner);
    setIncomeSaveFailedFor(r.ok ? null : { owner: forOwner });
  };
  // The person's explicit choice to start again after unreadable stored text.
  const startAgain = async (go: () => Promise<SaveResult>, reload: () => void, what: string) => {
    const r = await go();
    if (r.ok) reload();
    else notify("Nothing was changed", `Your ${what} could not be set aside, so it was left as it is. Please try again.`);
  };
  const [busy, setBusy] = useState(false);
  // The lists show the latest 12; every entry still counts, and "Show all" opens the rest to check or remove.
  const [showAllIncome, setShowAllIncome] = useState(false);
  const [showAllElsewhere, setShowAllElsewhere] = useState(false);
  const [previewElsewhere, setPreviewElsewhere] = useState<Elsewhere[]>(newDonor ? [] : sampleElsewhere);
  const [logging, setLogging] = useState<"income" | "elsewhere" | null>(null);
  // What the open logging form tells its sheet: saving, typed into, or nothing yet.
  const [logGuard, setLogGuard] = useState<SheetGuard>(null);
  if (logging === null && logGuard !== null) setLogGuard(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState(false);
  // "Update card": the donor's own page on the website, where the new card goes in on the payment provider's page.
  const updateCard = async (id: string) => {
    const token = await account.accessToken();
    if (!SITE_URL || !token) return notify("Not available yet", "Putting in a new card opens on the Givezy website once it is live.");
    setCardBusy(true);
    setRecurringError(null);
    const r = await requestNewCardPage(SITE_URL, id, token).catch(() => ({ ok: false as const, message: "We couldn't reach Givezy. Please check your connection and try again." }));
    setCardBusy(false);
    if (!r.ok) return setRecurringError(`${r.message} Nothing was charged and your monthly donation is unchanged.`);
    openUrl(r.url);
  };
  // Which goal is open in the editor: its id, "new", or none.
  const [editing, setEditing] = useState<string | null>(null);
  // "Saving…", then "Goal saved." once the phone has kept it (never before).
  const [saved, setSaved] = useState<string | null>(null);
  // What just happened, with a way to take it back, for a few seconds after a removal or a monthly change.
  const [undo, setUndo] = useState<UndoMessage | null>(null);
  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), 10_000);
    return () => clearTimeout(t);
  }, [undo]);
  const [removing, setRemoving] = useState<string | null>(null);
  const [sampleRecurringState, setRecurring] = useState<Recurring[]>(newDonor ? [] : sampleRecurring);
  const recurring = preview ? sampleRecurringState : (account.live?.recurring ?? []);
  const [open, setOpen] = useState<Recurring | null>(preview ? (sampleRecurring.find((r) => r.id === p.sheet) ?? null) : null);

  const directory = useDirectory();
  const savedList = savedCharities(useSaved().slugs, directory.data?.charities ?? []);
  // Today as a Johannesburg calendar day: months and years follow South African dates.
  const now = jhbToday();
  const taxYear = taxYearFor(now);
  const myGifts = preview ? (newDonor ? [] : gifts) : (account.live?.gifts ?? []);
  const elsewhere: Elsewhere[] = preview ? previewElsewhere : (account.live?.elsewhere ?? []);
  // "In numbers" follows the SARS tax year, like the receipts: this one, an earlier one, or all time.
  const years = taxYearsGiven(myGifts, taxYear);
  const [pickedYear, setPickedYear] = useState<number | "all">(taxYear);
  const shownYear = pickedYear === "all" || years.includes(pickedYear) ? pickedYear : taxYear;
  const yearGifts = shownYear === "all" ? myGifts : myGifts.filter((g) => taxYearFor(g.date) === shownYear);
  const giftsTotal = yearGifts.reduce((t, g) => t + g.cents, 0);
  const monthGifts = myGifts.filter((g) => g.date.getMonth() === now.getMonth() && g.date.getFullYear() === now.getFullYear());
  const monthTotal = monthGifts.reduce((t, g) => t + g.cents, 0);
  const charities = byCharity(yearGifts);
  const with18a = yearGifts.filter((g) => g.with18a).reduce((t, g) => t + g.cents, 0);
  // Everything that can count towards a goal: donations through Givezy and giving logged elsewhere.
  const goalRows = [...myGifts, ...elsewhere];
  const labels = knownLabels(goalRows);
  const byLabel = labelTotals(yearGifts);
  const [openGift, setOpenGift] = useState<Gift | null>(null);
  // A different person on the phone: nothing from the last person's session (an Undo, an open sheet) carries over.
  const [shownFor, setShownFor] = useState(owner);
  if (shownFor !== owner) {
    setShownFor(owner);
    setUndo(null);
    setOpen(null);
    setOpenGift(null);
  }
  const usesIncome = goals.some((g) => g.basis === "income");
  const main = goals[0] ?? null;
  const mainProgress = main ? goalProgress(main, goalRows, income, now) : null;
  const mainPct = mainProgress?.targetCents ? Math.floor((mainProgress.givenCents * 100) / mainProgress.targetCents) : 0;
  const tiles = main ? monthTiles(main, goalRows, now, mainProgress?.targetCents ?? null) : [];
  // The month whose panel is open: this month to start with; tapping the open month closes it.
  const [pickedMonth, setPickedMonth] = useState<number | "closed" | null>(null);
  const currentKey = now.getFullYear() * 12 + now.getMonth();
  const openMonth = pickedMonth === "closed" ? null : (pickedMonth ?? currentKey);
  const detail = main && mainProgress && openMonth !== null && tiles.some((t) => t.key === openMonth)
    ? monthDetail(main, goalRows, now, openMonth, mainProgress)
    : null;

  const addIncome = (e: { cents: number; date: string; note: string }) => {
    if (!incomeReady) return;
    const next = [{ id: newEntryId(), ...e }, ...income].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const before = income;
    incomeRecord.setValue(next);
    void persistIncome(next, owner);
    setLogging(null);
    setUndo({ text: `Logged ${rand(e.cents)} of income.`, label: "Undo", run: () => { incomeRecord.setValue(before); void persistIncome(before, owner); setUndo({ text: "Taken back. That income entry is removed." }); } });
  };
  const removeIncome = (id: string) => {
    if (!incomeReady) return;
    const before = income;
    const next = income.filter((e) => e.id !== id);
    incomeRecord.setValue(next);
    void persistIncome(next, owner);
    setUndo({ text: "Income entry removed.", label: "Undo", run: () => { incomeRecord.setValue(before); void persistIncome(before, owner); setUndo({ text: "Taken back. The income entry is back." }); } });
  };
  // Removing is quick to take back, so it happens straight away with Undo instead of asking first.
  const confirmRemove = (_what: string, go: () => void) => go();
  const removeElsewhereEntry = (id: string) => {
    const was = elsewhere.find((e) => e.id === id);
    if (preview) {
      setPreviewElsewhere((rows) => rows.filter((r) => r.id !== id));
      if (was) setUndo({ text: `Removed ${was.recipient}.`, label: "Undo", run: () => { setPreviewElsewhere((rows) => [was, ...rows]); setUndo({ text: "Taken back. It's back in your records." }); } });
      return;
    }
    setRemoving(id);
    account.removeElsewhere(id).then((r) => {
      setRemoving(null);
      if (!r.ok) return setUndo({ text: "We couldn't remove it, so it's still in your records. Check your connection and try again." });
      if (!was) return;
      const iso = `${was.date.getFullYear()}-${String(was.date.getMonth() + 1).padStart(2, "0")}-${String(was.date.getDate()).padStart(2, "0")}`;
      setUndo({
        text: `Removed ${was.recipient}.`,
        label: "Undo",
        run: () => {
          setUndo({ text: "Putting it back…" });
          account.addElsewhere({ cents: was.cents, date: iso, recipient: was.recipient, label: was.label }).then((a) =>
            setUndo({ text: a.ok ? "Taken back. It's back in your records." : "We couldn't put it back. Check your connection, then log it again." }),
          );
        },
      });
    });
  };
  const changeRecurring = async (id: string, status: "active" | "paused" | "cancelled") => {
    if (busy) return;
    const which = recurring.find((r) => r.id === id);
    setBusy(true);
    const r = await account.setRecurringStatus(id, status);
    setBusy(false);
    setConfirmCancel(false);
    const verb = status === "paused" ? "pause" : status === "active" ? "resume" : "cancel";
    setRecurringError(r.ok ? null : `We couldn't ${verb} it, so your monthly donation is unchanged. Check your connection and try again.`);
    if (!r.ok) return;
    setOpen(null);
    const name = which?.charityName ?? "this charity";
    if (status === "paused") setUndo({ text: `Paused your monthly donation to ${name}. Nothing more is collected until you resume it.`, label: "Undo", run: () => void changeRecurring(id, "active") });
    else if (status === "active") setUndo({ text: `Resumed your monthly donation to ${name}.` });
    else if (which?.status === "failed") setUndo({ text: `Removed the stopped monthly donation to ${name} from your list.` });
    else setUndo({ text: `Cancellation of your monthly donation to ${name} is requested. Nothing more is collected once the payment provider confirms.` });
  };
  const saveElsewhere = async (e: { cents: number; date: string; recipient: string; label: string | null }): Promise<string | null> => {
    const logged = `Logged ${rand(e.cents)} given to ${e.recipient}.`;
    if (preview) {
      const id = `p${Date.now()}`;
      setPreviewElsewhere((rows) => [{ id, date: isoToDate(e.date), recipient: e.recipient, cents: e.cents, label: e.label }, ...rows]);
      setLogging(null);
      setUndo({ text: logged, label: "Undo", run: () => { setPreviewElsewhere((rows) => rows.filter((r) => r.id !== id)); setUndo({ text: "Taken back. It's removed from your records." }); } });
      return null;
    }
    const r = await account.addElsewhere(e);
    if (!r.ok) return r.message;
    setLogging(null);
    const newId = r.id;
    setUndo(
      newId
        ? {
            text: logged,
            label: "Undo",
            run: () => {
              setUndo({ text: "Taking it back…" });
              account.removeElsewhere(newId).then((x) => setUndo({ text: x.ok ? "Taken back. It's removed from your records." : "We couldn't take it back. Check your connection, then remove it from the list." }));
            },
          }
        : { text: logged },
    );
    return null;
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        ref={scrollRef}
        onScroll={status.onScroll}
        scrollEventThrottle={16}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={signedIn ? <RefreshControl refreshing={account.refreshing} onRefresh={account.refresh} /> : undefined}
        contentContainerStyle={{ paddingBottom: 40, gap: space.block }}>
        <BlueHeader paddingTop={insets.top + 20}>
          <Text style={styles.headTitle} accessibilityRole="header">Progress</Text>
          {main && mainProgress && state === "ready" && goalsLoaded && !goalsProblem ? (
            <View style={{ gap: 18, marginTop: 8 }}>
              <View style={styles.ringRow}>
                <GoalRing percent={mainPct} size={width < 360 ? 112 : 140} onBlue stroke={14} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.headKicker} numberOfLines={1}>{main.name}</Text>
                  <Text style={styles.headWindow} numberOfLines={2}>{mainProgress.window.label}</Text>
                  <Text style={[styles.headAmount, bigAmountSize(rand(mainProgress.givenCents), width, 34)]}>{rand(mainProgress.givenCents)}</Text>
                  <Text style={styles.headLine}>
                    {mainProgress.targetCents === null ? "Log your income to see the goal" : `of ${rand(mainProgress.targetCents)}`}
                  </Text>
                  {mainProgress.targetCents !== null ? (
                    <Text style={styles.headLine}>{mainProgress.leftCents > 0 ? `${rand(mainProgress.leftCents)} to go` : "Goal reached"}</Text>
                  ) : null}
                </View>
              </View>
              <View style={styles.tiles} accessibilityLabel="Months with a gift, filled by how much of each month's share of the goal was given">
                {tiles.map((t, i) => (
                  <Pressable
                    key={i}
                    style={styles.tileWrap}
                    onPress={() => setPickedMonth(openMonth === t.key ? "closed" : t.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: openMonth === t.key }}
                    accessibilityLabel={`${t.label}: show this month`}
                    hitSlop={{ top: 6, bottom: 6 }}
                  >
                    {/* A given month fills from the bottom by how much of that month's share of the goal was given. */}
                    <View style={[styles.tile, t.future && !t.given ? styles.tileFuture : styles.tileEmpty, t.current && styles.tileNow]}>
                      {t.given ? <View style={[styles.tileFill, { height: `${t.fill / 10}%` }]} /> : null}
                    </View>
                    <Text style={[styles.tileLabel, width < 340 && { fontSize: 8.5 }, openMonth === t.key && styles.tileLabelOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
              {detail ? (
                <View style={styles.monthPanel} accessibilityLiveRegion="polite">
                  <View style={styles.monthPanelHead}>
                    <Text style={styles.monthPanelTitle}>{detail.when === "current" ? `${detail.title.split(" ")[0]} so far` : detail.title}</Text>
                    <Text style={styles.monthPanelAmount}>
                      {detail.when === "future" ? "Still to come" : detail.shareCents !== null ? `${rand(detail.givenCents)} of ${rand(detail.shareCents)}` : rand(detail.givenCents)}
                    </Text>
                  </View>
                  {detail.when !== "future" && detail.shareCents !== null ? (
                    <View style={styles.monthBarTrack}>
                      <View style={[styles.monthBarFill, { width: `${Math.min(100, Math.floor((detail.givenCents * 100) / detail.shareCents))}%` }]} />
                    </View>
                  ) : null}
                  {detail.line ? <Text variant="bodyMuted">{detail.line}</Text> : null}
                  {detail.gifts.map((g) => (
                    <View key={g.id} style={styles.monthGift}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text numberOfLines={2} style={{ fontSize: 16, lineHeight: 21 }}>{g.name}</Text>
                        <Text variant="label">{[ddmmyyyy(g.date), g.label, g.elsewhere ? "Given elsewhere" : null].filter(Boolean).join(" · ")}</Text>
                      </View>
                      <Text style={styles.monthGiftAmount}>{rand(g.cents)}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : (
            <Text style={styles.headLine}>Your giving, your goals and what you have given elsewhere, in one place.</Text>
          )}
        </BlueHeader>
        <View style={{ paddingHorizontal: space.gutter, gap: space.block }} onLayout={(e) => setBodyY(e.nativeEvent.layout.y)}>
        {state === "loading" ? (
          <View style={{ gap: space.block }}>
            <SkeletonBlock height={190} />
            <SkeletonBlock height={80} />
            <SkeletonBlock height={200} />
          </View>
        ) : state === "error" ? (
          <ErrorState body="We couldn't load your giving. Check your connection and try again." onRetry={() => (preview ? router.replace("/giving") : account.refresh())} />
        ) : (
          <>
            {account.live?.fromCache && account.loadError ? <OfflineNote savedAt={account.live.loadedAt} /> : null}
            {preview || signedIn ? <InsightsLink /> : null}
            {account.status === "signed-out" ? (
              <View style={styles.blueCard}>
                <Bubbles
                  items={[
                    { size: 96, color: colors.lilac, ring: true, at: { right: -34, bottom: -38 } },
                    { size: 14, color: colors.orange, float: true, at: { right: 26, top: 22 } },
                  ]}
                />
                <Text style={styles.blueCardTitle}>See your giving here</Text>
                <Text style={styles.blueCardBody}>Sign in with the email you give with. Every donation shows up here, and counts towards your giving goal.</Text>
                <Button variant="white" label="Sign in" onPress={() => router.push("/account")} style={{ marginTop: 6 }} />
              </View>
            ) : null}
            {goalsSaveFailed ? (
              <RecordProblem
                title="Your goals are not saved yet"
                body="They show here, but could not be saved on this phone, so they would be lost when the app closes. Please try saving again."
                retryLabel="Try saving again"
                onRetry={() => void persistGoals(goals, owner)}
              />
            ) : null}
            {goalsProblem ? (
              <RecordProblem
                title="We couldn't open your goals"
                body={
                  goalsProblem === "unreadable"
                    ? "Your goals are still saved on this phone. Nothing has been changed. Please try again."
                    : "The saved goals on this phone can't be read. Nothing has been changed yet. You can try again, or set the old ones aside and set new goals (the old ones are kept on this phone)."
                }
                onRetry={goalsRecord.retry}
                secondaryLabel={goalsProblem === "corrupt" ? "Set the old goals aside and start again" : undefined}
                onSecondary={() => confirmThen("Start new goals?", "The old goals are kept aside on this phone, and you can set new ones.", "Start again", () => void startAgain(() => setAsideGoals(owner), goalsRecord.retry, "goals"))}
              />
            ) : account.status === "agreeing" ? (
              <View style={styles.softCard}>
                <Text variant="h2" style={styles.cardTitle}>One more step</Text>
                <Text variant="bodyMuted">Agree to the Terms and Privacy Policy on the Account tab, and your giving and goals appear here.</Text>
                <Button label="Go to Account" onPress={() => router.push("/account")} />
              </View>
            ) : !goalsLoaded ? (
              <SkeletonBlock height={190} />
            ) : editing !== null ? (
              <GoalEditor
                initial={goals.find((g) => g.id === editing) ?? null}
                labels={labels}
                onSave={(g) => putGoals(goals.some((x) => x.id === g.id) ? goals.map((x) => (x.id === g.id ? g : x)) : [...goals, g].slice(0, MAX_GOALS))}
                onCancel={() => setEditing(null)}
                onRemove={goals.some((g) => g.id === editing) ? () => {
                  const before = goals;
                  putGoals(goals.filter((g) => g.id !== editing), "Saved.");
                  setUndo({ text: "Goal removed. Your giving stays as it is.", label: "Undo", run: () => { putGoals(before, "Saved."); setUndo({ text: "Taken back. Your goal is back." }); } });
                } : undefined}
              />
            ) : goals.length === 0 ? (
              <View style={styles.softCard}>
                <Bubbles
                  items={[
                    { size: 140, color: colors.peach, at: { right: -50, top: -50 } },
                    { size: 12, color: colors.orange, float: true, at: { right: 34, top: 26 } },
                    { size: 24, color: colors.blue, ring: true, float: true, at: { left: 20, top: 22 } },
                  ]}
                />
                <People name="dreamGift" width={Math.min(220, width - space.gutter * 2 - 80)} style={{ alignSelf: "center", marginBottom: 6 }} />
                <Text variant="h2" style={styles.cardTitle}>Set a <Text variant="h2" style={[styles.cardTitle, { color: colors.blue }]}>giving goal</Text></Text>
                <Text variant="bodyMuted">A set amount, like R12 000 a year, or a share of your income, like 10%. See how you&apos;re doing as you give. Only you see it.</Text>
                <Button label="Set a goal" onPress={() => { setSaved(null); setEditing("new"); }} style={{ marginTop: 8 }} />
              </View>
            ) : (
              <View style={{ gap: 26 }}>
                {/* One chip per goal opens it to change; the first is the ring above. */}
                <View style={styles.goalChips}>
                  {goals.map((g) => (
                    <Pressable key={g.id} accessibilityRole="button" accessibilityLabel={`Change ${g.name}`} onPress={() => { setSaved(null); setEditing(g.id); }} style={styles.goalChip}>
                      <Text style={styles.goalChipText}>{g.name}</Text>
                    </Pressable>
                  ))}
                  {goals.length < MAX_GOALS ? (
                    <Pressable accessibilityRole="button" onPress={() => { setSaved(null); setEditing("new"); }} style={[styles.goalChip, styles.goalChipAdd]}>
                      <Text style={[styles.goalChipText, { color: colors.blue }]}>Add a goal</Text>
                    </Pressable>
                  ) : null}
                </View>
                {goals.map((g, i) => {
                  const pr = i === 0 && mainProgress ? mainProgress : goalProgress(g, goalRows, income, now);
                  return (
                    <View key={g.id} style={{ gap: 10 }}>
                      {i === 0 ? null : pr.targetCents === null ? (
                        <View style={{ gap: 6 }}>
                          <Text style={styles.stripKicker}>{g.name} · {pr.window.label}</Text>
                          <Text variant="amount" style={{ fontSize: 34, lineHeight: 38 }}>{rand(pr.givenCents)} given</Text>
                          <Text variant="bodyMuted">This goal is a share of your income. Log your income below and we work out the amount.</Text>
                        </View>
                      ) : (
                        <GoalProgressLine title={g.name} givenCents={pr.givenCents} targetCents={pr.targetCents} period={g.period} periodLabel={pr.window.label} endLabel={pr.window.endLabel} compact />
                      )}
                      {i === 0 && pr.targetCents === null ? (
                        <Text variant="bodyMuted">{g.name} is a share of your income. Log your income below and we work out the amount.</Text>
                      ) : null}
                      {pr.perMonthCents > 0 ? (
                        <Text variant="bodyMuted">{i === 0 ? `${g.name}: about` : "About"} {rand(pr.perMonthCents)} a month over the {pr.window.monthsLeft} {pr.window.monthsLeft === 1 ? "month" : "months"} left.</Text>
                      ) : null}
                      <Text variant="label">{g.counts ? `Counts gifts labelled ${g.counts.join(", ")}.` : "Counts all your giving, including giving you logged elsewhere."}</Text>
                    </View>
                  );
                })}
                {saved ? (
                  <Text variant="label" style={{ paddingHorizontal: 4, color: saved === "Saving…" ? colors.ink : colors.successText }} accessibilityLiveRegion="polite">{saved}</Text>
                ) : null}
                <TextLink label="Find a charity" onPress={() => router.push("/discover")} />
              </View>
            )}

            {/* Your records: income (kept on this phone) and giving made elsewhere. */}
            {preview || signedIn ? (
              <View style={{ gap: 12 }}>
                <Text variant="h2" style={styles.heading}>Your records</Text>
                {usesIncome && income.length === 0 ? (
                  <Text variant="bodyMuted">Log your income so a goal set as a share of income can work out its amount.</Text>
                ) : null}

                {incomeProblem ? (
                  <RecordProblem
                    title="We couldn't open your income log"
                    body={
                      incomeProblem === "unreadable"
                        ? "Your income log is still saved on this phone. Nothing has been changed, and you can't add to it until it opens. Please try again."
                        : "The saved income log on this phone can't be read. Nothing has been changed yet. You can try again, or set the old log aside and start a new one (the old one is kept on this phone)."
                    }
                    onRetry={incomeRecord.retry}
                    secondaryLabel={incomeProblem === "corrupt" ? "Set the old log aside and start a new one" : undefined}
                    onSecondary={() => confirmThen("Start a new income log?", "The old log is kept aside on this phone, and you can start a new one.", "Start new log", () => void startAgain(() => startNewIncomeLog(owner), incomeRecord.retry, "income log"))}
                  />
                ) : null}
                {incomeSaveFailed ? (
                  <RecordProblem
                    title="Your income log is not saved yet"
                    body="Your latest change shows here, but could not be saved on this phone, so it would be lost when the app closes. Please try saving again."
                    retryLabel="Try saving again"
                    onRetry={() => void persistIncome(income, owner)}
                  />
                ) : null}

                {/* Side by side only where both labels fit on one line; on most phones they stack. */}
                <View style={{ flexDirection: width < 430 ? "column" : "row", gap: 10 }}>
                  <View style={{ flex: width < 430 ? undefined : 1 }}><Button variant="secondary" label="Log income" disabled={!incomeReady} onPress={() => setLogging("income")} /></View>
                  <View style={{ flex: width < 430 ? undefined : 1 }}><Button variant="secondary" label="Given elsewhere" onPress={() => setLogging("elsewhere")} /></View>
                </View>

                {income.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <Text variant="label">Income log (on this phone only)</Text>
                    <View style={styles.list}>
                      {(showAllIncome ? income : income.slice(0, 12)).map((e, i) => (
                        <Pressable key={e.id} onLongPress={() => confirmRemove("income entry", () => removeIncome(e.id))} accessibilityRole="button" accessibilityHint="Press and hold to remove" accessibilityActions={[{ name: "delete", label: "Remove" }]} onAccessibilityAction={(ev) => ev.nativeEvent.actionName === "delete" && confirmRemove("income entry", () => removeIncome(e.id))} accessibilityLabel={`${rand(e.cents)}, ${ddmmyyyy(isoToDate(e.date))}${e.note ? `, ${e.note}` : ""}`} style={[styles.row, i > 0 && styles.divider]}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 17 }}>{e.note || "Income"}</Text>
                            <Text variant="bodyMuted" style={{ fontSize: 16 }}>{ddmmyyyy(isoToDate(e.date))}</Text>
                          </View>
                          <Text style={{ fontSize: 17 }}>{rand(e.cents)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {income.length > 12 && !showAllIncome ? <TextLink label={`Show all ${income.length}`} onPress={() => setShowAllIncome(true)} /> : null}
                    <Text variant="label">Press and hold an entry to remove it. You can take it back straight after.</Text>
                  </View>
                ) : null}

                {elsewhere.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <Text variant="label">Given elsewhere</Text>
                    <View style={styles.list}>
                      {(showAllElsewhere ? elsewhere : elsewhere.slice(0, 12)).map((e, i) => (
                        <Pressable
                          key={e.id}
                          onLongPress={() => confirmRemove("entry", () => removeElsewhereEntry(e.id))}
                          accessibilityActions={[{ name: "delete", label: "Remove" }]}
                          onAccessibilityAction={(ev) => ev.nativeEvent.actionName === "delete" && confirmRemove("entry", () => removeElsewhereEntry(e.id))}
                          accessibilityRole="button"
                          accessibilityHint="Press and hold to remove"
                          accessibilityLabel={`${e.recipient}, ${rand(e.cents)}, ${ddmmyyyy(e.date)}${e.label ? `, ${e.label}` : ""}`}
                          style={[styles.row, i > 0 && styles.divider, removing === e.id && { opacity: 0.4 }]}
                        >
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 17 }}>{e.recipient}</Text>
                            <Text variant="bodyMuted" style={{ fontSize: 16 }}>{removing === e.id ? "Removing…" : `${ddmmyyyy(e.date)}${e.label ? ` · ${e.label}` : ""}`}</Text>
                          </View>
                          <Text style={{ fontSize: 17 }}>{rand(e.cents)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {elsewhere.length > 12 && !showAllElsewhere ? <TextLink label={`Show all ${elsewhere.length}`} onPress={() => setShowAllElsewhere(true)} /> : null}
                    <Text variant="label">These count towards your goals. Press and hold an entry to remove it. You can take it back straight after.</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {myGifts.length > 0 ? (
              <View style={{ gap: 12 }} onLayout={(e) => setSectionY((s) => ({ ...s, year: e.nativeEvent.layout.y }))}>
                <Text variant="h2" style={styles.heading}>
                  {shownYear === "all" ? "All your giving" : shownYear === taxYear ? `${taxYearName(shownYear)} tax year so far` : `${taxYearName(shownYear)} tax year in numbers`}
                </Text>
                {years.length > 1 ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.gutter }} contentContainerStyle={styles.yearChips} accessibilityRole="radiogroup" accessibilityLabel="Which tax year">
                    {[...years, "all" as const].map((y) => {
                      const selected = y === shownYear;
                      return (
                        <Pressable key={y} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setPickedYear(y)} style={[styles.goalChip, selected && styles.yearChipOn]}>
                          <Text style={[styles.goalChipText, selected && { color: colors.onInk }]}>
                            {y === "all" ? "All time" : y === taxYear ? `${taxYearName(y)} tax year so far` : `${taxYearName(y)} tax year`}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : null}
                <Text variant="label">{shownYear === "all" ? `Since your first donation on ${ddmmyyyy(myGifts.reduce((a, g) => (g.date < a ? g.date : a), myGifts[0].date))}` : taxYearRangeLabel(shownYear)}</Text>
                {yearGifts.length === 0 ? (
                  <Text variant="bodyMuted">No donations yet this tax year.</Text>
                ) : (
                  <View style={styles.strip}>
                    <Bubbles
                      items={[
                        { size: 110, color: colors.surface, at: { right: -40, top: -44 } },
                        { size: 10, color: colors.orange, float: true, at: { right: 28, top: 20 } },
                      ]}
                    />
                    <Text style={styles.summary}>
                      You gave <Text style={styles.summaryFigure}>{rand(giftsTotal)}</Text> in {yearGifts.length} {yearGifts.length === 1 ? "donation" : "donations"} to {charities.length} {charities.length === 1 ? "charity" : "charities"}.
                    </Text>
                    {shownYear === taxYear && monthTotal > 0 ? <Text variant="bodyMuted">This month so far: {rand(monthTotal)}.</Text> : null}
                  </View>
                )}
                {yearGifts.length === 0 && shownYear === taxYear && monthTotal > 0 ? <Text variant="bodyMuted">This month so far: {rand(monthTotal)}.</Text> : null}
                {charities.length > 0 ? (
                  <View style={styles.list}>
                    {charities.map((c, i) => (
                      <View key={c.name} style={[styles.share, i > 0 && styles.divider]} accessible accessibilityLabel={`${c.name}: ${rand(c.cents)}, ${percentOf(c.cents, giftsTotal)} per cent`}>
                        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
                          <Text style={{ flex: 1, fontSize: 17 }}>{c.name}</Text>
                          <Text variant="bodyMuted" style={{ fontSize: 15 }}>{percentOf(c.cents, giftsTotal)}%</Text>
                          <Text style={{ fontSize: 17, fontFamily: fonts.bodySemibold }}>{rand(c.cents)}</Text>
                        </View>
                        <View style={styles.shareTrack}>
                          <View style={[styles.shareFill, { width: `${Math.max(percentOf(c.cents, giftsTotal), 2)}%` }]} />
                        </View>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View style={styles.list}>
                  <View style={styles.row}>
                    <Text style={{ flex: 1, fontSize: 17 }}>With an s18A receipt</Text>
                    <Text style={{ fontSize: 17 }}>{rand(with18a)}</Text>
                  </View>
                  <View style={[styles.row, styles.divider]}>
                    <Text style={{ flex: 1, fontSize: 17 }}>Without an s18A receipt</Text>
                    <Text style={{ fontSize: 17 }}>{rand(giftsTotal - with18a)}</Text>
                  </View>
                </View>
                {byLabel.some((l) => l.label !== null) ? (
                  <View style={styles.list}>
                    {byLabel.map((l, i) => (
                      <View key={l.label ?? "none"} style={[styles.row, i > 0 && styles.divider]}>
                        <View style={[styles.dot, { backgroundColor: labelColour(l.label) }]} />
                        <Text style={{ flex: 1, fontSize: 17 }}>{l.label ?? "No label"}</Text>
                        <Text style={{ fontSize: 17 }}>{rand(l.cents)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : null}

            <View style={{ gap: 12 }}>
              <Text variant="h2" style={styles.heading}>Your charities</Text>
              {savedList.length ? (
                <View style={{ marginHorizontal: -space.gutter }}>
                  <SavedRow charities={savedList} live={directory.live} />
                </View>
              ) : (
                <Text variant="bodyMuted">Tap the heart on a charity to keep it here, ready to give.</Text>
              )}
            </View>

            {/* Signed out (live): there is no history to show yet, so no empty sections. */}
            {preview || signedIn ? (
            <>
            <View style={{ gap: 12 }} onLayout={(e) => setSectionY((s) => ({ ...s, monthly: e.nativeEvent.layout.y }))}>
              <Text variant="h2" style={styles.heading}>Monthly donations</Text>
              {recurring.length === 0 ? (
                <Text variant="bodyMuted">No monthly donations yet. Switch on &quot;Give every month&quot; when you give.</Text>
              ) : (
                <View style={styles.list}>
                  {recurring.map((r, i) => (
                    <Pressable key={r.id} onPress={() => setOpen(r)} accessibilityRole="button" accessibilityLabel={`${r.charityName}, ${rand(r.cents)} a month, ${r.status}`} style={[styles.row, i > 0 && styles.divider]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 17, fontFamily: fonts.bodySemibold }}>{r.charityName}</Text>
                        <Text variant="bodyMuted" style={{ fontSize: 16 }}>
                          {rand(r.cents)} a month{r.contributionCents ? ` (+ ${rand(r.contributionCents)} to Givezy)` : ""} · {r.status === "failed" ? (r.needsCard ? "Stopped: the card was declined" : "Stopped: start a new monthly donation") : r.needsCard && r.status === "active" ? "Card declined: tap to update" : r.status === "cancelled" ? "Cancellation requested" : r.status === "paused" ? (r.syncing ? "Pause requested" : "Paused") : r.nextDate ? `Next on ${ddmmyyyy(r.nextDate)}` : "Active"}
                        </Text>
                      </View>
                      <ChevronIcon />
                    </Pressable>
                  ))}
                </View>
              )}
            </View>

            <View style={{ gap: 16 }}>
              <Text variant="h2" style={styles.heading}>History</Text>
              {myGifts.length === 0 ? (
                <EmptyState title="No donations yet" body="Donations you make appear here once the payment goes through, and count towards your goals." action={{ label: "Find a charity", onPress: () => router.push("/discover") }} />
              ) : (
                groupByMonth(myGifts).map((g, gi) => (
                  <FadeUp key={g.label} index={gi} style={{ gap: 6 }}>
                    <Text variant="label">{g.label}</Text>
                    <View style={styles.list}>
                      {g.rows.map((gift, i) => (
                        <Pressable key={gift.id} onPress={() => setOpenGift(gift)} accessibilityRole="button" accessibilityLabel={`${gift.charityName}, ${rand(gift.cents)}, ${ddmmyyyy(gift.date)}`} style={[styles.row, i > 0 && styles.divider]}>
                          <View style={[styles.dot, { backgroundColor: labelColour(gift.label) }]} />
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 17 }}>{gift.charityName}</Text>
                            <Text variant="bodyMuted" style={{ fontSize: 16 }}>
                              {ddmmyyyy(gift.date)}{gift.label ? ` · ${gift.label}` : ""}{gift.monthly ? " · Monthly" : ""}{gift.with18a ? "" : " · No s18A"}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 17 }}>{rand(gift.cents)}</Text>
                          <ChevronIcon />
                        </Pressable>
                      ))}
                    </View>
                  </FadeUp>
                ))
              )}
            </View>
            </>
            ) : null}
            {preview && myGifts.length ? <Text variant="label" style={{ textAlign: "center" }}>Sample data: the demo donor&apos;s giving</Text> : null}
            {signedIn && account.live ? (
              <Text variant="label" style={{ textAlign: "center" }}>Updated {ddmmyyyy(jhbDay(account.live.loadedAt))} at {hhmm(account.live.loadedAt)}. Pull down to refresh.</Text>
            ) : null}
          </>
        )}
        </View>
      </ScrollView>
      {status.cover}
      <UndoToast message={undo} />

      <Sheet visible={open !== null} onClose={() => { setOpen(null); setConfirmCancel(false); setRecurringError(null); }}>
        {open ? (
          <View style={{ gap: 18 }}>
            <View style={{ gap: 4 }}>
              <Text variant="label">Monthly donation</Text>
              <Text variant="h2">{open.charityName}</Text>
              <Text variant="bodyMuted">{rand(open.cents)} a month{open.contributionCents ? ` (+ ${rand(open.contributionCents)} to Givezy)` : ""} · {open.status === "failed" ? "stopped" : open.status === "cancelled" ? "cancellation requested" : open.status === "paused" ? "paused" : open.nextDate ? `next on ${ddmmyyyy(open.nextDate)}` : "active"}</Text>
            </View>
            {!preview ? (
              <>
                {open.status === "failed" ? (
                  <View style={{ gap: 10 }}>
                    {open.needsCard ? (
                      <>
                        <Text>We could not collect this monthly donation from your card, so it has stopped and nothing more will be charged. Put in a new card to carry it on: this month is paid with it, then it continues as before.</Text>
                        <Button label={cardBusy ? "Opening…" : "Update card"} disabled={cardBusy} onPress={() => void updateCard(open.id)} />
                      </>
                    ) : (
                      <>
                        <Text>The card you put in can&apos;t be used for monthly payments, so this monthly donation has stopped and nothing more will be charged. To carry on giving monthly, start a new one with a different card.</Text>
                        <Button variant="secondary" label={`Give to ${open.charityName} again`} onPress={() => { const slug = open.charitySlug; setOpen(null); openGiveScreen(slug); }} />
                      </>
                    )}
                    <Text variant="label">{helpLine()}</Text>
                    <Button label={busy ? "Removing…" : "Remove it from my list"} disabled={busy} onPress={() => confirmThen("Remove this monthly donation?", "It has already stopped and nothing more is charged. It will no longer show in your list.", "Remove", () => changeRecurring(open.id, "cancelled"))} />
                  </View>
                ) : open.status === "cancelled" ? (
                  <Text>Cancellation requested. It is confirmed once the payment provider has stopped it.</Text>
                ) : confirmCancel ? (
                  <View style={{ gap: 10 }}>
                    <Text style={{ fontSize: 17 }}>Cancel this monthly donation for good? You would need to set up a new one to give monthly again.</Text>
                    <Button label={busy ? "Cancelling…" : "Yes, cancel it"} disabled={busy} onPress={() => changeRecurring(open.id, "cancelled")} />
                    <TextLink label="Keep it" onPress={() => setConfirmCancel(false)} />
                  </View>
                ) : (
                  <>
                    {open.needsCard && open.status === "active" ? (
                      <View style={{ gap: 10 }}>
                        <Text>Your card was declined this month. Nothing was charged. We will try it again, or you can put in a new card now.</Text>
                        <Button label={cardBusy ? "Opening…" : "Update card"} disabled={cardBusy} onPress={() => void updateCard(open.id)} />
                      </View>
                    ) : null}
                    <Button
                      variant={open.needsCard && open.status === "active" ? "secondary" : undefined}
                      label={busy ? "Saving…" : open.status === "paused" ? "Resume" : "Pause"}
                      disabled={busy}
                      onPress={() => changeRecurring(open.id, open.status === "paused" ? "active" : "paused")}
                    />
                    <Pressable accessibilityRole="button" onPress={() => setConfirmCancel(true)} style={styles.cancel}>
                      <Text style={[type.button, { color: colors.danger }]}>Cancel monthly donation</Text>
                    </Pressable>
                  </>
                )}
                {recurringError ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{recurringError}</Text> : null}
                <Text variant="label">
                  {open.syncing
                    ? "Your change is saved and waiting for the payment provider to apply it."
                    : "Changes apply straight away, or once the payment provider confirms them. Past donations stay in your history."}
                </Text>
              </>
            ) : (
            <>
            {confirmCancel ? (
              <View style={{ gap: 10 }}>
                <Text style={{ fontSize: 17 }}>Cancel this monthly donation for good? You would need to set up a new one to give monthly again.</Text>
                <Button
                  label="Yes, cancel it"
                  onPress={() => {
                    const name = open.charityName;
                    setRecurring((rs) => rs.filter((r) => r.id !== open.id));
                    setOpen(null);
                    setConfirmCancel(false);
                    setUndo({ text: `Cancellation of your monthly donation to ${name} is requested. Nothing more is collected once the payment provider confirms.` });
                  }}
                />
                <Button variant="secondary" label="Keep it" onPress={() => setConfirmCancel(false)} />
              </View>
            ) : (
              <>
                <Button
                  label={open.status === "paused" ? "Resume" : "Pause"}
                  onPress={() => {
                    const id = open.id;
                    const name = open.charityName;
                    const pausing = open.status !== "paused";
                    const flip = () => setRecurring((rs) => rs.map((r) => (r.id === id ? { ...r, status: r.status === "paused" ? "active" : "paused" } : r)));
                    flip();
                    setOpen(null);
                    setUndo(
                      pausing
                        ? { text: `Paused your monthly donation to ${name}. Nothing more is collected until you resume it.`, label: "Undo", run: () => { flip(); setUndo({ text: `Resumed your monthly donation to ${name}.` }); } }
                        : { text: `Resumed your monthly donation to ${name}.` },
                    );
                  }}
                />
                <Pressable accessibilityRole="button" onPress={() => setConfirmCancel(true)} style={styles.cancel}>
                  <Text style={[type.button, { color: colors.danger }]}>Cancel monthly donation</Text>
                </Pressable>
              </>
            )}
            <Text variant="label">Cancelling stops all future payments with the payment provider. Past donations stay in your history.</Text>
            </>
            )}
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={logging !== null} onClose={() => setLogging(null)} guard={logGuard}>
        {logging === "income" ? <IncomeForm onSave={addIncome} onCancel={() => setLogging(null)} onGuard={setLogGuard} /> : null}
        {logging === "elsewhere" ? <ElsewhereForm onSave={saveElsewhere} onCancel={() => setLogging(null)} onGuard={setLogGuard} /> : null}
      </Sheet>

      <Sheet visible={openGift !== null} onClose={() => setOpenGift(null)}>
        {openGift ? (
          <View style={{ gap: 18 }}>
            <View style={{ gap: 4 }}>
              <Text variant="label">Donation</Text>
              <Text variant="h2">{openGift.charityName}</Text>
              <Text variant="amount" style={{ fontSize: 36, lineHeight: 42 }}>{rand(openGift.cents)}</Text>
            </View>
            <View style={styles.list}>
              <DetailRow label="Date" value={ddmmyyyy(openGift.date)} />
              <DetailRow label="Label" value={openGift.label ?? "None"} divider />
              <DetailRow label="Type" value={openGift.monthly ? "Monthly" : "Once-off"} divider />
              <DetailRow label="s18A receipt" value={openGift.with18a ? "Yes" : "No"} divider />
            </View>
            <Button label="Close" onPress={() => setOpenGift(null)} />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function DetailRow({ label, value, divider }: { label: string; value: string; divider?: boolean }) {
  return (
    <View style={[styles.row, divider && styles.divider]}>
      <Text style={{ flex: 1, fontSize: 17 }}>{label}</Text>
      <Text style={{ fontSize: 17 }}>{value}</Text>
    </View>
  );
}

/** Each label keeps one colour everywhere (picked from the label's letters); no label is grey. */
const PALETTE = [colors.blue, colors.orange, colors.lilac, colors.sage];
function labelColour(label: string | null): string {
  if (!label) return colors.hairline;
  let h = 0;
  for (const ch of label.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** Totals by label, largest first; gifts without one under null. Same label whatever the case. */
function labelTotals(rows: { cents: number; label: string | null }[]): { label: string | null; cents: number }[] {
  const m = new Map<string, { label: string | null; cents: number }>();
  for (const r of rows) {
    const key = r.label ? r.label.toLowerCase() : "";
    const t = m.get(key) ?? { label: r.label, cents: 0 };
    t.cents += r.cents;
    m.set(key, t);
  }
  return [...m.values()].sort((a, b) => b.cents - a.cents);
}

const noGoals: Goal[] = [];
const noIncome: IncomeEntry[] = [];
const newEntryId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  headTitle: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 37, letterSpacing: -0.4, color: colors.onInk },
  headKicker: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.lilac },
  headWindow: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.lilacSoft, marginBottom: 2 },
  headAmount: { fontFamily: fonts.displayBold, fontSize: 34, lineHeight: 40, letterSpacing: -0.4, color: colors.onInk },
  headLine: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.lilacSoft },
  ringRow: { flexDirection: "row", alignItems: "center", gap: 18 },
  tiles: { flexDirection: "row", gap: 4 },
  tileWrap: { flex: 1, alignItems: "center", gap: 4, minWidth: 0 },
  tile: { width: "100%", height: 22, borderRadius: 7, overflow: "hidden", justifyContent: "flex-end" },
  tileFill: { width: "100%", backgroundColor: colors.orange },
  tileEmpty: { backgroundColor: colors.blueTrack },
  tileFuture: { borderWidth: 1.5, borderStyle: "dashed", borderColor: colors.lilac },
  tileNow: { borderWidth: 2, borderColor: colors.onInk },
  tileLabel: { fontFamily: fonts.bodySemibold, fontSize: 10, color: colors.lilacSoft, textAlign: "center" },
  tileLabelOn: { color: colors.onInk, fontFamily: fonts.bodyBold },
  monthPanel: { gap: 8, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface },
  // Title and amount side by side; on a narrow phone the amount moves under the title, never split.
  monthPanelHead: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", columnGap: 12, rowGap: 2 },
  monthPanelTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink, flexShrink: 0 },
  monthPanelAmount: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink, flexShrink: 0 },
  monthBarTrack: { height: 8, borderRadius: 4, backgroundColor: colors.lightPurple, overflow: "hidden" },
  monthBarFill: { height: 8, borderRadius: 4, backgroundColor: colors.orange },
  monthGift: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.lightPurple },
  monthGiftAmount: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.ink },
  goalChips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  goalChip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface, justifyContent: "center" },
  goalChipAdd: { borderStyle: "dashed", borderColor: colors.blue },
  goalChipText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.navy },
  yearChips: { gap: 8, paddingHorizontal: space.gutter },
  yearChipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  heading: { fontSize: 24, lineHeight: 30 },
  // Lists sit in a soft white card with the light purple border, rows ruled inside it like a ledger.
  list: { borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface, paddingHorizontal: 16, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 2, paddingVertical: 12, minHeight: touch + 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  share: { gap: 8, paddingVertical: 12, paddingHorizontal: 2 },
  shareTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.lilacSoft, overflow: "hidden" },
  shareFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.blue },
  summary: { fontFamily: fonts.display, fontSize: 24, lineHeight: 32, color: colors.navy, paddingRight: 24 },
  summaryFigure: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 32, color: colors.blue },
  strip: { gap: 6, padding: 20, borderRadius: radius.card, backgroundColor: colors.lilacSoft, borderWidth: 1.5, borderColor: colors.lightPurple, overflow: "hidden" },
  stripKicker: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.blue },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  cancel: { minHeight: touch, alignItems: "center", justifyContent: "center" },
  softCard: { gap: 8, padding: 22, borderRadius: radius.card, backgroundColor: colors.lilacSoft, borderWidth: 1.5, borderColor: colors.lightPurple, overflow: "hidden" },
  cardTitle: { fontSize: 24, lineHeight: 30 },
  blueCard: { gap: 8, padding: 22, borderRadius: radius.card, backgroundColor: colors.blue, overflow: "hidden" },
  blueCardTitle: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27, color: colors.onInk, paddingRight: 24 },
  blueCardBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.lilacSoft },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
