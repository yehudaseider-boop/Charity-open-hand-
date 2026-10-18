import { useState } from "react";
import { Image, StyleSheet, View, type ViewStyle } from "react-native";
import { initials } from "@shared/charity/initials";
import type { Charity } from "@/data/sample";
import { colors, fonts, radius } from "@/theme/tokens";
import { Blob } from "./blob";
import { PlaceholderImage } from "./placeholder-image";
import { Text } from "./text";

/**
 * A charity's own photo when it has uploaded one. Otherwise a Givezy blue block with orange and
 * lavender splashes and the charity's initials (live, and wherever text sits over the image), or the
 * labelled placeholder (sample data, for design review).
 */
export function CharityImage({
  charity,
  live,
  style,
  rounded = true,
  compact = false,
  labelPosition,
  labelOffset,
  bare = false,
}: {
  charity: Charity;
  live: boolean;
  style?: ViewStyle;
  rounded?: boolean;
  compact?: boolean;
  labelPosition?: "top" | "bottom";
  labelOffset?: number;
  /** No initials and no placeholder label: text will be set over the image. */
  bare?: boolean;
}) {
  const shape = [styles.box, rounded && { borderRadius: compact ? radius.control : radius.card }, style];
  // A photo that can't load (no connection, moved) shows the blue block instead of an empty box.
  const [broken, setBroken] = useState<string | null>(null);
  if (charity.coverUrl && broken !== charity.coverUrl) {
    return (
      <View style={shape}>
        <Image source={{ uri: charity.coverUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel={`Photo from ${charity.nameEn}`} onError={() => setBroken(charity.coverUrl ?? null)} />
      </View>
    );
  }
  if (live || bare || broken) {
    const s = compact ? 0.45 : 1;
    return (
      <View style={[shape, styles.centre, styles.blue]} accessible={false}>
        <Blob size={150 * s} color={colors.orange} rotate={25} style={{ right: -55 * s, top: -60 * s }} />
        <Blob size={110 * s} color={colors.lilac} rotate={-15} stretch={1.3} style={{ left: -45 * s, bottom: -55 * s }} />
        {bare ? null : <Text style={[styles.initials, compact && { fontSize: 26 }]}>{initials(charity.nameEn)}</Text>}
      </View>
    );
  }
  return <PlaceholderImage subject={charity.photo} rounded={rounded} compact={compact} labelPosition={bare ? "top" : labelPosition} labelOffset={labelOffset} style={style} />;
}

const styles = StyleSheet.create({
  box: { backgroundColor: colors.lilacSoft, overflow: "hidden" },
  centre: { alignItems: "center", justifyContent: "center" },
  blue: { backgroundColor: colors.blue },
  initials: { fontFamily: fonts.display, fontSize: 52, color: colors.onInk, letterSpacing: 1 },
});
