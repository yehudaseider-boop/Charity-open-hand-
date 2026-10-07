import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { DottedArc } from "@/components/dotted-arc";
import { FadeUp } from "@/components/fade-up";
import { Field } from "@/components/field";
import { CalendarIcon, ChevronIcon } from "@/components/icons";
import { MaaserProgress } from "@/components/maaser-progress";
import { Segmented } from "@/components/segmented";
import { Sheet } from "@/components/sheet";
import { EmptyState, ErrorState, SkeletonBlock } from "@/components/states";
import { Text } from "@/components/text";
import { gifts, givenElsewhere, recurring as sampleRecurring, sampleMaaserTargetCents, type Gift, type Recurring } from "@/data/giving";
import { ddmmyyyy, rand } from "@/lib/format";
import { byCharity, groupByMonth, inGivingYear, maaserTargetCents, monthlyToReach, percentOf } from "@/lib/giving";
import { givingYearRange, hebrewYearFor, monthsLeftInGivingYear } from "@/lib/hebrew-year";
import { useScreenState } from "@/lib/screen-state";
import { parseRandToCents, percentToPpm } from "@shared/money";
import { colors, radius, space, touch, type } from "@/theme/tokens";

/** Screen 7: Giving, with maaser. */
export default function Giving() {
  const insets = useSafeAreaInsets();
  const state = useScreenState();
  const p = useLocalSearchParams<{ demo?: string; sheet?: string }>();
  const newDonor = state === "empty";
  const [targetCents, setTargetCents] = useState<number | null>(newDonor || p.demo === "first" ? null : sampleMaaserTargetCents);
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
  const remaining = targetCents === null ? 0 : Math.max(0, targetCents - given);
  const [openGift, setOpenGift] = useState<Gift | null>(null);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: space.gutter, gap: space.block }}>
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
            {targetCents === null ? (
              <TargetSetup onSave={setTargetCents} />
            ) : (
              <View style={{ gap: 10 }}>
                <MaaserProgress givenCents={given} targetCents={targetCents} yearEndLabel={yearEnd} yearLabel={yearLabel} />
                <Text variant="label" style={{ paddingHorizontal: 4 }}>
                  Includes {rand(elsewhere)} you logged as given elsewhere this year. Only you see your target.
                </Text>
              </View>
            )}

            {targetCents !== null ? (
              <View style={styles.card}>
                <Text variant="label">Amount to give</Text>
                {remaining > 0 ? (
                  <>
                    <Text variant="amount" style={{ fontSize: 36, lineHeight: 42 }}>{rand(remaining)}</Text>
                    <Text variant="bodyMuted">
                      still to give by {yearEnd}. About {rand(monthlyToReach(remaining, monthsLeft))} a month over the {monthsLeft} {monthsLeft === 1 ? "month" : "months"} left.
                    </Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 17 }}>You&apos;ve reached your target for this year.</Text>
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

            <WorkOut
              yearEnd={yearEnd}
              monthsLeft={monthsLeft}
              onUse={(cents) => setTargetCents(cents)}
            />

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
              <Text style={[type.button, { color: colors.accent }]}>Cancel monthly gift</Text>
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

/** Work out an amount to give from income and a percentage, and optionally keep it as the target. */
function WorkOut({ yearEnd, monthsLeft, onUse }: { yearEnd: string; monthsLeft: number; onUse: (cents: number) => void }) {
  const [income, setIncome] = useState("");
  const [percent, setPercent] = useState<"10" | "20">("10");
  const incomeCents = parseRandToCents(income);
  const amount = incomeCents ? maaserTargetCents(incomeCents, percentToPpm(percent)) : null;

  return (
    <View style={styles.setup}>
      <View style={{ gap: 6 }}>
        <Text variant="h2" style={styles.heading}>Work out what to give</Text>
        <Text variant="bodyMuted">Enter your income for the year, from Rosh Hashana to {yearEnd}. An estimate is fine.</Text>
      </View>
      <Field label="Income for this year" prefix="R" keyboardType="decimal-pad" value={income} onChangeText={setIncome} />
      <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Percentage">
        {(["10", "20"] as const).map((v) => {
          const selected = percent === v;
          return (
            <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setPercent(v)} style={[styles.pct, selected && styles.pctOn]}>
              <Text style={[type.button, { color: selected ? colors.accent : colors.ink }]}>{v}%</Text>
              <Text variant="label">{v === "10" ? "Maaser" : "Chomesh"}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ gap: 4 }}>
        <Text style={{ fontSize: 17 }}>Amount to give: {amount ? rand(amount) : "R0"}</Text>
        {amount ? <Text variant="bodyMuted">About {rand(monthlyToReach(amount, monthsLeft))} a month over the {monthsLeft} {monthsLeft === 1 ? "month" : "months"} left.</Text> : null}
      </View>
      <Button label="Use as my target" disabled={!amount} onPress={() => amount && onUse(amount)} style={!amount ? { opacity: 0.4 } : undefined} />
    </View>
  );
}

/** First run: the donor sets their own target for the year. */
function TargetSetup({ onSave }: { onSave: (cents: number) => void }) {
  const [mode, setMode] = useState<"percent" | "amount">("percent");
  const [income, setIncome] = useState("");
  const [percent, setPercent] = useState<"10" | "20">("10");
  const [amount, setAmount] = useState("");

  const incomeCents = parseRandToCents(income);
  const target =
    mode === "percent" ? (incomeCents ? maaserTargetCents(incomeCents, percentToPpm(percent)) : null) : parseRandToCents(amount);

  return (
    <View style={styles.setup}>
      <View style={{ gap: 6 }}>
        <Text variant="h2">Set your maaser target</Text>
        <Text variant="bodyMuted">Choose what you want to give this year, from Rosh Hashana to Rosh Hashana. We&apos;ll track your gifts against it. Only you see this.</Text>
      </View>
      <Segmented
        label="Target type"
        value={mode}
        onChange={setMode}
        options={[
          { value: "percent", label: "% of income" },
          { value: "amount", label: "Fixed amount" },
        ]}
      />
      {mode === "percent" ? (
        <>
          <Field label="Income for this year" prefix="R" keyboardType="decimal-pad" value={income} onChangeText={setIncome} helper="An estimate is fine. You can change it later." />
          <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Percentage">
            {(["10", "20"] as const).map((v) => {
              const selected = percent === v;
              return (
                <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setPercent(v)} style={[styles.pct, selected && styles.pctOn]}>
                  <Text style={[type.button, { color: selected ? colors.accent : colors.ink }]}>{v}%</Text>
                  <Text variant="label">{v === "10" ? "Maaser" : "Chomesh"}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <Field label="Target for this year" prefix="R" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      )}
      <View style={styles.result}>
        <CalendarIcon color={colors.muted} />
        <Text style={{ flex: 1, fontSize: 17 }}>Your target: {target ? rand(target) : "R0"}</Text>
      </View>
      <Button label="Save target" disabled={!target} onPress={() => target && onSave(target)} style={!target ? { opacity: 0.4 } : undefined} />
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
  setup: { gap: 18, padding: 20, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  pct: { flex: 1, minHeight: 64, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: colors.parchment },
  pctOn: { borderColor: colors.accent, borderWidth: 1.5 },
  result: { flexDirection: "row", alignItems: "center", gap: 10 },
});
