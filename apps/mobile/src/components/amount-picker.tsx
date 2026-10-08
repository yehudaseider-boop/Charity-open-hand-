import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { feeSettings } from "@/config/fees";
import { quickAmountsCents } from "@/data/sample";
import { checkAmount } from "@/lib/amount";
import { parseRandToCents } from "@shared/money";
import { rand } from "@/lib/format";
import { colors, radius, touch, type } from "@/theme/tokens";
import { Button } from "./button";
import { Field } from "./field";
import { Segmented } from "./segmented";
import { Text } from "./text";

export type Frequency = "once" | "monthly";

/** Component 2: amount picker. Large amount, quick amounts, custom field, one-off or monthly. */
export function AmountPicker({
  charityName,
  initialCustom,
  onContinue,
}: {
  charityName: string;
  initialCustom?: string;
  onContinue: (cents: number, frequency: Frequency) => void;
}) {
  const [frequency, setFrequency] = useState<Frequency>("once");
  const [quick, setQuick] = useState<number | null>(initialCustom ? null : quickAmountsCents[0]);
  const [custom, setCustom] = useState(initialCustom ?? "");
  const [touched, setTouched] = useState(Boolean(initialCustom));

  const min = feeSettings.minDonationCents;
  const check = quick !== null ? ({ ok: true, cents: quick } as const) : checkAmount(custom, min);
  const typedCents = quick === null ? parseRandToCents(custom) : null;
  const shownCents = quick ?? (check.ok ? check.cents : typedCents);
  const error =
    touched && !check.ok && check.reason !== "empty"
      ? check.reason === "below_minimum"
        ? `The minimum donation is ${rand(min)}.`
        : "Enter an amount in Rand, for example 180."
      : undefined;

  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 4 }}>
        <Text variant="label">Give to {charityName}</Text>
        <Text variant="amount" accessibilityLiveRegion="polite" style={!check.ok ? { color: colors.muted } : undefined}>
          {shownCents !== null ? rand(shownCents) : "R0"}
        </Text>
        {frequency === "monthly" ? <Text variant="bodyMuted">Every month, until you pause or cancel.</Text> : null}
      </View>

      <Segmented
        label="How often"
        value={frequency}
        onChange={setFrequency}
        options={[
          { value: "once", label: "One-off" },
          { value: "monthly", label: "Monthly" },
        ]}
      />

      <View style={styles.quickRow} accessibilityRole="radiogroup" accessibilityLabel="Quick amounts">
        {quickAmountsCents.map((c) => {
          const selected = quick === c;
          return (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => {
                setQuick(c);
                setCustom("");
                setTouched(false);
              }}
              style={[styles.quick, selected && styles.quickSelected]}
            >
              <Text style={[type.button, { color: selected ? colors.accent : colors.ink }]}>{rand(c)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Field
        label="Other amount"
        prefix="R"
        keyboardType="decimal-pad"
        value={custom}
        onChangeText={(t) => {
          setCustom(t);
          setQuick(null);
        }}
        onBlur={() => setTouched(true)}
        helper={`Minimum ${rand(min)}.`}
        error={error}
      />

      {frequency === "monthly" ? (
        <Text variant="bodyMuted" style={{ fontSize: 16 }}>
          Monthly donations need a free account, so you can pause or cancel any time. We&apos;ll set it up at checkout.
        </Text>
      ) : null}

      <Button
        label="Continue"
        disabled={!check.ok}
        onPress={() => {
          setTouched(true);
          if (check.ok) onContinue(check.cents, frequency);
        }}
        style={!check.ok ? { opacity: 0.4 } : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  quickRow: { flexDirection: "row", gap: 8 },
  quick: {
    flex: 1,
    minHeight: touch,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  quickSelected: { borderColor: colors.accent, borderWidth: 1.5 },
});

