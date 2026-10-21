import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useLabelSuggestions } from "@/lib/use-labels";
import { ddmmyyyy, jhbToday } from "@/lib/format";
import { dateToIso, parseDdMmYyyy } from "@/lib/ledger";
import { parseRandToCents } from "@shared/money";
import { AMOUNT_MAX_LENGTH, amountProblem } from "@/lib/amount-input";
import { colors } from "@/theme/tokens";
import { Button, TextLink } from "./button";
import { Field } from "./field";
import { LabelPicker } from "./label-picker";
import type { SheetGuard } from "./sheet";
import { Text } from "./text";

/** Log income (for a goal set as a share of income). It stays on this phone only. */
export function IncomeForm({ onSave, onCancel, onGuard }: { onSave: (e: { cents: number; date: string; note: string }) => void; onCancel: () => void; onGuard?: (g: SheetGuard) => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => ddmmyyyy(jhbToday()));
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<{ amount?: string; date?: string }>({});
  // Tell the sheet once something is typed, so a stray swipe asks before throwing it away.
  const typed = Boolean(amount.trim() || note.trim());
  useEffect(() => onGuard?.(typed ? "typed" : null), [typed, onGuard]);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Text variant="h2" style={styles.title}>Log income</Text>
        <Text variant="bodyMuted">For a goal set as a share of your income, like 10%. Log what you earn and we work out the goal. This stays on your phone and is never sent to us.</Text>
      </View>
      <Field label="Amount" prefix="R" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} maxLength={AMOUNT_MAX_LENGTH} error={errors.amount} />
      <Field label="Date received (dd/mm/yyyy)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" error={errors.date} />
      <Field label="Note (optional)" value={note} onChangeText={setNote} maxLength={120} helper="For example: October salary" />
      <Button
        label="Save"
        onPress={() => {
          const cents = parseRandToCents(amount);
          const iso = parseDdMmYyyy(date, dateToIso(jhbToday()));
          const e = {
            amount: amountProblem(amount, "25000 or 25000.50") ?? undefined,
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

/** Log giving made outside the app: cash, an appeal, another charity. */
export function ElsewhereForm({ onSave, onCancel, onGuard }: { onSave: (e: { cents: number; date: string; recipient: string; label: string | null }) => Promise<string | null>; onCancel: () => void; onGuard?: (g: SheetGuard) => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => ddmmyyyy(jhbToday()));
  const [recipient, setRecipient] = useState("");
  const [label, setLabel] = useState<string | null>(null);
  const suggestions = useLabelSuggestions();
  const [errors, setErrors] = useState<{ amount?: string; date?: string; recipient?: string; form?: string }>({});
  const [busy, setBusy] = useState(false);
  // While saving the sheet stays open (so a failed save is seen); once something is typed, it asks first.
  const typed = Boolean(amount.trim() || recipient.trim());
  const guard: SheetGuard = busy ? "busy" : typed ? "typed" : null;
  useEffect(() => onGuard?.(guard), [guard, onGuard]);

  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 6 }}>
        <Text variant="h2" style={styles.title}>Log giving elsewhere</Text>
        <Text variant="bodyMuted">Cash, an appeal at work or another charity. It counts towards your giving goal.</Text>
      </View>
      <Field label="Amount" prefix="R" keyboardType="decimal-pad" value={amount} onChangeText={setAmount} maxLength={AMOUNT_MAX_LENGTH} error={errors.amount} />
      <Field label="Given to" value={recipient} onChangeText={setRecipient} maxLength={120} error={errors.recipient} helper="For example: School fun run (cash)" />
      <Field label="Date given (dd/mm/yyyy)" value={date} onChangeText={setDate} keyboardType="numbers-and-punctuation" error={errors.date} />
      <LabelPicker value={label} onChange={setLabel} suggestions={suggestions} />
      {errors.form ? <Text style={{ color: colors.danger }}>{errors.form}</Text> : null}
      <Button
        label={busy ? "Saving…" : "Save"}
        disabled={busy}
        onPress={async () => {
          const cents = parseRandToCents(amount);
          const iso = parseDdMmYyyy(date, dateToIso(jhbToday()));
          const who = recipient.trim();
          const e = {
            amount: amountProblem(amount, "180 or 180.50") ?? undefined,
            date: iso ? undefined : "Use a real date that is not in the future, like 09/10/2026.",
            recipient: who ? undefined : "Say who you gave to.",
          };
          setErrors(e);
          if (e.amount || e.date || e.recipient || !cents || !iso) return;
          setBusy(true);
          const problem = await onSave({ cents, date: iso, recipient: who, label });
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
});
