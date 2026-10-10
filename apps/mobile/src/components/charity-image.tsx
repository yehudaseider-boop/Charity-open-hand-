import { Image, StyleSheet, View, type ViewStyle } from "react-native";
import { initials } from "@shared/charity/initials";
import type { Charity } from "@/data/sample";
import { colors, fonts, radius } from "@/theme/tokens";
import { PlaceholderImage } from "./placeholder-image";
import { Text } from "./text";

/**
 * A charity's own photo when it has uploaded one. Otherwise its initials on a
 * soft background (live), or the labelled placeholder (sample data).
 */
export function CharityImage({
  charity,
  live,
  style,
  rounded = true,
  compact = false,
  labelPosition,
  labelOffset,
}: {
  charity: Charity;
  live: boolean;
  style?: ViewStyle;
  rounded?: boolean;
  compact?: boolean;
  labelPosition?: "top" | "bottom";
  labelOffset?: number;
}) {
  const shape = [styles.box, rounded && { borderRadius: compact ? radius.control : radius.card }, style];
  if (charity.coverUrl) {
    return (
      <View style={shape}>
        <Image source={{ uri: charity.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`Photo from ${charity.nameEn}`} />
      </View>
    );
  }
  if (live) {
    return (
      <View style={[shape, styles.centre]} accessible={false}>
        <Text style={[styles.initials, compact && { fontSize: 28 }]}>{initials(charity.nameEn)}</Text>
      </View>
    );
  }
  return <PlaceholderImage subject={charity.photo} rounded={rounded} compact={compact} labelPosition={labelPosition} labelOffset={labelOffset} style={style} />;
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.accentSoft, overflow: "hidden" },
  centre: { alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: fonts.bodySemibold, fontSize: 48, color: colors.accent, letterSpacing: 1 },
});
