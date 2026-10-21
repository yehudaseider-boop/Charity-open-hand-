import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { haptic } from "@/lib/haptics";
import { colors, fonts, radius } from "@/theme/tokens";
import { Field } from "./field";
import { Text } from "./text";

/**
 * The donor's own label for a gift, optional and only theirs: one tap on a label they used before
 * (or Maaser, Chomesh, Tzedaka with the Jewish switch on), or type a new one. Tap the chosen one
 * again for no label.
 */
export function LabelPicker({ value, onChange, suggestions, title = "Label (optional, only you see it)" }: { value: string | null; onChange: (v: string | null) => void; suggestions: string[]; title?: string }) {
  const shown = suggestions.slice(0, 6);
  const isOwn = value !== null && !shown.some((s) => s.toLowerCase() === value.toLowerCase());
  const [typing, setTyping] = useState(isOwn);
  return (
    <View style={{ gap: 8 }}>
      <Text variant="label" style={{ color: colors.ink }}>{title}</Text>
      <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Label">
        {shown.map((s) => {
          const on = !typing && value !== null && s.toLowerCase() === value.toLowerCase();
          return (
            <Pressable
              key={s}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              onPress={() => {
                haptic.tap();
                setTyping(false);
                onChange(on ? null : s);
              }}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && { color: colors.onInk }]}>{s}</Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: typing }}
          onPress={() => {
            haptic.tap();
            setTyping(true);
            if (!isOwn) onChange(null);
          }}
          style={[styles.chip, typing && styles.chipOn]}
        >
          <Text style={[styles.chipText, typing && { color: colors.onInk }]}>{shown.length ? "New label" : "Add a label"}</Text>
        </Pressable>
      </View>
      {typing ? (
        <Field label="Your label" value={value ?? ""} onChangeText={(t) => onChange(t.trim() ? t.slice(0, 40) : null)} maxLength={40} helper="For example: Work giving, Family." autoCapitalize="sentences" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.blue, justifyContent: "center", backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.blue },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.blue },
});
