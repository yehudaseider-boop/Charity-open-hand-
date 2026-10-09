import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import type { GivingKind } from "@/data/giving";
import { givingKindLabels } from "@/lib/giving";
import { dateToIso, parseDdMmYyyy, todayDdMmYyyy } from "@/lib/ledger";
import { parseRandToCents } from "@shared/money";
import { colors, radius, type } from "@/theme/tokens";
import { Button, TextLink } from "./button";
import { Field } from "./field";
import { Text } from "./text";

/** Log income (for maaser). It stays on this phone only. */
export function IncomeForm({ onSave, onCancel }: { onSave: (e: { cents: number; date: string; note: string }) => void; onCancel: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayDdMmYyyy());
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Text variant="h2" style={styles.title}>Log income</Text>
        <Text variant="bodyMuted">Maaser is a tenth of your income. Log what you earn and we keep count of what is owed. This stays on your phone and is never sent to us.</Text>
      </View>
      <Field label="Amount" prefix="R" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} error={errors.amount} />
      <Field label="Date received (dd/mm/yyyy)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" error={errors.date} />
      <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={120} helper="For example: October salary" />
      <Button
        label="Save"
        onPress={() => {
          const cents = parseRandToCents(amount);
          const iso = parseDdMmYyyy(date, dateToIso(new Date()));
          const e = {
            amount: cents && cents > 0 ? undefined : "Enter an amount in Rand, for example 25000 or 25000.50.",
            date: iso ? undefined : "Use a real date that is not in the future, like 09/10/2026.",
          };
          setErrors(e);
          if (!e.amount && !e.date && cents && iso) onSave({ cents, date: iso, note: note.trim() });
        }}
      />
      <TextLink label="Cancel" onPress={onCancel} />
    </View>
  );
}

/** Log giving made outside the app: cash, a shul appeal, another charity. */
export function ElsewhereForm({ onSave, onCancel }: { onSave: (e: { cents: number; date: string; recipient: string; kind: GivingKind }) => Promise<string | null>; onCancel: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayDdMmYyyy());
  const [recipient, setRecipient] = useState("");
  const [kind, setKind] = useState<GivingKind | null>(null);
  const [errors, setErrors] = useState<{ amount?: string; date?: string; recipient?: string; kind?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Text variant="h2" style={styles.title}>Log giving elsewhere</Text>
        <Text variant="bodyMuted">Cash, a shul appeal or another charity. It counts towards your maaser and chomesh.</Text>
      </View>
      <Field label="Amount" prefix="R" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} error={errors.amount} />
      <Field label="Given to" value={recipient} onChangeText={setRecipient} maxLength={120} error={errors.recipient} helper="For example: Shul appeal (cash)" />
      <Field label="Date given (dd/mm/yyyy)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" error={errors.date} />
      <View style={{ gap: 6 }}>
        <Text variant="label" style={{ color: colors.ink }}>This counts as</Text>
        <View style={{ flexDirection: "row", gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="This counts as">
          {(Object.keys(givingKindLabels) as GivingKind[]).map((k) => {
            const selected = kind === k;
            return (
              <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => setKind(k)} style={[styles.choice, selected && styles.choiceOn]}>
                <Text style={[type.button, { fontSize: 16, textAlign: "center", color: selected ? colors.accent : colors.ink }]}>{givingKindLabels[k]}</Text>
              </Pressable>
            );
          })}
        </View>
        {errors.kind ? <Text variant="label" style={{ color: colors.danger }}>{errors.kind}</Text> : null}
      </View>
      {errors.form ? <Text style={{ color: colors.danger }}>{errors.form}</Text> : null}
      <Button
        label={busy ? "Saving…" : "Save"}
        disabled={busy}
        onPress={async () => {
          const cents = parseRandToCents(amount);
          const iso = parseDdMmYyyy(date, dateToIso(new Date()));
          const who = recipient.trim();
          const e = {
            amount: cents && cents > 0 ? undefined : "Enter an amount in Rand, for example 180 or 180.50.",
            date: iso ? undefined : "Use a real date that is not in the future, like 09/10/2026.",
            recipient: who ? undefined : "Say who you gave to.",
            kind: kind ? undefined : "Choose maaser, chomesh or general tzedaka.",
          };
          setErrors(e);
          if (e.amount || e.date || e.recipient || e.kind || !cents || !iso || !kind) return;
          setBusy(true);
          const problem = await onSave({ cents, date: iso, recipient: who, kind });
          setBusy(false);
          if (problem) setErrors({ form: problem });
        }}
      />
      <TextLink label="Cancel" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, lineHeight: 28 },
  choice: { flex: 1, minHeight: 56, paddingHorizontal: 8, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, justifyContent: "center", backgroundColor: colors.surface },
  choiceOn: { borderColor: colors.accent, borderWidth: 1.5 },
});
