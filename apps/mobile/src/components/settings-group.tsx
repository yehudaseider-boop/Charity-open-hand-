import { Pressable, StyleSheet, View } from "react-native";
import { colors, radius, touch } from "@/theme/tokens";
import { ChevronIcon } from "./icons";
import { Text } from "./text";

export type Cell = { label: string; value?: string; onPress?: () => void; destructive?: boolean };

/** Component 4: a titled group of setting cells. */
export function SettingsGroup({ title, cells }: { title?: string; cells: Cell[] }) {
  return (
    <View style={{ gap: 8 }}>
      {title ? <Text variant="label" style={{ paddingHorizontal: 4 }}>{title}</Text> : null}
      <View style={styles.group}>
        {cells.map((c, i) => (
          <Pressable
            key={c.label}
            onPress={c.onPress}
            accessibilityRole="button"
            accessibilityLabel={c.value ? `${c.label}, ${c.value}` : c.label}
            style={({ pressed }) => [styles.cell, i > 0 && styles.divider, pressed && { backgroundColor: colors.parchment }]}
          >
            <Text style={[styles.label, c.destructive && { color: colors.accent }]}>{c.label}</Text>
            <View style={styles.right}>
              {c.value ? <Text variant="bodyMuted" style={{ fontSize: 16 }}>{c.value}</Text> : null}
              {c.destructive ? null : <ChevronIcon />}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: "hidden" },
  cell: { minHeight: touch + 6, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  label: { fontSize: 17, flex: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: 6 },
});
