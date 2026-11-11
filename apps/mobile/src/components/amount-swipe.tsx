import { useEffect, useState } from "react";
import { PanResponder, Pressable, StyleSheet, View } from "react-native";
import { stepAmount } from "@/lib/amount-steps";
import { haptic } from "@/lib/haptics";
import { colors, fonts, touch } from "@/theme/tokens";
import { Text } from "./text";

/** How far a finger has to move, in points, for one step. */
const PER_STEP = 34;

/** What the swipe handlers need to know, kept up to date outside of drawing (the same pattern as the sheet). */
class Dial {
  cents: number | null = null;
  min = 0;
  max: number | null = null;
  disabled = false;
  onChange: (cents: number) => void = () => undefined;
  /** Steps taken so far in this swipe, and the amount reached (the screen may not have redrawn yet). */
  moved = 0;
  working: number | null = null;

  set(cents: number | null, min: number, max: number | null, disabled: boolean, onChange: (cents: number) => void) {
    this.cents = cents;
    this.min = min;
    this.max = max;
    this.disabled = disabled;
    this.onChange = onChange;
  }
  step(dir: 1 | -1): boolean {
    const next = stepAmount(this.working ?? this.cents, dir, this.min, this.max);
    if (next === null) return false;
    this.working = next;
    this.onChange(next);
    haptic.tap();
    return true;
  }
  /** A tap on minus or plus: always from the amount on screen. */
  tap(dir: 1 | -1) {
    this.working = null;
    this.step(dir);
  }
}

/**
 * Wraps the big amount (11/11/2026): slide left or right across it to nudge the gift down or up a step, with a soft
 * tick for each, or use the minus and plus beside it. It only moves an amount that is already there (typed, or one
 * of the donor's own recent ones), never starts one, and never goes past the smallest or largest gift. Sideways, so
 * it never fights the screen's own up and down scrolling.
 */
export function AmountSwipe({ cents, min, max, disabled, onChange, children }: { cents: number | null; min: number; max: number | null; disabled: boolean; onChange: (cents: number) => void; children: React.ReactNode }) {
  const [dial] = useState(() => new Dial());
  useEffect(() => dial.set(cents, min, max, disabled, onChange));
  const [pan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => !dial.disabled && dial.cents !== null && Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderGrant: () => {
        dial.moved = 0;
        dial.working = dial.cents;
      },
      onPanResponderMove: (_, g) => {
        const target = Math.trunc(g.dx / PER_STEP);
        while (dial.moved !== target) {
          const dir = target > dial.moved ? 1 : -1;
          dial.moved += dir;
          dial.step(dir);
        }
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderRelease: () => (dial.working = null),
      onPanResponderTerminate: () => (dial.working = null),
    }),
  );

  const can = !disabled && cents !== null;
  const down = can ? stepAmount(cents, -1, min, max) : null;
  const up = can ? stepAmount(cents, 1, min, max) : null;
  return (
    <View {...pan.panHandlers}>
      {children}
      {can ? (
        <View style={styles.row}>
          <Nudge sign="−" label="Lower the amount" on={down !== null} onPress={() => dial.tap(-1)} />
          <Text style={styles.hint}>Slide across the amount, or tap</Text>
          <Nudge sign="+" label="Raise the amount" on={up !== null} onPress={() => dial.tap(1)} />
        </View>
      ) : null}
    </View>
  );
}

function Nudge({ sign, label, on, onPress }: { sign: string; label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!on} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: !on }} hitSlop={4} style={({ pressed }) => [styles.nudge, !on && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
      <Text style={styles.sign}>{sign}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 10 },
  hint: { flex: 1, textAlign: "center", fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19, color: colors.lilacSoft },
  nudge: { width: touch, height: touch, borderRadius: touch / 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  sign: { fontFamily: fonts.displayBold, fontSize: 26, lineHeight: 30, color: colors.blue },
});
