import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { haptic } from "@/lib/haptics";
import { colors, radius, type } from "@/theme/tokens";
import { CheckIcon } from "./icons";
import { Text } from "./text";

/** How long the button is held, in milliseconds: long enough to mean it, short enough not to be a chore. */
export const HOLD_MS = 800;
/** A press shorter than this is a tap, which shows how to use the button instead of giving. */
const TAP_MS = 300;
/** A second quick tap this soon after the hint gives too, for anyone who can't hold a button down. */
const SECOND_TAP_MS = 3000;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const RING = 12;
const CIRC = 2 * Math.PI * RING;

/**
 * The Give button, held rather than tapped (11/11/2026): press and hold, a ring fills and the button fills with it,
 * soft ticks along the way and a firm thump at the end, and then it gives. Letting go early takes it back, so a
 * gift is never an accident. Everyone can still give without holding: a screen reader's double tap, the keyboard's
 * Enter, and a second quick tap after the hint all give at once.
 */
export function HoldToGive({ label, busyLabel, busy, disabled, onConfirm }: { label: string; busyLabel: string; busy: boolean; disabled?: boolean; onConfirm: () => void }) {
  const [progress] = useState(() => new Animated.Value(0));
  const [phase, setPhase] = useState<"idle" | "holding" | "done">("idle");
  const [hint, setHint] = useState(false);
  const run = useRef<Animated.CompositeAnimation | null>(null);
  const done = useRef(false);
  const sawIn = useRef(false);
  const downAt = useRef(0);
  const ticks = useRef(0);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyNow = useRef(busy);
  const confirmNow = useRef(onConfirm);
  useEffect(() => {
    busyNow.current = busy;
    confirmNow.current = onConfirm;
  });

  // A faint tick a third and two thirds of the way round.
  useEffect(() => {
    const id = progress.addListener(({ value }) => {
      const step = value >= 0.67 ? 2 : value >= 0.34 ? 1 : 0;
      if (step > ticks.current) {
        ticks.current = step;
        haptic.tap();
      }
    });
    return () => progress.removeListener(id);
  }, [progress]);
  // Leaving the screen mid-hold never goes on to give: the fill stops and nothing is confirmed.
  useEffect(() => {
    const animation = run;
    return () => {
      animation.current?.stop();
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);

  const reset = () => {
    done.current = false;
    ticks.current = 0;
    setPhase("idle");
    Animated.timing(progress, { toValue: 0, duration: 160, useNativeDriver: false }).start();
  };
  // Once the payment attempt ends (busy goes back to false) the button is ready again.
  useEffect(() => {
    if (!busy && done.current) reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  const off = Boolean(disabled) || busy;
  const complete = () => {
    if (done.current || off) return;
    done.current = true;
    setPhase("done");
    setHint(false);
    haptic.firm();
    confirmNow.current();
    // If nothing started (for example a field needs fixing first), the button comes back.
    setTimeout(() => !busyNow.current && reset(), 900);
  };

  const pressIn = () => {
    sawIn.current = true;
    downAt.current = Date.now();
    if (off || done.current) return;
    ticks.current = 0;
    setPhase("holding");
    haptic.soft();
    run.current?.stop();
    run.current = Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false });
    run.current.start(({ finished }) => finished && complete());
  };
  const pressOut = () => {
    if (off || done.current) return;
    run.current?.stop();
    if (Date.now() - downAt.current < TAP_MS) {
      // A tap: say how it works. A second tap soon after gives, for anyone who can't hold.
      if (hint) return void complete();
      setHint(true);
      hintTimer.current && clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setHint(false), SECOND_TAP_MS);
    }
    reset();
  };
  // Screen reader double tap, keyboard Enter or Space, and switch control arrive as a press with no touch before it.
  const press = () => {
    const touched = sawIn.current;
    sawIn.current = false;
    if (!touched) complete();
  };

  const face = off && phase !== "done" ? { bg: colors.lilacSoft, text: colors.muted, edge: colors.hairline } : { bg: colors.orange, text: colors.navy, edge: colors.navy };
  const holding = phase === "holding";
  const text = busy ? busyLabel : holding ? "Keep holding…" : phase === "done" ? busyLabel : label;
  return (
    <View style={{ gap: 6 }}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={press}
        accessibilityRole="button"
        accessibilityLabel={busy ? busyLabel : label}
        accessibilityHint="Press and hold for a moment to give. With a screen reader, double tap to give at once."
        accessibilityState={{ disabled: off, busy }}
        accessibilityActions={[{ name: "activate", label }]}
        onAccessibilityAction={() => complete()}
        style={[styles.base, { backgroundColor: face.bg, borderBottomColor: face.edge, borderBottomWidth: holding ? 2 : 5, marginTop: holding ? 3 : 0 }]}
      >
        {off && phase !== "done" ? null : <Animated.View pointerEvents="none" style={[styles.fill, { transform: [{ scaleX: busy || phase === "done" ? 1 : progress }] }]} />}
        <View style={styles.inner} pointerEvents="none">
          {off && phase !== "done" ? null : phase === "done" ? (
            <CheckIcon size={24} color={colors.navy} />
          ) : (
            <Svg width={30} height={30} viewBox="0 0 30 30" style={{ transform: [{ rotate: "-90deg" }] }}>
              <Circle cx={15} cy={15} r={RING} stroke={colors.navy} strokeOpacity={0.22} strokeWidth={3.5} fill="none" />
              <AnimatedCircle cx={15} cy={15} r={RING} stroke={colors.navy} strokeWidth={3.5} fill="none" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={progress.interpolate({ inputRange: [0, 1], outputRange: [CIRC, 0] })} />
            </Svg>
          )}
          <Text style={[type.button, { color: face.text }]}>{text}</Text>
        </View>
      </Pressable>
      {hint ? (
        <Text variant="label" style={styles.hint} accessibilityLiveRegion="polite">
          Press and hold the button to give. Or tap it twice.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 58, borderRadius: radius.control, alignItems: "center", justifyContent: "center", paddingHorizontal: 24, overflow: "hidden" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, right: 0, backgroundColor: colors.orangeEdge, transformOrigin: "left center" } as object,
  inner: { flexDirection: "row", alignItems: "center", gap: 10 },
  hint: { textAlign: "center" },
});
