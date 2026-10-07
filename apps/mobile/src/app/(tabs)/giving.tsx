import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
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
import { byCharity, groupByMonth, inGivingYear, monthlyToReach, percentOf, totalBetween } from "@/lib/giving";
import { givingYearRange, hebrewYearFor, monthsLeftInGivingYear } from "@/lib/hebrew-year";
import { useScreenState } from "@/lib/screen-state";
import { colors, radius, space, touch, type } from "@/theme/tokens";

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Screen 7: Giving, with maaser. */
export default function Giving() {
  const insets = useSafeAreaInsets();
  const state = useScreenState();
  const p = useLocalSearchParams<{ demo?: string; sheet?: string }>();
  const newDonor = state === "empty";
  const [target, setTarget] = useState<Target | null>(newDonor || p.demo === "first" ? null : sampleMaaserTarget);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [recurring, setRecurring] = useState<Recurring[]>(newDonor ? [] : sampleRecurring);
  const [open, setOpen] = useState<Recurring | null>(sampleRecurring.find((r) => r.id === p.sheet) ?? null);

  const now = new Date();
  const hYear = hebrewYearFor(now);
  const { start: yearStart, end: yearEndDate } = givingYearRange(hYear);
  const yearEnd = ddmmyyyy(yearEndDate);
  const yearLabel = `Rosh Hashana ${hYear}: ${ddmmyyyy(yearStart)} to ${yearEnd}`;
  const myGifts = newDonor ? [] : gifts;
  const yearGifts = inGivingYear(myGifts, hYear);
  const elsewhere = newDonor ? 0 : inGivingYear(givenElsewhere, hYear).reduce((t, r) => t + r.cents, 0);
  const giftsTotal = yearGifts.reduce((t, g) => t + g.cents, 0);
  const given = giftsTotal + elsewhere;
  const monthGifts = yearGifts.filter((g) => g.date.getMonth() === now.getMonth() && g.date.getFullYear() === now.getFullYear());
  const monthTotal = monthGifts.reduce((t, g) => t + g.cents, 0);
  const charities = byCharity(yearGifts);
  const with18a = yearGifts.filter((g) => g.with18a).reduce((t, g) => t + g.cents, 0);
  const monthsLeft = monthsLeftInGivingYear(now, hYear);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const elsewhereMonth = newDonor ? 0 : totalBetween(givenElsewhere, monthStart, monthEndDate);
  const byMonth = target?.period === "month";
  const periodGiven = byMonth ? monthTotal + elsewhereMonth : given;
  const periodElsewhere = byMonth ? elsewhereMonth : elsewhere;
  const periodEnd = byMonth ? ddmmyyyy(monthEndDate) : yearEnd;
  const periodLabel = byMonth ? `${monthNames[now.getMonth()]} ${now.getFullYear()}` : yearLabel;
  const remaining = target === null ? 0 : Math.max(0, target.cents - periodGiven);
  const [openGift, setOpenGift] = useState<Gift | null>(null);

  return (
    <View style={styles.screen}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: space.gutter, gap: space.block }}>
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
          <ErrorState body="We couldn't load your giving. Check your connection and try again." onRetry={() => router.replace("/giving")} />
        ) : (
          <>
            {target === null || editing ? (
              <TargetEditor
                initial={target}
                yearEnd={yearEnd}
                monthsLeft={monthsLeft}
                onSave={(t) => {
                  setTarget(t);
                  setEditing(false);
                  setSaved(true);
                }}
                onCancel={target ? () => setEditing(false) : undefined}
              />
            ) : (
              <View style={{ gap: 10 }}>
                <MaaserProgress givenCents={periodGiven} targetCents={target.cents} period={target.period} periodLabel={periodLabel} endLabel={periodEnd} />
                {saved ? (
                  <Text variant="label" style={{ paddingHorizontal: 4, color: colors.success }} accessibilityLiveRegion="polite">
                    Target saved.
                  </Text>
                ) : null}
                <Text variant="label" style={{ paddingHorizontal: 4 }}>
                  Includes {rand(periodElsewhere)} you logged as given elsewhere this {target.period}. Only you see your target.
                </Text>
                <TextLink label="Change target" onPress={() => { setSaved(false); setEditing(true); }} />
              </View>
            )}

            {target !== null && !editing ? (
              <View style={styles.card}>
                <Text variant="label">Amount to give</Text>
                {remaining > 0 ? (
                  <>
                    <Text variant="amount" style={{ fontSize: 36, lineHeight: 42 }}>{rand(remaining)}</Text>
                    <Text variant="bodyMuted">
                      {byMonth
                        ? `still to give by ${periodEnd}, the end of this month.`
                        : `still to give by ${yearEnd}. About ${rand(monthlyToReach(remaining, monthsLeft))} a month over the ${monthsLeft} ${monthsLeft === 1 ? "month" : "months"} left.`}
                    </Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 17 }}>You&apos;ve reached your target for this {target.period}.</Text>
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
                  <Stat label="Gifts made" value={String(yearGifts.length)} />
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
              </View>
            ) : null}

            <View style={{ gap: 12 }}>
              <Text variant="h2" style={styles.heading}>Monthly gifts</Text>
              {recurring.length === 0 ? (
                <Text variant="bodyMuted">No monthly gifts yet. Choose Monthly when you give to set one up.</Text>
              ) : (
                <View style={styles.list}>
                  {recurring.map((r, i) => (
                    <Pressable key={r.id} onPress={() => setOpen(r)} accessibilityRole="button" accessibilityLabel={`${r.charityName}, ${rand(r.cents)} a month, ${r.status}`} style={[styles.row, i > 0 && styles.divider]}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={{ fontSize: 17, fontFamily: "Assistant_600SemiBold" }}>{r.charityName}</Text>
                        <Text variant="bodyMuted" style={{ fontSize: 16 }}>
                          {r.status === "paused" ? "Paused" : `Next on ${ddmmyyyy(r.nextDate)}`}
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
                <EmptyState title="No gifts yet" body="Gifts you make in the app appear here, and count towards your maaser." action={{ label: "Find a charity", onPress: () => router.push("/discover") }} />
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
                              {ddmmyyyy(gift.date)}{gift.monthly ? " · Monthly" : ""}{gift.with18a ? "" : " · No 18A"}
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
            {myGifts.length ? <Text variant="label" style={{ textAlign: "center" }}>Sample giving history for design review</Text> : null}
          </>
        )}
      </ScrollView>

      <Sheet visible={open !== null} onClose={() => setOpen(null)}>
        {open ? (
          <View style={{ gap: 18 }}>
            <View style={{ gap: 4 }}>
              <Text variant="label">Monthly gift</Text>
              <Text variant="h2">{open.charityName}</Text>
              <Text variant="bodyMuted">{rand(open.cents)} a month · {open.status === "paused" ? "Paused" : `next on ${ddmmyyyy(open.nextDate)}`}</Text>
            </View>
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
              <Text style={[type.button, { color: colors.danger }]}>Cancel monthly gift</Text>
            </Pressable>
            <Text variant="label">Cancelling stops all future payments with the payment provider. Past gifts stay in your history.</Text>
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={openGift !== null} onClose={() => setOpenGift(null)}>
        {openGift ? (
          <View style={{ gap: 18 }}>
            <View style={{ gap: 4 }}>
              <Text variant="label">Gift</Text>
              <Text variant="h2">{openGift.charityName}</Text>
              <Text variant="amount" style={{ fontSize: 36, lineHeight: 42 }}>{rand(openGift.cents)}</Text>
            </View>
            <View style={styles.list}>
              <DetailRow label="Date" value={ddmmyyyy(openGift.date)} />
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
      <Text style={{ fontSize: 24, lineHeight: 30, fontFamily: "FrankRuhlLibre_500Medium" }}>{value}</Text>
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
  card: { gap: 6, padding: 20, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  statRow: { flexDirection: "row", gap: 12 },
  stat: { flex: 1, gap: 4, padding: 16, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
});
