import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, TextLink } from "@/components/button";
import { DayGreeting } from "@/components/day-greeting";
import { DottedArc } from "@/components/dotted-arc";
import { FadeUp } from "@/components/fade-up";
import { ChevronIcon } from "@/components/icons";
import { MaaserProgress } from "@/components/maaser-progress";
import { Sheet } from "@/components/sheet";
import { EmptyState, ErrorState, OfflineNote, SkeletonBlock } from "@/components/states";
import { ElsewhereForm, IncomeForm } from "@/components/log-sheets";
import { InfoButton } from "@/components/info-button";
import { TargetEditor, type Target } from "@/components/target-editor";
import { Text } from "@/components/text";
import { gifts, givenElsewhere as sampleElsewhere, recurring as sampleRecurring, sampleMaaserTarget, type Gift, type Recurring } from "@/data/giving";
import { ddmmyyyy, rand } from "@/lib/format";
import { byCharity, givingKindLabels, groupByMonth, inGivingYear, monthlyToReach, percentOf, sumOfKind } from "@/lib/giving";
import { givingYearRange, hebrewYearFor, monthsLeftInGivingYear } from "@/lib/hebrew-year";
import { useAccount } from "@/lib/account";
import { loadIncome, saveIncome } from "@/lib/income-store";
import { dateToIso, incomeBetween, isoToDate, owedFromIncome, type Elsewhere, type IncomeEntry } from "@/lib/ledger";
import { useScreenState } from "@/lib/screen-state";
import { useDirectory } from "@/lib/directory";
import { savedCharities } from "@/lib/live-charities";
import { useSaved } from "@/lib/saved";
import { SavedRow } from "@/components/saved-row";
import { confirmThen, notify } from "@/lib/open-site";
import { loadTarget, saveTarget } from "@/lib/targets";
import { colors, radius, space, touch, type } from "@/theme/tokens";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Screen 7: Giving, with maaser. */
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
  const [target, setTarget] = useState<Target | null>(!preview || newDonor || p.demo === "first" ? null : sampleMaaserTarget);
  // Targets are personal and stay on this phone (in its secure storage), never on our servers.
  const [targetLoaded, setTargetLoaded] = useState(preview);
  useEffect(() => {
    if (preview) return;
    let live = true;
    loadTarget().then((t) => {
      if (!live) return;
      if (t) setTarget(t);
      setTargetLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [preview]);
  // Income (for maaser) stays on this phone only. Nothing is logged until the saved log has loaded.
  const [income, setIncome] = useState<IncomeEntry[]>([]);
  const [incomeLoaded, setIncomeLoaded] = useState(preview);
  useEffect(() => {
    if (preview) return;
    let live = true;
    loadIncome().then((rows) => {
      if (!live) return;
      setIncome(rows);
      setIncomeLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [preview]);
  const [busy, setBusy] = useState(false);
  const [previewElsewhere, setPreviewElsewhere] = useState<Elsewhere[]>(newDonor ? [] : sampleElsewhere);
  const [logging, setLogging] = useState<"income" | "elsewhere" | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [recurringError, setRecurringError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sampleRecurringState, setRecurring] = useState<Recurring[]>(newDonor ? [] : sampleRecurring);
  const recurring = preview ? sampleRecurringState : (account.live?.recurring ?? []);
  const [open, setOpen] = useState<Recurring | null>(preview ? (sampleRecurring.find((r) => r.id === p.sheet) ?? null) : null);

  const directory = useDirectory();
  const savedList = savedCharities(useSaved().slugs, directory.data?.charities ?? []);
  const now = new Date();
  const hYear = hebrewYearFor(now);
  const { start: yearStart, end: yearEndDate } = givingYearRange(hYear);
  const yearEnd = ddmmyyyy(yearEndDate);
  const yearLabel = `Rosh Hashana ${hYear}: ${ddmmyyyy(yearStart)} to ${yearEnd}`;
  const myGifts = preview ? (newDonor ? [] : gifts) : (account.live?.gifts ?? []);
  const elsewhere: Elsewhere[] = preview ? previewElsewhere : (account.live?.elsewhere ?? []);
  const yearGifts = inGivingYear(myGifts, hYear);
  const giftsTotal = yearGifts.reduce((t, g) => t + g.cents, 0);
  // The whole calendar month, even the days before Rosh Hashana, as for income and giving elsewhere.
  const monthGifts = myGifts.filter((g) => g.date.getMonth() === now.getMonth() && g.date.getFullYear() === now.getFullYear());
  const monthTotal = monthGifts.reduce((t, g) => t + g.cents, 0);
  const charities = byCharity(yearGifts);
  const with18a = yearGifts.filter((g) => g.with18a).reduce((t, g) => t + g.cents, 0);
  const monthsLeft = monthsLeftInGivingYear(now, hYear);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const stop = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const inMonth = <T extends { date: Date }>(rows: T[]) => rows.filter((r) => r.date >= monthStart && r.date < stop);
  const byMonth = target?.period === "month";
  // Gifts and "given elsewhere" entries in the target's period, each marked maaser, chomesh or general tzedaka.
  const periodRows = [
    ...(byMonth ? monthGifts : yearGifts),
    ...(byMonth ? inMonth(elsewhere) : inGivingYear(elsewhere, hYear)),
  ];
  const maaserGiven = sumOfKind(periodRows, "maaser");
  const chomeshGiven = sumOfKind(periodRows, "chomesh");
  const tzedakaGiven = sumOfKind(periodRows, "tzedaka");
  const periodEnd = byMonth ? ddmmyyyy(monthEndDate) : yearEnd;
  const periodLabel = byMonth ? `${monthNames[now.getMonth()]} ${now.getFullYear()}` : yearLabel;
  const maaserLeft = target === null ? 0 : Math.max(0, target.maaserCents - maaserGiven);
  const chomeshLeft = target?.chomeshCents ? Math.max(0, target.chomeshCents - chomeshGiven) : 0;
  const remaining = maaserLeft + chomeshLeft;
  const [openGift, setOpenGift] = useState<Gift | null>(null);

  // Income logged in the target's period: a tenth is maaser, and a further tenth chomesh if kept.
  const periodFrom = byMonth ? dateToIso(monthStart) : dateToIso(yearStart);
  const periodTo = byMonth ? dateToIso(monthEndDate) : dateToIso(yearEndDate);
  const periodIncome = incomeBetween(income, periodFrom, periodTo);
  const owed = owedFromIncome(periodIncome, Boolean(target?.chomeshCents));
  const addIncome = (e: { cents: number; date: string; note: string }) => {
    if (!incomeLoaded) return;
    const next = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, ...e }, ...income].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    setIncome(next);
    saveIncome(next);
    setLogging(null);
  };
  const removeIncome = (id: string) => {
    const next = income.filter((e) => e.id !== id);
    setIncome(next);
    saveIncome(next);
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
  const saveElsewhere = async (e: { cents: number; date: string; recipient: string; kind: "maaser" | "chomesh" | "tzedaka" }): Promise<string | null> => {
    if (preview) {
      setPreviewElsewhere((rows) => [{ id: `p${Date.now()}`, date: isoToDate(e.date), recipient: e.recipient, cents: e.cents, kind: e.kind }, ...rows]);
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
        <View>
          <Text variant="h1" accessibilityRole="header">Giving</Text>
          <DayGreeting />
          <View style={styles.arc}><DottedArc size={160} opacity={0.45} /></View>
        </View>

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
            {!preview && !signedIn ? (
              <View style={styles.card}>
                <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>See your giving here</Text>
                <Text variant="bodyMuted">Sign in with the email you give with. Every donation shows up here, and counts towards your maaser and chomesh.</Text>
                <Button label="Sign in" onPress={() => router.push("/account")} />
              </View>
            ) : null}
            {!targetLoaded ? (
              <SkeletonBlock height={190} />
            ) : target === null || editing ? (
              <TargetEditor
                initial={target}
                yearEnd={yearEnd}
                monthsLeft={monthsLeft}
                onSave={(t) => {
                  setTarget(t);
                  if (!preview) saveTarget(t);
                  setEditing(false);
                  setSaved(true);
                }}
                onCancel={target ? () => setEditing(false) : undefined}
              />
            ) : (
              <View style={{ gap: 10 }}>
                <MaaserProgress title="Maaser" givenCents={maaserGiven} targetCents={target.maaserCents} period={target.period} periodLabel={periodLabel} endLabel={periodEnd} />
                {target.chomeshCents ? (
                  <MaaserProgress title="Chomesh" givenCents={chomeshGiven} targetCents={target.chomeshCents} period={target.period} periodLabel={periodLabel} endLabel={periodEnd} />
                ) : null}
                <View style={styles.tzedakaRow}>
                  <Text style={{ flexShrink: 1, fontSize: 16 }}>General tzedaka this {target.period}</Text>
                  <View style={{ flex: 1 }}><InfoButton terms={["generalTzedaka"]} /></View>
                  <Text style={{ fontSize: 16, fontFamily: "Archivo_600SemiBold" }}>{rand(tzedakaGiven)}</Text>
                </View>
                {saved ? (
                  <Text variant="label" style={{ paddingHorizontal: 4, color: colors.success }} accessibilityLiveRegion="polite">
                    Targets saved.
                  </Text>
                ) : null}
                <Text variant="label" style={{ paddingHorizontal: 4 }}>
                  General tzedaka doesn&apos;t count towards maaser or chomesh. Includes donations you logged as given elsewhere. Only you see your targets.
                </Text>
                <TextLink label="Change targets" onPress={() => { setSaved(false); setEditing(true); }} />
              </View>
            )}

            {target !== null && !editing ? (
              <View style={styles.card}>
                <Text variant="label">Amount to give</Text>
                {remaining > 0 ? (
                  <>
                    <Text variant="amount" style={{ fontSize: 36, lineHeight: 42 }}>{rand(remaining)}</Text>
                    <Text variant="bodyMuted">
                      {target.chomeshCents ? `${rand(maaserLeft)} maaser and ${rand(chomeshLeft)} chomesh, ` : ""}
                      {byMonth
                        ? `still to give by ${periodEnd}, the end of this month.`
                        : `still to give by ${yearEnd}. About ${rand(monthlyToReach(remaining, monthsLeft))} a month over the ${monthsLeft} ${monthsLeft === 1 ? "month" : "months"} left.`}
                    </Text>
                  </>
                ) : (
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 20, lineHeight: 26, fontFamily: "Archivo_700Bold", color: colors.success }}>
                      You&apos;ve given your {target.chomeshCents ? "maaser and chomesh" : "maaser"} for this {target.period}.
                    </Text>
                    <Text variant="bodyMuted">Tizku l&apos;mitzvos.</Text>
                  </View>
                )}
              </View>
            ) : null}

            {/* Your records: income (kept on this phone) and giving made elsewhere. */}
            {preview || signedIn ? (
              <View style={{ gap: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Text variant="h2" style={styles.heading}>Your records</Text>
                  <InfoButton terms={["maaser", "chomesh", "generalTzedaka", "givingYear"]} label="maaser, chomesh and the giving year" />
                </View>
                {income.length > 0 && target !== null ? (
                  <View style={styles.card}>
                    <Text variant="label">Owed from your income, {byMonth ? "this month" : "this giving year"}</Text>
                    <Text variant="bodyMuted">You logged {rand(periodIncome)}. A tenth is maaser{target.chomeshCents ? ", and a further tenth is chomesh" : ""}.</Text>
                    <View style={styles.list}>
                      <View style={styles.row}>
                        <Text style={{ flex: 1, fontSize: 17 }}>Maaser owed</Text>
                        <Text style={{ fontSize: 17 }}>{rand(owed.maaserCents)}</Text>
                      </View>
                      <View style={[styles.row, styles.divider]}>
                        <Text style={{ flex: 1, fontSize: 17 }}>Maaser given</Text>
                        <Text style={{ fontSize: 17 }}>{rand(maaserGiven)}</Text>
                      </View>
                      <View style={[styles.row, styles.divider]}>
                        <Text style={{ flex: 1, fontSize: 17, fontFamily: "Archivo_600SemiBold" }}>Maaser still to give</Text>
                        <Text style={{ fontSize: 17, fontFamily: "Archivo_600SemiBold" }}>{rand(Math.max(0, owed.maaserCents - maaserGiven))}</Text>
                      </View>
                      {target.chomeshCents ? (
                        <>
                          <View style={[styles.row, styles.divider]}>
                            <Text style={{ flex: 1, fontSize: 17 }}>Chomesh owed</Text>
                            <Text style={{ fontSize: 17 }}>{rand(owed.chomeshCents)}</Text>
                          </View>
                          <View style={[styles.row, styles.divider]}>
                            <Text style={{ flex: 1, fontSize: 17 }}>Chomesh given</Text>
                            <Text style={{ fontSize: 17 }}>{rand(chomeshGiven)}</Text>
                          </View>
                          <View style={[styles.row, styles.divider]}>
                            <Text style={{ flex: 1, fontSize: 17, fontFamily: "Archivo_600SemiBold" }}>Chomesh still to give</Text>
                            <Text style={{ fontSize: 17, fontFamily: "Archivo_600SemiBold" }}>{rand(Math.max(0, owed.chomeshCents - chomeshGiven))}</Text>
                          </View>
                        </>
                      ) : null}
                    </View>
                  </View>
                ) : income.length > 0 ? (
                  <Text variant="bodyMuted">Set a maaser target above to see what your income means for maaser.</Text>
                ) : null}

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <View style={{ flex: 1 }}><Button label="Log income" disabled={!incomeLoaded} onPress={() => setLogging("income")} /></View>
                  <View style={{ flex: 1 }}><Button label="Log giving elsewhere" onPress={() => setLogging("elsewhere")} /></View>
                </View>

                {income.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <Text variant="label">Income log (on this phone only)</Text>
                    <View style={styles.list}>
                      {income.slice(0, 12).map((e, i) => (
                        <Pressable key={e.id} onLongPress={() => confirmRemove("income entry", () => removeIncome(e.id))} accessibilityRole="button" accessibilityHint="Press and hold to remove" accessibilityActions={[{ name: "delete", label: "Remove" }]} onAccessibilityAction={(ev) => ev.nativeEvent.actionName === "delete" && confirmRemove("income entry", () => removeIncome(e.id))} accessibilityLabel={`${rand(e.cents)}, ${ddmmyyyy(isoToDate(e.date))}${e.note ? `, ${e.note}` : ""}`} style={[styles.row, i > 0 && styles.divider]}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 17 }}>{e.note || "Income"}</Text>
                            <Text variant="bodyMuted" style={{ fontSize: 16 }}>{ddmmyyyy(isoToDate(e.date))}</Text>
                          </View>
                          <Text style={{ fontSize: 17 }}>{rand(e.cents)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text variant="label">Press and hold an entry to remove it.</Text>
                  </View>
                ) : null}

                {elsewhere.length > 0 ? (
                  <View style={{ gap: 6 }}>
                    <Text variant="label">Given elsewhere</Text>
                    <View style={styles.list}>
                      {elsewhere.slice(0, 12).map((e, i) => (
                        <Pressable
                          key={e.id}
                          onLongPress={() => confirmRemove("entry", () => removeElsewhereEntry(e.id))}
                          accessibilityActions={[{ name: "delete", label: "Remove" }]}
                          onAccessibilityAction={(ev) => ev.nativeEvent.actionName === "delete" && confirmRemove("entry", () => removeElsewhereEntry(e.id))}
                          accessibilityRole="button"
                          accessibilityHint="Press and hold to remove"
                          accessibilityLabel={`${e.recipient}, ${rand(e.cents)}, ${ddmmyyyy(e.date)}, ${givingKindLabels[e.kind]}`}
                          style={[styles.row, i > 0 && styles.divider]}
                        >
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 17 }}>{e.recipient}</Text>
                            <Text variant="bodyMuted" style={{ fontSize: 16 }}>{ddmmyyyy(e.date)} · {givingKindLabels[e.kind]}</Text>
                          </View>
                          <Text style={{ fontSize: 17 }}>{rand(e.cents)}</Text>
                        </Pressable>
                      ))}
                    </View>
                    <Text variant="label">These count towards your maaser and chomesh. Press and hold an entry to remove it.</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {myGifts.length > 0 ? (
              <View style={{ gap: 12 }}>
                <Text variant="h2" style={styles.heading}>This year in numbers</Text>
                <View style={styles.statRow}>
                  <Stat label="Given this year" value={rand(giftsTotal)} />
                  <Stat label="This month" value={rand(monthTotal)} />
                </View>
                <View style={styles.statRow}>
                  <Stat label="Donations made" value={String(yearGifts.length)} />
                  <Stat label="Charities" value={String(charities.length)} />
                </View>
                {charities.length > 0 ? (
                  <View style={styles.list}>
                    {charities.map((c, i) => (
                      <View key={c.name} style={[styles.row, i > 0 && styles.divider]}>
                        <Text style={{ flex: 1, fontSize: 17 }}>{c.name}</Text>
                        <Text variant="bodyMuted" style={{ fontSize: 16 }}>{percentOf(c.cents, giftsTotal)}%</Text>
                        <Text style={{ fontSize: 17 }}>{rand(c.cents)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View style={styles.list}>
                  <View style={styles.row}>
                    <Text style={{ flex: 1, fontSize: 17 }}>With an 18A receipt</Text>
                    <Text style={{ fontSize: 17 }}>{rand(with18a)}</Text>
                  </View>
                  <View style={[styles.row, styles.divider]}>
                    <Text style={{ flex: 1, fontSize: 17 }}>Without an 18A receipt</Text>
                    <Text style={{ fontSize: 17 }}>{rand(giftsTotal - with18a)}</Text>
                  </View>
                </View>
                <View style={styles.list}>
                  {(["maaser", "chomesh", "tzedaka"] as const).map((k, i) => (
                    <View key={k} style={[styles.row, i > 0 && styles.divider]}>
                      <Text style={{ flex: 1, fontSize: 17 }}>{givingKindLabels[k]}</Text>
                      <Text style={{ fontSize: 17 }}>{rand(sumOfKind(yearGifts, k))}</Text>
                    </View>
                  ))}
                </View>
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
                <Text variant="bodyMuted">No monthly donations yet. Monthly giving is coming soon.</Text>
              ) : (
                <View style={styles.list}>
                  {recurring.map((r, i) => (
                    <Pressable key={r.id} onPress={() => setOpen(r)} accessibilityRole="button" accessibilityLabel={`${r.charityName}, ${rand(r.cents)} a month, ${r.status}`} style={[styles.row, i > 0 && styles.divider]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 17, fontFamily: "Archivo_600SemiBold" }}>{r.charityName}</Text>
                        <Text variant="bodyMuted" style={{ fontSize: 16 }}>
                          {r.status === "cancelled" ? "Cancellation requested" : r.status === "paused" ? (r.syncing ? "Pause requested" : "Paused") : r.nextDate ? `Next on ${ddmmyyyy(r.nextDate)}` : "Active"}
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
                <EmptyState title="No donations yet" body="Donations you make on our website appear here once the payment goes through, and count towards your maaser." action={{ label: "Find a charity", onPress: () => router.push("/discover") }} />
              ) : (
                groupByMonth(myGifts).map((g, gi) => (
                  <FadeUp key={g.label} index={gi} style={{ gap: 6 }}>
                    <Text variant="label">{g.label}</Text>
                    <View style={styles.list}>
                      {g.rows.map((gift, i) => (
                        <Pressable key={gift.id} onPress={() => setOpenGift(gift)} accessibilityRole="button" accessibilityLabel={`${gift.charityName}, ${rand(gift.cents)}, ${ddmmyyyy(gift.date)}`} style={[styles.row, i > 0 && styles.divider]}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 17 }}>{gift.charityName}</Text>
                            <Text variant="bodyMuted" style={{ fontSize: 16 }}>
                              {ddmmyyyy(gift.date)} · {givingKindLabels[gift.kind]}{gift.monthly ? " · Monthly" : ""}{gift.with18a ? "" : " · No 18A"}
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
              <Text variant="bodyMuted">{rand(open.cents)} a month · {open.status === "cancelled" ? "cancellation requested" : open.status === "paused" ? "paused" : open.nextDate ? `next on ${ddmmyyyy(open.nextDate)}` : "active"}</Text>
            </View>
            {!preview ? (
              <>
                {open.status === "cancelled" ? (
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
                {recurringError ? <Text style={{ color: colors.danger }}>{recurringError}</Text> : null}
                <Text variant="label">
                  {open.syncing
                    ? "Your change is saved and waiting for the payment provider to apply it."
                    : "Your change is saved here and then passed to the payment provider, which takes the monthly payments. Past donations stay in your history."}
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
              <DetailRow label="Counted as" value={givingKindLabels[openGift.kind]} divider />
              <DetailRow label="Type" value={openGift.monthly ? "Monthly" : "Once-off"} divider />
              <DetailRow label="18A receipt" value={openGift.with18a ? "Yes" : "No"} divider />
            </View>
            <Button label="Close" onPress={() => setOpenGift(null)} />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat} accessibilityLabel={`${label}: ${value}`}>
      <Text variant="label">{label}</Text>
      <Text style={{ fontSize: 24, lineHeight: 30, fontFamily: "Archivo_800ExtraBold" }}>{value}</Text>
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

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment },
  arc: { position: "absolute", right: -30, top: -6 },
  heading: { fontSize: 22, lineHeight: 28 },
  list: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, minHeight: touch + 8 },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  cancel: { minHeight: touch, alignItems: "center", justifyContent: "center" },
  tzedakaRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  card: { gap: 6, padding: 20, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  statRow: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, gap: 4, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
});
