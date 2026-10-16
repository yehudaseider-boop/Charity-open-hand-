import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import type { Cause } from "@/data/sample";
import { haptic } from "@/lib/haptics";
import { colors, fonts, space } from "@/theme/tokens";
import { Text } from "./text";

/**
 * Causes as a row of soft icon tiles, like an app's categories: a rounded box with a line icon
 * and the name under it. Charities' causes are set by admins, so the icon is picked from words in
 * the name, with a heart for anything we don't recognise.
 */
type IconName = "all" | "food" | "book" | "shul" | "medical" | "kids" | "clothes" | "home" | "paw" | "leaf" | "heart";

export function iconForCause(id: string, label: string): IconName {
  if (id === "all") return "all";
  const t = label.toLowerCase();
  if (/food|meal|welfare|hunger|parcel/.test(t)) return "food";
  if (/torah|educat|school|yeshiv|learn|kollel|study/.test(t)) return "book";
  if (/shul|synagog|church|mosque|temple|faith|worship|communit/.test(t)) return "shul";
  if (/animal|pet|wildlife|rescue/.test(t)) return "paw";
  if (/environment|nature|climate|green|tree/.test(t)) return "leaf";
  if (/medic|health|hospital|bikur|care/.test(t)) return "medical";
  if (/child|kid|toy|youth|camp/.test(t)) return "kids";
  if (/cloth|shoe|wear/.test(t)) return "clothes";
  if (/hous|home|shelter|hachnas/.test(t)) return "home";
  return "heart";
}

const line = (color: string) => ({ stroke: color, strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" });

function CauseIcon({ name, color }: { name: IconName; color: string }) {
  const s = line(color);
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24">
      {name === "all" ? (
        <>
          <Rect x="4" y="4" width="6.5" height="6.5" rx="2" {...s} />
          <Rect x="13.5" y="4" width="6.5" height="6.5" rx="2" {...s} />
          <Rect x="4" y="13.5" width="6.5" height="6.5" rx="2" {...s} />
          <Rect x="13.5" y="13.5" width="6.5" height="6.5" rx="2" {...s} />
        </>
      ) : name === "food" ? (
        <>
          <Path d="M3.5 12h17a8.5 8.5 0 01-17 0z" {...s} />
          <Path d="M9 8.5c0-1.2 1-1.3 1-2.5M13 8.5c0-1.2 1-1.3 1-2.5" {...s} />
        </>
      ) : name === "book" ? (
        <>
          <Path d="M12 6.5c-2-1.4-4.8-1.8-8-1.5v13c3.2-.3 6 .1 8 1.5 2-1.4 4.8-1.8 8-1.5V5c-3.2-.3-6 .1-8 1.5z" {...s} />
          <Path d="M12 6.5V19.5" {...s} />
        </>
      ) : name === "shul" ? (
        <>
          <Path d="M4 20V10.5L12 5l8 5.5V20" {...s} />
          <Path d="M3 20h18M10 20v-4.5a2 2 0 014 0V20" {...s} />
          <Path d="M12 8.2l1 1.7h-2l1-1.7z" {...s} />
        </>
      ) : name === "medical" ? (
        <>
          <Rect x="3.5" y="3.5" width="17" height="17" rx="5" {...s} />
          <Path d="M12 8v8M8 12h8" {...s} />
        </>
      ) : name === "kids" ? (
        <>
          <Circle cx="12" cy="9" r="5" {...s} />
          <Path d="M12 14l-1 1.5h2L12 14zM12 15.5c0 2-1.5 2.5-1.5 4.5" {...s} />
        </>
      ) : name === "clothes" ? (
        <Path d="M9 4l3 2 3-2 5 3-2 4-2-1v10H8V10l-2 1-2-4 5-3z" {...s} />
      ) : name === "home" ? (
        <>
          <Path d="M4 11l8-6.5 8 6.5" {...s} />
          <Path d="M6 9.5V20h12V9.5M10 20v-5h4v5" {...s} />
        </>
      ) : name === "paw" ? (
        <>
          <Path d="M12 13c-3 0-5 3-5 5 0 1.5 1.5 2 3 1.5s2.5-.5 4 0 3 0 3-1.5c0-2-2-5-5-5z" {...s} />
          <Circle cx="6.5" cy="10" r="1.6" {...s} />
          <Circle cx="9.5" cy="6.5" r="1.6" {...s} />
          <Circle cx="14.5" cy="6.5" r="1.6" {...s} />
          <Circle cx="17.5" cy="10" r="1.6" {...s} />
        </>
      ) : name === "leaf" ? (
        <>
          <Path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14z" {...s} />
          <Path d="M5 19l8-8" {...s} />
        </>
      ) : (
        <Path d="M12 19.5s-7.5-4.4-7.5-9.6A4.2 4.2 0 0112 7.6a4.2 4.2 0 017.5 2.3c0 5.2-7.5 9.6-7.5 9.6z" {...s} />
      )}
    </Svg>
  );
}

export function CauseTiles({ causes, selected, onSelect }: { causes: Cause[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row} accessibilityRole="tablist">
      {causes.map((c) => {
        const on = c.id === selected;
        return (
          <Pressable
            key={c.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={c.label}
            onPress={() => {
              haptic.tap();
              onSelect(c.id);
            }}
            style={({ pressed }) => [styles.tile, pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <View style={[styles.box, on && styles.boxOn]}>
              <CauseIcon name={iconForCause(c.id, c.label)} color={on ? colors.onInk : colors.blue} />
            </View>
            <Text numberOfLines={2} style={[styles.label, on && styles.labelOn]}>{c.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { paddingHorizontal: space.gutter, gap: 8, paddingVertical: 4 },
  tile: { width: 84, alignItems: "center", gap: 8 },
  box: { width: 68, height: 68, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: colors.lilacSoft, borderWidth: 1, borderColor: colors.lilac },
  boxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  label: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 18, color: colors.ink, textAlign: "center" },
  labelOn: { fontFamily: fonts.bodySemibold, color: colors.blue },
});
