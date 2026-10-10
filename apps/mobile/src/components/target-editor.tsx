import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { rand } from "@/lib/format";
import { maaserTargetCents, monthlyToReach } from "@/lib/giving";
import { parseRandToCents, percentToPpm } from "@shared/money";
import { colors, radius, type } from "@/theme/tokens";
import { Button, TextLink } from "./button";
import { Field } from "./field";
import { haptic } from "@/lib/haptics";
import { InfoButton } from "./info-button";
import { Segmented } from "./segmented";
import { Text } from "./text";

export type TargetPeriod = "month" | "year";
/** Maaser target, and a separate chomesh target for donors who keep chomesh (null = maaser only). */
export type Target = { period: TargetPeriod; maaserCents: number; chomeshCents: number | null };

/** Maaser is a tenth of income; chomesh is a further tenth (a fifth in all). */
const TENTH_PPM = percentToPpm("10");

/** Cents back to what a person would type: 40000 -> "400", 12345 -> "123.45". */
function centsToInput(cents: number): string {
  const r = Math.floor(cents / 100);
  const c = cents % 100;
  return c ? `${r}.${String(c).padStart(2, "0")}` : String(r);
}

/** Set or change the maaser (and chomesh) targets: from income, or fixed amounts, per month or per year. */
export function TargetEditor({
  initial,
  yearEnd,
  monthsLeft,
  onSave,
  onCancel,
  cancelLabel = "Cancel",
  title,
}: {
  initial: Target | null;
  yearEnd: string;
  monthsLeft: number;
  onSave: (t: Target) => void;
  onCancel?: () => void;
  cancelLabel?: string;
  title?: string;
}) {
  const [mode, setMode] = useState<"income" | "amount">(initial ? "amount" : "income");
  const [period, setPeriod] = useState<TargetPeriod>(initial?.period ?? "month");
  const [keeps, setKeeps] = useState<"maaser" | "both">(initial && initial.chomeshCents === null ? "maaser" : initial ? "both" : "maaser");
  const [income, setIncome] = useState("");
  const [maaserAmount, setMaaserAmount] = useState(initial ? centsToInput(initial.maaserCents) : "");
  const [chomeshAmount, setChomeshAmount] = useState(initial?.chomeshCents ? centsToInput(initial.chomeshCents) : "");

  const incomeCents = parseRandToCents(income);
  const tenth = incomeCents ? maaserTargetCents(incomeCents, TENTH_PPM) : null;
  const maaser = mode === "income" ? tenth : parseRandToCents(maaserAmount);
  const chomesh = keeps === "both" ? (mode === "income" ? tenth : parseRandToCents(chomeshAmount)) : null;
  const ok = Boolean(maaser && maaser > 0) && (keeps === "maaser" || Boolean(chomesh && chomesh > 0));
  const per = period === "month" ? "a month" : "a year";

  return (
    <View style={styles.card}>
      <View style={{ gap: 6 }}>
        <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>{title ?? (initial ? "Change your targets" : "Set your maaser target")}</Text>
        <Text variant="bodyMuted">Maaser and chomesh are tracked separately. General tzedaka doesn&apos;t count towards either. Only you see this.</Text>
      </View>

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Text variant="label" style={{ color: colors.ink }}>I give</Text>
          <InfoButton terms={["maaser", "chomesh", "givingYear"]} label="maaser and chomesh" />
        </View>
        <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="I give">
          {([
            ["maaser", "Maaser", "A tenth"],
            ["both", "Maaser and chomesh", "A fifth in all"],
          ] as const).map(([v, label, note]) => {
            const selected = keeps === v;
            return (
              <Pressable key={v} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => {
                haptic.tap();
                setKeeps(v);
              }} style={[styles.choice, selected && styles.choiceOn]}>
                <Text style={[type.button, { fontSize: 16, color: selected ? colors.accent : colors.ink, textAlign: "center" }]}>{label}</Text>
                <Text variant="label">{note}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Segmented
        label="Targets per"
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
          { value: "income", label: "My income" },
          { value: "amount", label: "Fixed amounts" },
        ]}
      />

      {mode === "income" ? (
        <Field
          label={period === "month" ? "Income per month" : `Income for the year (to ${yearEnd})`}
          prefix="R"
          keyboardType="decimal-pad"
          value={income}
          onChangeText={setIncome}
          helper={keeps === "both" ? "Maaser is 10% of this, and chomesh a further 10%." : "Maaser is 10% of this."}
        />
      ) : (
        <>
          <Field label={period === "month" ? "Maaser per month" : "Maaser for the year"} prefix="R" keyboardType="decimal-pad" value={maaserAmount} onChangeText={setMaaserAmount} />
          {keeps === "both" ? (
            <Field label={period === "month" ? "Chomesh per month" : "Chomesh for the year"} prefix="R" keyboardType="decimal-pad" value={chomeshAmount} onChangeText={setChomeshAmount} />
          ) : null}
        </>
      )}

      <View style={styles.result}>
        <Text style={{ fontSize: 17, fontFamily: "Archivo_600SemiBold" }}>
          Maaser: {maaser ? `${rand(maaser)} ${per}` : "R0"}
        </Text>
        {keeps === "both" ? (
          <Text style={{ fontSize: 17, fontFamily: "Archivo_600SemiBold" }}>
            Chomesh: {chomesh ? `${rand(chomesh)} ${per}` : "R0"}
          </Text>
        ) : null}
        {ok && period === "year" ? (
          <Text variant="bodyMuted" style={{ fontSize: 16 }}>
            About {rand(monthlyToReach((maaser ?? 0) + (chomesh ?? 0), monthsLeft))} a month in all, over the {monthsLeft}{" "}
            {monthsLeft === 1 ? "month" : "months"} left.
          </Text>
        ) : null}
      </View>

      <View style={{ gap: 4 }}>
        <Button
          label="Save targets"
          disabled={!ok}
          onPress={() => ok && maaser && onSave({ period, maaserCents: maaser, chomeshCents: keeps === "both" ? chomesh : null })}
          style={!ok ? { opacity: 0.4 } : undefined}
        />
        {onCancel ? <TextLink label={cancelLabel} onPress={onCancel} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 18, padding: 20, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  choice: { flex: 1, minHeight: 64, paddingHorizontal: 8, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, alignItems: "center", justifyContent: "center", gap: 2, backgroundColor: colors.parchment },
  choiceOn: { borderColor: colors.accent, borderWidth: 1.5 },
  result: { gap: 4, padding: 14, borderRadius: radius.control, backgroundColor: colors.parchment },
});
