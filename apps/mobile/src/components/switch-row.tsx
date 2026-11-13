import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, fonts, touch } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { Text } from "./text";

/**
 * A setting that is on or off, with one short line explaining it. The full explanation, when there is one, sits
 * behind a small "More" tap (13/11/2026, Yehuda: "too much writing ... short, and then they can read more"), so
 * nothing is lost but the screen stays light. A screen reader reads the full text with the switch.
 */
export function SwitchRow({ label, description, more, value, onChange }: { label: string; description?: string; more?: string; value: boolean; onChange: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 2 }}>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: value }}
        accessibilityLabel={label}
        accessibilityHint={more ? `${description ?? ""} ${more}`.trim() : undefined}
        onPress={() => {
          haptic.tap();
          onChange(!value);
        }}
        style={styles.row}
      >
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={styles.label}>{label}</Text>
          {description ? <Text variant="bodyMuted" style={{ fontSize: 16, lineHeight: 22 }}>{description}</Text> : null}
        </View>
        <View style={[styles.track, value && styles.trackOn]}>
          <View style={[styles.knob, value && styles.knobOn]} />
        </View>
      </Pressable>
      {more ? (
        <View style={{ paddingRight: 66, gap: 4 }}>
          {open ? <Text variant="bodyMuted" style={{ fontSize: 15, lineHeight: 21 }}>{more}</Text> : null}
          <Pressable
            onPress={() => {
              haptic.tap();
              setOpen((o) => !o);
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={`${open ? "Hide" : "More about"} ${label}`}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 20 }}
            style={styles.moreTap}
          >
            <Text style={styles.moreText}>{open ? "Less" : "More"}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/** A tick box for confirmations (age, consent). */
export function CheckRow({ label, value, onChange, error }: { label: string; value: boolean; onChange: (v: boolean) => void; error?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => {
        haptic.tap();
        onChange(!value);
      }} style={styles.checkRow}>
        <View style={[styles.box, value && styles.boxOn, error && !value ? { borderColor: colors.danger } : null]}>
          {value ? <View style={styles.tick} /> : null}
        </View>
        <Text style={{ flex: 1, fontSize: 16, lineHeight: 22 }}>{label}</Text>
      </Pressable>
      {error && !value ? <Text variant="label" style={{ color: colors.danger, marginLeft: 36 }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: touch, paddingVertical: 6 },
  label: { fontFamily: fonts.bodySemibold, fontSize: 17, lineHeight: 23, color: colors.ink },
  // Off is a slate outline and a slate knob, so it reads as a switch on white; on is solid blue with a white knob.
  track: { width: 50, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.muted, backgroundColor: colors.surface, padding: 3, justifyContent: "center" },
  trackOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  knob: { width: 21, height: 21, borderRadius: 11, backgroundColor: colors.muted },
  knobOn: { alignSelf: "flex-end", backgroundColor: colors.surface },
  moreTap: { alignSelf: "flex-start", minHeight: 28, justifyContent: "center" },
  moreText: { fontFamily: fonts.bodySemibold, fontSize: 15, lineHeight: 20, color: colors.blue, textDecorationLine: "underline" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: touch - 8, paddingVertical: 4 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.muted, alignItems: "center", justifyContent: "center", marginTop: 1 },
  boxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  tick: { width: 10, height: 6, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: colors.onInk, transform: [{ rotate: "-45deg" }], marginTop: -2 },
});
