import { useCallback, useState } from "react";
import { type NativeScrollEvent, type NativeSyntheticEvent, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "@/theme/tokens";
import { ScreenStatusBar } from "./screen-status-bar";

/**
 * A white band behind the phone's clock and battery, shown once a screen has scrolled, so text never runs
 * underneath them. At the top of the screen it stays out of the way, so a blue header still reaches the top
 * edge. Put `cover` after the scroll view and pass `onScroll` to it (with scrollEventThrottle 16).
 *
 * `onBlue`: the screen starts with a blue colour block, so the clock is white while the block is under it and
 * turns dark once the white band shows. Other screens keep the dark clock. Only while the screen is showing.
 */
export function useStatusCover({ onBlue = false }: { onBlue?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => setScrolled(e.nativeEvent.contentOffset.y > 4), []);
  const band = scrolled && insets.top > 0 ? <View pointerEvents="none" style={[styles.cover, { height: insets.top }]} /> : null;
  const cover = (
    <>
      <ScreenStatusBar style={onBlue && !scrolled ? "light" : "dark"} />
      {band}
    </>
  );
  return { onScroll, cover };
}

const styles = StyleSheet.create({
  cover: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.hairline },
});
