import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, TextLink } from "@/components/button";
import { Splash } from "@/components/splash";
import { HeaderCurve } from "@/components/backdrop";
import { FadeUp } from "@/components/fade-up";
import { ChevronIcon } from "@/components/icons";
import { MaaserProgress } from "@/components/maaser-progress";
import { Sheet } from "@/components/sheet";
import { EmptyState, ErrorState, OfflineNote, SkeletonBlock } from "@/components/states";
import { ElsewhereForm, IncomeForm } from "@/components/log-sheets";
import { GoalEditor } from "@/components/goal-editor";
import { Text } from "@/components/text";
import { gifts, givenElsewhere as sampleElsewhere, recurring as sampleRecurring, sampleGoals, type Gift, type Recurring } from "@/data/giving";
import { ddmmyyyy, jhbToday, rand } from "@/lib/format";
import { byCharity, groupByMonth, percentOf } from "@/lib/giving";
import { goalProgress, knownLabels, MAX_GOALS, type Goal } from "@/lib/goals";
import { loadGoals, saveGoals, setAsideGoals } from "@/lib/goals-store";
import { useJewishMode } from "@/lib/jewish-mode";
import { JEWISH_LABELS } from "@shared/donations/labels";
import { taxYearFor, taxYearRangeLabel } from "@/lib/tax-year";
import { useAccount } from "@/lib/account";
import { loadIncome, saveIncome, startNewIncomeLog } from "@/lib/income-store";
import { isoToDate, type Elsewhere, type IncomeEntry } from "@/lib/ledger";
import { useScreenState } from "@/lib/screen-state";
import { useDirectory } from "@/lib/directory";
import { savedCharities } from "@/lib/live-charities";
import { useSaved } from "@/lib/saved";
import { SavedRow } from "@/components/saved-row";
import { confirmThen, notify } from "@/lib/open-site";
import { RecordProblem } from "@/components/record-problem";
import { useStoredRecord } from "@/lib/use-stored-record";
import type { SaveResult } from "@/lib/stored-result";
import { colors, fonts, radius, space, touch, type } from "@/theme/tokens";

/** Screen 7: Giving, with the donor's goals. */
export default function Giving() {
  const insets = useSafeAreaInsets();
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
  const p = useLocalSearchParams<{ demo?: string; sheet?: string }>();
  const newDonor = preview ? demoState === "empty" : !signedIn;
  const previewGoals = !preview || newDonor || p.demo === "first" ? noGoals : sampleGoals;
  const jewish = useJewishMode();
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
  };
  const putGoals = (next: Goal[]) => {
    goalsRecord.setValue(next);
    if (!preview) void persistGoals(next, owner);
    setEditing(null);
    setSaved(true);
  };
  // Income (for a goal set as a share of income) stays on this phone only. Nothing is logged until the saved log has loaded.
  const incomeRecord = useStoredRecord<IncomeEntry[]>({ enabled: !preview && ownerKnown, waiting: !preview && !ownerKnown, owner, load: loadIncome, initial: noIncome });
  const income = incomeRecord.value;
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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  // Which goal is open in the editor: its id, "new", or none.
  const [editing, setEditing] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
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
  // "This year in numbers" follows the SARS tax year, like the receipts.
  const yearGifts = myGifts.filter((g) => taxYearFor(g.date) === taxYear);
  const giftsTotal = yearGifts.reduce((t, g) => t + g.cents, 0);
  const monthGifts = myGifts.filter((g) => g.date.getMonth() === now.getMonth() && g.date.getFullYear() === now.getFullYear());
  const monthTotal = monthGifts.reduce((t, g) => t + g.cents, 0);
  const charities = byCharity(yearGifts);
  const with18a = yearGifts.filter((g) => g.with18a).reduce((t, g) => t + g.cents, 0);
  // Everything that can count towards a goal: donations through Givezy and giving logged elsewhere.
  const goalRows = [...myGifts, ...elsewhere];
  const labels = knownLabels(goalRows, jewish ? JEWISH_LABELS : []);
  const byLabel = labelTotals(yearGifts);
  const [openGift, setOpenGift] = useState<Gift | null>(null);
  const usesIncome = goals.some((g) => g.basis === "income");

  const addIncome = (e: { cents: number; date: string; note: string }) => {
    if (!incomeReady) return;
    const next = [{ id: newEntryId(), ...e }, ...income].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    incomeRecord.setValue(next);
    void persistIncome(next, owner);
    setLogging(null);
  };
  const removeIncome = (id: string) => {
    if (!incomeReady) return;
    const next = income.filter((e) => e.id !== id);
    incomeRecord.setValue(next);
    void persistIncome(next, owner);
  };
  const confirmRemove = (what: string, go: () => void) => confirmThen(`Remove this ${what}?`, "This can't be undone.", "Remove", go);
  const removeElsewhereEntry = (id: string) => {
    if (preview) return setPreviewElsewhere((rows) => rows.filter((r) => r.id !== id));
    account.removeElsewhere(id).then((r) => {
      if (!r.ok) notify("Not removed", r.message);
    });
  };
  const changeRecurring = async (id: string, status: "active" | "paused" | "cancelled") => {
    if (busy) return;
    setBusy(true);
    const r = await account.setRecurringStatus(id, status);
    setBusy(false);
    setConfirmCancel(false);
    setRecurringError(r.ok ? null : r.message);
    if (r.ok) setOpen(null);
  };
  const saveElsewhere = async (e: { cents: number; date: string; recipient: string; label: string | null }): Promise<string | null> => {
    if (preview) {
      setPreviewElsewhere((rows) => [{ id: `p${Date.now()}`, date: isoToDate(e.date), recipient: e.recipient, cents: e.cents, label: e.label }, ...rows]);
      setLogging(null);
      return null;
    }
    const r = await account.addElsewhere(e);
    if (r.ok) setLogging(null);
    return r.ok ? null : r.message;
  };

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={signedIn ? <RefreshControl refreshing={account.refreshing} onRefresh={account.refresh} /> : undefined}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: space.gutter, gap: space.block }}>
        <HeaderCurve depth={insets.top + 112} />
        <View>
          <Text variant="h1" accessibilityRole="header">Giving</Text>
          <View style={styles.arc}><Splash size={84} /></View>
        </View>
        {/* Room for the header curve. */}
        <View style={{ height: 20 }} />

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
            {account.status === "signed-out" ? (
              <View style={styles.card}>
                <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>See your giving here</Text>
                <Text variant="bodyMuted">Sign in with the email you give with. Every donation shows up here, and counts towards your giving goal.</Text>
                <Button label="Sign in" onPress={() => router.push("/account")} />
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
              <View style={styles.card}>
                <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>One more step</Text>
                <Text variant="bodyMuted">Agree to the Terms and Privacy Policy on the Account tab, and your giving and goals appear here.</Text>
                <Button label="Go to Account" onPress={() => router.push("/account")} />
              </View>
            ) : !goalsLoaded ? (
              <SkeletonBlock height={190} />
            ) : editing !== null ? (
              <GoalEditor
                initial={goals.find((g) => g.id === editing) ?? null}
                labels={labels}
                jewish={jewish}
                onSave={(g) => putGoals(goals.some((x) => x.id === g.id) ? goals.map((x) => (x.id === g.id ? g : x)) : [...goals, g].slice(0, MAX_GOALS))}
                onCancel={() => setEditing(null)}
                onRemove={goals.some((g) => g.id === editing) ? () => confirmThen("Remove this goal?", "Your giving stays as it is. Only the goal goes.", "Remove", () => putGoals(goals.filter((g) => g.id !== editing))) : undefined}
              />
            ) : goals.length === 0 ? (
              <View style={styles.card}>
                <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>Set a giving goal</Text>
                <Text variant="bodyMuted">A set amount, like R12 000 a year, or a share of your income, like 10%. See how you&apos;re doing as you give. Only you see it.</Text>
                <Button label="Set a goal" onPress={() => { setSaved(false); setEditing("new"); }} />
              </View>
            ) : (
              <View style={{ gap: 26 }}>
                {goals.map((g, i) => {
                  const pr = goalProgress(g, goalRows, income, now);
                  return (
                    <View key={g.id} style={{ gap: 10 }}>
                      {pr.targetCents === null ? (
                        <View style={{ gap: 6 }}>
                          <Text style={styles.stripKicker}>{g.name} · {pr.window.label}</Text>
                          <Text variant="amount" style={{ fontSize: 34, lineHeight: 38 }}>{rand(pr.givenCents)} given</Text>
                          <Text variant="bodyMuted">This goal is a share of your income. Log your income below and we work out the amount.</Text>
                        </View>
                      ) : (
                        <MaaserProgress title={g.name} givenCents={pr.givenCents} targetCents={pr.targetCents} period={g.period} periodLabel={pr.window.label} endLabel={pr.window.endLabel} compact={i > 0} />
                      )}
                      {pr.perMonthCents > 0 ? (
                        <Text variant="bodyMuted">About {rand(pr.perMonthCents)} a month over the {pr.window.monthsLeft} {pr.window.monthsLeft === 1 ? "month" : "months"} left.</Text>
                      ) : null}
                      <Text variant="label">{g.counts ? `Counts gifts labelled ${g.counts.join(", ")}.` : "Counts all your giving, including giving you logged elsewhere."}</Text>
                      <TextLink label="Change" onPress={() => { setSaved(false); setEditing(g.id); }} />
                    </View>
                  );
                })}
                {saved ? (
                  <Text variant="label" style={{ paddingHorizontal: 4, color: colors.successText }} accessibilityLiveRegion="polite">Goal saved.</Text>
                ) : null}
                {goals.length < MAX_GOALS ? <TextLink label="Add another goal" onPress={() => { setSaved(false); setEditing("new"); }} /> : null}
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

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}><Button variant="secondary" label="Log income" disabled={!incomeReady} onPress={() => setLogging("income")} /></View>
                  <View style={{ flex: 1 }}><Button variant="secondary" label="Given elsewhere" onPress={() => setLogging("elsewhere")} /></View>
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
                    <Text variant="label">Press and hold an entry to remove it.</Text>
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
                          style={[styles.row, i > 0 && styles.divider]}
                        >
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 17 }}>{e.recipient}</Text>
                            <Text variant="bodyMuted" style={{ fontSize: 16 }}>{ddmmyyyy(e.date)}{e.label ? ` · ${e.label}` : ""}</Text>
                          </View>
                          <Text style={{ fontSize: 17 }}>{rand(e.cents)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    {elsewhere.length > 12 && !showAllElsewhere ? <TextLink label={`Show all ${elsewhere.length}`} onPress={() => setShowAllElsewhere(true)} /> : null}
                    <Text variant="label">These count towards your goals. Press and hold an entry to remove it.</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {myGifts.length > 0 ? (
              <View style={{ gap: 12 }}>
                <Text variant="h2" style={styles.heading}>This tax year in numbers</Text>
                <Text variant="label">{taxYearRangeLabel(taxYear)}</Text>
                <Text style={styles.summary}>
                  You gave <Text style={styles.summaryFigure}>{rand(giftsTotal)}</Text> in {yearGifts.length} {yearGifts.length === 1 ? "donation" : "donations"} to {charities.length} {charities.length === 1 ? "charity" : "charities"}.
                </Text>
                {monthTotal > 0 ? <Text variant="bodyMuted">This month so far: {rand(monthTotal)}.</Text> : null}
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
            <View style={{ gap: 12 }}>
              <Text variant="h2" style={styles.heading}>Monthly donations</Text>
              {recurring.length === 0 ? (
                <Text variant="bodyMuted">No monthly donations yet. Tick the monthly option on the payment page when you give.</Text>
              ) : (
                <View style={styles.list}>
                  {recurring.map((r, i) => (
                    <Pressable key={r.id} onPress={() => setOpen(r)} accessibilityRole="button" accessibilityLabel={`${r.charityName}, ${rand(r.cents)} a month, ${r.status}`} style={[styles.row, i > 0 && styles.divider]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 17, fontFamily: fonts.bodySemibold }}>{r.charityName}</Text>
                        <Text variant="bodyMuted" style={{ fontSize: 16 }}>
                          {r.status === "failed" ? "Stopped: the card was declined" : r.status === "cancelled" ? "Cancellation requested" : r.status === "paused" ? (r.syncing ? "Pause requested" : "Paused") : r.nextDate ? `Next on ${ddmmyyyy(r.nextDate)}` : "Active"}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 17 }}>{rand(r.cents)}/month</Text>
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
            {preview && myGifts.length ? <Text variant="label" style={{ textAlign: "center" }}>Sample giving history for design review</Text> : null}
            {signedIn && account.live ? (
              <Text variant="label" style={{ textAlign: "center" }}>Updated {ddmmyyyy(account.live.loadedAt)}. Pull down to refresh.</Text>
            ) : null}
          </>
        )}
      </ScrollView>

      <Sheet visible={open !== null} onClose={() => { setOpen(null); setConfirmCancel(false); setRecurringError(null); }}>
        {open ? (
          <View style={{ gap: 18 }}>
            <View style={{ gap: 4 }}>
              <Text variant="label">Monthly donation</Text>
              <Text variant="h2">{open.charityName}</Text>
              <Text variant="bodyMuted">{rand(open.cents)} a month · {open.status === "failed" ? "stopped" : open.status === "cancelled" ? "cancellation requested" : open.status === "paused" ? "paused" : open.nextDate ? `next on ${ddmmyyyy(open.nextDate)}` : "active"}</Text>
            </View>
            {!preview ? (
              <>
                {open.status === "failed" ? (
                  <View style={{ gap: 10 }}>
                    <Text>We could not collect this monthly donation from your card, so it has stopped and nothing more will be charged. To carry on giving monthly, start a new monthly donation on the charity&apos;s page.</Text>
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
                    <Button
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
                    : "Your change takes effect at once. Past donations stay in your history."}
                </Text>
              </>
            ) : (
            <>
            <Button
              label={open.status === "paused" ? "Resume" : "Pause"}
              onPress={() => {
                setRecurring((rs) => rs.map((r) => (r.id === open.id ? { ...r, status: r.status === "paused" ? "active" : "paused" } : r)));
                setOpen(null);
              }}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setRecurring((rs) => rs.filter((r) => r.id !== open.id));
                setOpen(null);
              }}
              style={styles.cancel}
            >
              <Text style={[type.button, { color: colors.danger }]}>Cancel monthly donation</Text>
            </Pressable>
            <Text variant="label">Cancelling stops all future payments with the payment provider. Past donations stay in your history.</Text>
            </>
            )}
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={logging !== null} onClose={() => setLogging(null)}>
        {logging === "income" ? <IncomeForm onSave={addIncome} onCancel={() => setLogging(null)} /> : null}
        {logging === "elsewhere" ? <ElsewhereForm onSave={saveElsewhere} onCancel={() => setLogging(null)} /> : null}
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
  arc: { position: "absolute", right: space.gutter - 2, top: -10, zIndex: 2 },
  heading: { fontSize: 22, lineHeight: 28 },
  // Lists are ruled like a ledger: lines above and below, no box.
  list: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 2, paddingVertical: 12, minHeight: touch + 8 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  share: { gap: 8, paddingVertical: 12, paddingHorizontal: 2 },
  shareTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.lilacSoft, overflow: "hidden" },
  shareFill: { height: "100%", borderRadius: radius.pill, backgroundColor: colors.blue },
  summary: { fontFamily: fonts.display, fontSize: 24, lineHeight: 32, color: colors.ink },
  summaryFigure: { fontFamily: fonts.display, fontSize: 24, lineHeight: 32, color: colors.blue },
  strip: { gap: 4, padding: 20, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
  stripKicker: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.blue },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  cancel: { minHeight: touch, alignItems: "center", justifyContent: "center" },
  tzedakaRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 2, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.hairline },
  card: { gap: 6, padding: 20, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
