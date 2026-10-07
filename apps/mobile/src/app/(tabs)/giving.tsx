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
import { gifts, givenElsewhere, recurring as sampleRecurring, sampleMaaserTargetCents, type Recurring } from "@/data/giving";
import { ddmmyyyy, rand } from "@/lib/format";
import { groupByMonth, maaserTargetCents, totalInTaxYear } from "@/lib/giving";
import { useScreenState } from "@/lib/screen-state";
import { taxYearFor, taxYearRangeLabel } from "@/lib/tax-year";
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

  const year = taxYearFor(new Date());
  const yearEnd = taxYearRangeLabel(year).split(" to ")[1];
  const myGifts = newDonor ? [] : gifts;
  const given = totalInTaxYear(myGifts, year) + (newDonor ? 0 : totalInTaxYear(givenElsewhere, year));
  const elsewhere = newDonor ? 0 : totalInTaxYear(givenElsewhere, year);

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
                <MaaserProgress givenCents={given} targetCents={targetCents} yearEndLabel={yearEnd} />
                <Text variant="label" style={{ paddingHorizontal: 4 }}>
                  Includes {rand(elsewhere)} you logged as given elsewhere. Only you see your target.
                </Text>
              </View>
            )}

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
                        <View key={gift.id} style={[styles.row, i > 0 && styles.divider]}>
                          <View style={{ flex: 1, gap: 2 }}>
                            <Text style={{ fontSize: 17 }}>{gift.charityName}</Text>
                            <Text variant="bodyMuted" style={{ fontSize: 16 }}>
                              {ddmmyyyy(gift.date)}{gift.monthly ? " · Monthly" : ""}{gift.with18a ? "" : " · No 18A"}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 17 }}>{rand(gift.cents)}</Text>
                        </View>
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
    </View>
  );
}

/** First run: the donor sets their own target for the tax year. */
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
        <Text variant="bodyMuted">Choose what you want to give this tax year. We&apos;ll track your gifts against it. Only you see this.</Text>
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
          <Field label="Income for this tax year" prefix="R" keyboardType="decimal-pad" value={income} onChangeText={setIncome} helper="An estimate is fine. You can change it later." />
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
        <Field label="Target for this tax year" prefix="R" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
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
  setup: { gap: 18, padding: 20, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  pct: { flex: 1, minHeight: 64, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: colors.parchment },
  pctOn: { borderColor: colors.accent, borderWidth: 1.5 },
  result: { flexDirection: "row", alignItems: "center", gap: 10 },
});
