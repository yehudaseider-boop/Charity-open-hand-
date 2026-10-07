import { Pressable, StyleSheet, View } from "react-native";
import { colors, radius, touch, type } from "@/theme/tokens";
import { Text } from "./text";

/** Two or three mutually exclusive options. Selected uses ink. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.option, selected && styles.selected]}
          >
            <Text style={[type.button, { fontSize: 16, color: selected ? colors.onInk : colors.ink }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: "row", borderWidth: 1, borderColor: colors.hairline, borderRadius: radius.control, padding: 4, gap: 4, backgroundColor: colors.parchment },
  option: { flex: 1, minHeight: touch - 4, borderRadius: radius.control - 4, alignItems: "center", justifyContent: "center" },
  selected: { backgroundColor: colors.ink },
});
