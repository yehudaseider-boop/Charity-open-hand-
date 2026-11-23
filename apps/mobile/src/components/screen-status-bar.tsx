import { useIsFocused } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { BarStyle } from "@/lib/status-bar";

/**
 * This screen's clock and battery colour, set only while the screen is the one showing. Tab screens stay mounted
 * when another tab opens, so an always-mounted bar would leak its colour to the other tabs; this one steps aside
 * as soon as the screen loses focus, and the root layout's dark bar (white pages) shows again.
 * Never sets a background: on Android the bar stays see-through, as everywhere else.
 */
export function ScreenStatusBar({ style }: { style: BarStyle }) {
  const focused = useIsFocused();
  return focused ? <StatusBar style={style} /> : null;
}
