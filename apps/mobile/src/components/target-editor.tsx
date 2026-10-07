import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { rand } from "@/lib/format";
import { maaserTargetCents, monthlyToReach } from "@/lib/giving";
import { parseRandToCents, percentToPpm } from "@shared/money";
import { colors, radius, type } from "@/theme/tokens";
import { Button, TextLink } from "./button";
import { Field } from "./field";
import { Segmented } from "./segmented";
import { Text } from "./text";

export type TargetPeriod = "month" | "year";
export type Target = { cents: number; period: TargetPeriod };

type Pct = "10" | "20" | "other";

/** A typed percentage as ppm, or null if it is not a number above 0 and below 100. */
function pctToPpm(input: string): number | null {
  try {
    const ppm = percentToPpm(input.replace(",", "."));
    return ppm > 0 ? ppm : null;
  } catch {
    return null;
  }
}

/** Cents back to what a person would type: 40000 -> "400", 12345 -> "123.45". */
function centsToInput(cents: number): string {
  const r = Math.floor(cents / 100);
  const c = cents % 100;
  return c ? `${r}.${String(c).padStart(2, "0")}` : String(r);
}

/** Set or change the maaser target: from income and a percentage, or a fixed amount, per month or per year. */
export function TargetEditor({
  initial,
  yearEnd,
  monthsLeft,
  onSave,
  onCancel,
}: {
  initial: Target | null;
  yearEnd: string;
  monthsLeft: number;
  onSave: (t: Target) => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<"percent" | "amount">(initial ? "amount" : "percent");
  const [period, setPeriod] = useState<TargetPeriod>(initial?.period ?? "month");
  const [income, setIncome] = useState("");
  const [pct, setPct] = useState<Pct>("10");
  const [otherPct, setOtherPct] = useState("");
  const [amount, setAmount] = useState(initial ? centsToInput(initial.cents) : "");

  const ppm = pct === "other" ? pctToPpm(otherPct) : percentToPpm(pct);
  const incomeCents = parseRandToCents(income);
  const amountCents = parseRandToCents(amount);
  const target =
    mode === "percent"
      ? incomeCents && ppm
        ? maaserTargetCents(incomeCents, ppm)
        : null
      : amountCents && amountCents > 0
        ? amountCents
        : null;
  const ok = target !== null && target > 0;
  const per = period === "month" ? "a month" : "a year";

  return (
    <View style={styles.card}>
      <View style={{ gap: 6 }}>
        <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>{initial ? "Change your target" : "Set your maaser target"}</Text>
        <Text variant="bodyMuted">Work it out from your income, or type the amount you want to give. Only you see this.</Text>
      </View>

      <Segmented
        label="Target per"
        value={period}
        onChange={setPeriod}
        options={[
          { value: "month", label: "Month" },
          { value: "year", label: "Year" },
        ]}
      />

      <Segmented
        label="Work it out from"
        value={mode}
        onChange={setMode}
        options={[
          { value: "percent", label: "My income" },
          { value: "amount", label: "Fixed amount" },
        ]}
      />

      {mode === "percent" ? (
        <>
          <Field
            label={period === "month" ? "Income per month" : `Income for the year (to ${yearEnd})`}
            prefix="R"
            keyboardType="decimal-pad"
            value={income}
            onChangeText={setIncome}
            helper="An estimate is fine. You can change it later."
          />
          <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="Percentage">
            {(["10", "20", "other"] as const).map((v) => {
              const selected = pct === v;
              return (
                <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setPct(v)} style={[styles.pct, selected && styles.pctOn]}>
                  <Text style={[type.button, { color: selected ? colors.accent : colors.ink }]}>{v === "other" ? "Other" : `${v}%`}</Text>
                  <Text variant="label">{v === "10" ? "Maaser" : v === "20" ? "Chomesh" : "Your %"}</Text>
                </Pressable>
              );
            })}
          </View>
          {pct === "other" ? (
            <Field
              label="Your percentage"
              keyboardType="decimal-pad"
              value={otherPct}
              onChangeText={setOtherPct}
              error={otherPct && !ppm ? "Enter a percentage between 0 and 100, for example 15" : undefined}
            />
          ) : null}
        </>
      ) : (
        <Field label={period === "month" ? "Amount per month" : "Amount for the year"} prefix="R" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
      )}

      <View style={styles.result}>
        <Text style={{ fontSize: 17, fontFamily: "Archivo_600SemiBold" }}>Your target: {ok ? `${rand(target)} ${per}` : "R0"}</Text>
        {ok && period === "year" ? (
          <Text variant="bodyMuted" style={{ fontSize: 16 }}>
            About {rand(monthlyToReach(target, monthsLeft))} a month over the {monthsLeft} {monthsLeft === 1 ? "month" : "months"} left.
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 4 }}>
        <Button label="Save target" disabled={!ok} onPress={() => ok && onSave({ cents: target, period })} style={!ok ? { opacity: 0.4 } : undefined} />
        {onCancel ? <TextLink label="Cancel" onPress={onCancel} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 18, padding: 20, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  pct: { flex: 1, minHeight: 64, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: colors.parchment },
  pctOn: { borderColor: colors.accent, borderWidth: 1.5 },
  result: { gap: 4, padding: 14, borderRadius: radius.control, backgroundColor: colors.parchment },
});
