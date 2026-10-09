import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, TextLink } from "@/components/button";
import { DottedArc } from "@/components/dotted-arc";
import { FadeUp } from "@/components/fade-up";
import { ChevronIcon } from "@/components/icons";
import { MaaserProgress } from "@/components/maaser-progress";
import { Sheet } from "@/components/sheet";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { TargetEditor, type Target } from "@/components/target-editor";
import { Text } from "@/components/text";
import { gifts, givenElsewhere, recurring as sampleRecurring, sampleMaaserTarget, type Gift, type Recurring } from "@/data/giving";
import { ddmmyyyy, rand } from "@/lib/format";
import { byCharity, givingKindLabels, groupByMonth, inGivingYear, monthlyToReach, percentOf, sumOfKind } from "@/lib/giving";
import { givingYearRange, hebrewYearFor, monthsLeftInGivingYear } from "@/lib/hebrew-year";
import { useAccount } from "@/lib/account";
import { loadTarget, saveTarget } from "@/lib/targets";
import { useScreenState } from "@/lib/screen-state";
import { SITE_URL, siteUrl } from "@/lib/website";
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
  const state = preview ? demoState : signedIn && !account.live ? "loading" : account.loadError && !account.live ? "error" : "ready";
  const p = useLocalSearchParams<{ demo?: string; sheet?: string }>();
  const newDonor = preview ? demoState === "empty" : !signedIn;
  const [target, setTarget] = useState<Target | null>(!preview || newDonor || p.demo === "first" ? null : sampleMaaserTarget);
  // Targets are personal and stay on this phone (in its secure storage), never on our servers.
  useEffect(() => {
    if (preview) return;
    loadTarget().then((t) => t && setTarget(t));
  }, [preview]);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sampleRecurringState, setRecurring] = useState<Recurring[]>(newDonor ? [] : sampleRecurring);
  const recurring = preview ? sampleRecurringState : (account.live?.recurring ?? []);
  const [open, setOpen] = useState<Recurring | null>(preview ? (sampleRecurring.find((r) => r.id === p.sheet) ?? null) : null);

  const now = new Date();
  const hYear = hebrewYearFor(now);
  const { start: yearStart, end: yearEndDate } = givingYearRange(hYear);
  const yearEnd = ddmmyyyy(yearEndDate);
  const yearLabel = `Rosh Hashana ${hYear}: ${ddmmyyyy(yearStart)} to ${yearEnd}`;
  const myGifts = preview ? (newDonor ? [] : gifts) : (account.live?.gifts ?? []);
  const elsewhere = preview && !newDonor ? givenElsewhere : [];
  const yearGifts = inGivingYear(myGifts, hYear);
  const giftsTotal = yearGifts.reduce((t, g) => t + g.cents, 0);
  const monthGifts = yearGifts.filter((g) => g.date.getMonth() === now.getMonth() && g.date.getFullYear() === now.getFullYear());
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

  return (
    <View style={styles.screen}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={signedIn ? <RefreshControl refreshing={account.refreshing} onRefresh={account.refresh} /> : undefined}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: space.gutter, gap: space.block }}>
        <View>
          <Text variant="h1" accessibilityRole="header">Giving</Text>
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
            {!preview && !signedIn ? (
              <View style={styles.card}>
                <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>See your giving here</Text>
                <Text variant="bodyMuted">Sign in with the email you give with. Every donation shows up here, and counts towards your maaser and chomesh.</Text>
                <Button label="Sign in" onPress={() => router.push("/account")} />
              </View>
            ) : null}
            {target === null || editing ? (
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
                  <Text style={{ flex: 1, fontSize: 16 }}>General tzedaka this {target.period}</Text>
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
                  <Text style={{ fontSize: 17 }}>You&apos;ve reached your {target.chomeshCents ? "targets" : "target"} for this {target.period}.</Text>
                )}
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
              <Text variant="h2" style={styles.heading}>Monthly donations</Text>
              {recurring.length === 0 ? (
                <Text variant="bodyMuted">No monthly donations yet. Choose Monthly when you give to set one up.</Text>
              ) : (
                <View style={styles.list}>
                  {recurring.map((r, i) => (
                    <Pressable key={r.id} onPress={() => setOpen(r)} accessibilityRole="button" accessibilityLabel={`${r.charityName}, ${rand(r.cents)} a month, ${r.status}`} style={[styles.row, i > 0 && styles.divider]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 17, fontFamily: "Archivo_600SemiBold" }}>{r.charityName}</Text>
                        <Text variant="bodyMuted" style={{ fontSize: 16 }}>
                          {r.status === "paused" ? "Paused" : r.nextDate ? `Next on ${ddmmyyyy(r.nextDate)}` : "Active"}
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
            {preview && myGifts.length ? <Text variant="label" style={{ textAlign: "center" }}>Sample giving history for design review</Text> : null}
            {signedIn && account.live ? (
              <Text variant="label" style={{ textAlign: "center" }}>Updated {ddmmyyyy(account.live.loadedAt)}. Pull down to refresh.</Text>
            ) : null}
          </>
        )}
      </ScrollView>

      <Sheet visible={open !== null} onClose={() => setOpen(null)}>
        {open ? (
          <View style={{ gap: 18 }}>
            <View style={{ gap: 4 }}>
              <Text variant="label">Monthly donation</Text>
              <Text variant="h2">{open.charityName}</Text>
              <Text variant="bodyMuted">{rand(open.cents)} a month · {open.status === "paused" ? "Paused" : open.nextDate ? `next on ${ddmmyyyy(open.nextDate)}` : "active"}</Text>
            </View>
            {!preview ? (
              <>
                <Button
                  label="Manage on our website"
                  onPress={() => {
                    const url = siteUrl(SITE_URL, "/account");
                    if (url) Linking.openURL(url).catch(() => undefined);
                  }}
                />
                <Text variant="label">Pausing or cancelling a monthly donation is done on our website, with the payment provider.</Text>
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
