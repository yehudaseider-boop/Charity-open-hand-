import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { parseRandToCents, percentToPpm } from "@shared/money";
import { AMOUNT_MAX_LENGTH, amountProblem } from "@/lib/amount-input";
import { CHOMESH_PRESET, MAASER_PRESET, ppmToPercentText, type Goal, type GoalPeriod, type GoalYear } from "@/lib/goals";
import { haptic } from "@/lib/haptics";
import { centsToInput } from "@/lib/pay-api";
import { colors, fonts, radius } from "@/theme/tokens";
import { Button, TextLink } from "./button";
import { Field } from "./field";
import { Segmented } from "./segmented";
import { Text } from "./text";

/** "10" or "12.5" -> ppm, or null if it isn't a percentage between 0 and 100. */
function percentFrom(text: string): number | null {
  const t = text.trim().replace(",", ".").replace("%", "");
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(t)) return null;
  try {
    const ppm = percentToPpm(t);
    return ppm > 0 ? ppm : null;
  } catch {
    return null;
  }
}

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Set or change a giving goal: a share of income (10% is maaser) or a set amount, per month or per
 * year, counting all giving or only gifts with certain labels. With the Jewish switch on, Maaser and
 * Chomesh are one tap away, and a year can run Rosh Hashana to Rosh Hashana.
 */
export function GoalEditor({
  initial,
  labels,
  jewish,
  onSave,
  onCancel,
  onRemove,
  title,
  cancelLabel = "Cancel",
}: {
  initial: Goal | null;
  /** Labels the donor has used, for "only gifts labelled". */
  labels: string[];
  jewish: boolean;
  /** May return a promise: the button then says "Saving…" and can't be tapped twice until it settles. */
  onSave: (g: Goal) => void | Promise<unknown>;
  onCancel?: () => void;
  onRemove?: () => void;
  title?: string;
  cancelLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "Giving goal");
  const [basis, setBasis] = useState<Goal["basis"]>(initial?.basis ?? "fixed");
  const [percent, setPercent] = useState(initial?.percentPpm ? ppmToPercentText(initial.percentPpm).replace("%", "") : "10");
  const [amount, setAmount] = useState(initial?.fixedCents ? centsToInput(initial.fixedCents) : "");
  const [period, setPeriod] = useState<GoalPeriod>(initial?.period ?? "year");
  const [year, setYear] = useState<GoalYear>(initial?.year ?? "tax");
  const [some, setSome] = useState(Boolean(initial?.counts));
  const [chosen, setChosen] = useState<string[]>(initial?.counts ?? []);
  const [newLabel, setNewLabel] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const offered = [...labels];
  for (const c of chosen) if (!offered.some((o) => o.toLowerCase() === c.toLowerCase())) offered.push(c);
  const isChosen = (l: string) => chosen.some((c) => c.toLowerCase() === l.toLowerCase());
  const toggle = (l: string) => setChosen((cs) => (isChosen(l) ? cs.filter((c) => c.toLowerCase() !== l.toLowerCase()) : [...cs, l]));

  const preset = (p: Omit<Goal, "id">) => {
    haptic.tap();
    setName(p.name);
    setBasis(p.basis);
    setPercent(p.percentPpm ? ppmToPercentText(p.percentPpm).replace("%", "") : "10");
    setPeriod(p.period);
    setYear(p.year);
    setSome(Boolean(p.counts));
    setChosen(p.counts ?? []);
  };

  const save = () => {
    const e: Record<string, string> = {};
    const ppm = basis === "income" ? percentFrom(percent) : null;
    const cents = basis === "fixed" ? parseRandToCents(amount) : null;
    if (!name.trim()) e.name = "Give your goal a name";
    if (basis === "income" && !ppm) e.percent = "Enter a percentage, for example 10 or 12.5";
    if (basis === "fixed" && !(cents && cents > 0)) e.amount = amountProblem(amount, "12000") ?? "Enter an amount in Rand, for example 12000";
    if (some && chosen.length === 0) e.counts = "Choose at least one label, or count all your giving";
    setErrors(e);
    if (Object.keys(e).length || saving) return;
    const result = onSave({
      id: initial?.id ?? newId(),
      name: name.trim().slice(0, 40),
      basis,
      percentPpm: basis === "income" ? ppm : null,
      fixedCents: basis === "fixed" ? cents : null,
      period,
      year: jewish ? year : initial?.year === "hebrew" ? "hebrew" : "tax",
      counts: some ? chosen : null,
    });
    if (result instanceof Promise) {
      setSaving(true);
      result.finally(() => setSaving(false));
    }
  };

  return (
    <View style={styles.card}>
      <View style={{ gap: 6 }}>
        <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>{title ?? (initial ? "Change your goal" : "Set a giving goal")}</Text>
        <Text variant="bodyMuted">How much you&apos;d like to give, so you can see how you&apos;re doing. Only you see it, and it stays on this phone.</Text>
      </View>

      {jewish && !initial ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable accessibilityRole="button" onPress={() => preset(MAASER_PRESET)} style={styles.preset}>
            <Text style={styles.presetTitle}>Maaser</Text>
            <Text variant="label">10% of income</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => preset(CHOMESH_PRESET)} style={styles.preset}>
            <Text style={styles.presetTitle}>Chomesh</Text>
            <Text variant="label">A further 10%</Text>
          </Pressable>
        </View>
      ) : null}

      <Field label="Name" value={name} onChangeText={setName} maxLength={40} error={errors.name} />

      <Segmented
        label="The goal is"
        value={basis}
        onChange={setBasis}
        options={[
          { value: "fixed", label: "A set amount" },
          { value: "income", label: "A share of income" },
        ]}
      />
      {basis === "fixed" ? (
        <Field label={period === "month" ? "Amount each month" : "Amount each year"} prefix="R" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} maxLength={AMOUNT_MAX_LENGTH} error={errors.amount} placeholder="0" />
      ) : (
        <Field
          label="Percentage of income"
          keyboardType="decimal-pad"
          value={percent}
          onChangeText={setPercent}
          error={errors.percent}
          helper="Log your income on the Progress tab and we work out the amount. Your income stays on this phone."
        />
      )}

      <Segmented
        label="Each"
        value={period}
        onChange={setPeriod}
        options={[
          { value: "month", label: "Month" },
          { value: "year", label: "Year" },
        ]}
      />
      {period === "year" && jewish ? (
        <Segmented
          label="Year runs"
          value={year}
          onChange={setYear}
          options={[
            { value: "tax", label: "Tax year (March)" },
            { value: "hebrew", label: "Rosh Hashana" },
          ]}
        />
      ) : null}

      <Segmented
        label="What counts"
        value={some ? "some" : "all"}
        onChange={(v) => setSome(v === "some")}
        options={[
          { value: "all", label: "All my giving" },
          { value: "some", label: "Some labels" },
        ]}
      />
      {some ? (
        <View style={{ gap: 8 }}>
          <Text variant="label" style={{ color: colors.ink }}>Gifts labelled</Text>
          <View style={styles.chips}>
            {offered.map((l) => {
              const on = isChosen(l);
              return (
                <Pressable key={l} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => { haptic.tap(); toggle(l); }} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && { color: colors.onInk }]}>{l}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Field label="Another label" value={newLabel} onChangeText={setNewLabel} maxLength={40} />
            </View>
            <TextLink
              label="Add"
              onPress={() => {
                const l = newLabel.trim();
                if (l && !isChosen(l)) setChosen((cs) => [...cs, l]);
                setNewLabel("");
              }}
            />
          </View>
          {errors.counts ? <Text variant="label" style={{ color: colors.danger }}>{errors.counts}</Text> : null}
        </View>
      ) : null}

      <Button label={saving ? "Saving…" : "Save goal"} disabled={saving} onPress={save} />
      {onCancel ? <TextLink label={cancelLabel} onPress={onCancel} /> : null}
      {onRemove ? <TextLink label="Remove this goal" onPress={onRemove} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 18, padding: 20, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  preset: { flex: 1, minHeight: 64, padding: 12, gap: 2, borderRadius: radius.control, borderWidth: 1.5, borderColor: colors.blue, backgroundColor: colors.blueSoft, justifyContent: "center" },
  presetTitle: { fontFamily: fonts.bodySemibold, fontSize: 17, color: colors.blue },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.blue, justifyContent: "center", backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.blue },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.blue },
});
