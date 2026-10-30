import { Pressable, StyleSheet, View } from "react-native";
import { colors, fonts, radius, touch } from "@/theme/tokens";
import { ChevronIcon } from "./icons";
import { Text } from "./text";

export type Cell = { label: string; value?: string; onPress?: () => void; destructive?: boolean };

/** Component 4: a titled group of setting cells. */
export function SettingsGroup({ title, cells }: { title?: string; cells: Cell[] }) {
  return (
    <View style={{ gap: 8 }}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      <View style={styles.group}>
        {cells.map((c, i) => (
          <Pressable
            key={c.label}
            onPress={c.onPress}
            accessibilityRole="button"
            accessibilityLabel={c.value ? `${c.label}, ${c.value}` : c.label}
            style={({ pressed }) => [styles.cell, i > 0 && styles.divider, pressed && { backgroundColor: colors.lilacSoft }]}
          >
            <Text style={[styles.label, c.destructive && { color: colors.danger }]}>{c.label}</Text>
            <View style={styles.right}>
              {c.value ? <Text variant="bodyMuted" style={{ fontSize: 16 }}>{c.value}</Text> : null}
              {c.destructive ? null : <ChevronIcon color={colors.blue} />}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.navy, paddingHorizontal: 4 },
  group: { borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface, overflow: "hidden" },
  cell: { minHeight: touch + 8, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  label: { fontFamily: fonts.bodyMedium, fontSize: 17, flex: 1 },
  right: { flexDirection: "row", alignItems: "center", gap: 6 },
});
