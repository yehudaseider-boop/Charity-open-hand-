import { Pressable, StyleSheet, View } from "react-native";
import { colors, radius, touch, type } from "@/theme/tokens";
import { haptic } from "@/lib/haptics";
import { Text } from "./text";

/** Two or three mutually exclusive options. Selected uses indigo. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  /** `disabled` options stay visible but dimmed and can't be chosen. */
  options: { value: T; label: string; disabled?: boolean }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.value === value;
        const off = Boolean(o.disabled);
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: off }}
            onPress={() => {
              if (off) return;
              if (!selected) haptic.tap();
              onChange(o.value);
            }}
            style={[styles.option, selected && styles.selected, off && styles.off]}
          >
            <Text style={[type.button, { fontSize: 16, color: selected ? colors.onInk : off ? colors.muted : colors.ink }, off && { textDecorationLine: "line-through" }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderRadius: radius.pill, padding: 4, gap: 4, backgroundColor: colors.lilacSoft },
  option: { flex: 1, minHeight: touch - 4, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  selected: { backgroundColor: colors.blue },
  off: { opacity: 0.5 },
});
