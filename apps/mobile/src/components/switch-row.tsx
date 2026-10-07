import { Pressable, StyleSheet, View } from "react-native";
import { colors, touch } from "@/theme/tokens";
import { Text } from "./text";

/** A setting that is on or off, with one line explaining it. */
export function SwitchRow({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
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
  );
}

/** A tick box for confirmations (age, consent). */
export function CheckRow({ label, value, onChange, error }: { label: string; value: boolean; onChange: (v: boolean) => void; error?: string }) {
  return (
    <View style={{ gap: 4 }}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={styles.checkRow}>
        <View style={[styles.box, value && styles.boxOn, error && !value ? { borderColor: colors.accent } : null]}>
          {value ? <View style={styles.tick} /> : null}
        </View>
        <Text style={{ flex: 1, fontSize: 16, lineHeight: 22 }}>{label}</Text>
      </Pressable>
      {error && !value ? <Text variant="label" style={{ color: colors.accent, marginLeft: 36 }}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16, minHeight: touch, paddingVertical: 6 },
  label: { fontFamily: "Assistant_600SemiBold", fontSize: 17, lineHeight: 23, color: colors.ink },
  track: { width: 50, height: 30, borderRadius: 15, backgroundColor: colors.hairline, padding: 3, justifyContent: "center" },
  trackOn: { backgroundColor: colors.accent },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface },
  knobOn: { alignSelf: "flex-end" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: touch - 8, paddingVertical: 4 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.muted, alignItems: "center", justifyContent: "center", marginTop: 1 },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tick: { width: 10, height: 6, borderLeftWidth: 2, borderBottomWidth: 2, borderColor: colors.onInk, transform: [{ rotate: "-45deg" }], marginTop: -2 },
});
