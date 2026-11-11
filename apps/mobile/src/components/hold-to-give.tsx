import { useEffect, useRef, useState } from "react";
import { Animated, AppState, Easing, Pressable, StyleSheet, View, type GestureResponderEvent } from "react-native";
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
 * gift is never an accident: lifting, sliding off, a cancelled touch or the app going to the background only stop
 * it. Everyone can still give without holding: a screen reader's double tap, the keyboard's Enter, and a second quick
 * tap after the hint (a release inside the button) all give at once.
 */
export function HoldToGive({ label, busyLabel, busy, disabled, onConfirm }: { label: string; busyLabel: string; busy: boolean; disabled?: boolean; onConfirm: () => void | Promise<unknown> }) {
  const [progress] = useState(() => new Animated.Value(0));
  const [phase, setPhase] = useState<"idle" | "holding" | "done">("idle");
  const [hint, setHint] = useState(false);
  const run = useRef<Animated.CompositeAnimation | null>(null);
  const done = useRef(false);
  const mounted = useRef(true);
  const downAt = useRef(0);
  /** The press came from a keyboard (Enter or Space), not a finger: it gives at once, like a screen reader. */
  const byKey = useRef(false);
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

  const reset = () => {
    done.current = false;
    ticks.current = 0;
    setPhase("idle");
    Animated.timing(progress, { toValue: 0, duration: 160, useNativeDriver: false }).start();
  };
  const stopHolding = () => {
    run.current?.stop();
    if (!done.current) reset();
  };

  // Leaving the screen mid-hold never goes on to give: the fill stops and nothing is confirmed.
  useEffect(() => {
    const animation = run;
    return () => {
      mounted.current = false;
      animation.current?.stop();
      if (hintTimer.current) clearTimeout(hintTimer.current);
    };
  }, []);
  // The app going to the background mid-hold (a call, the home swipe) stops the hold too.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") stopHolding();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
    // When the give step finishes without starting a payment (a field to fix, no connection), the button comes
    // straight back; while a payment is under way it waits for busy to end.
    void Promise.resolve()
      .then(() => confirmNow.current())
      .catch(() => undefined)
      .finally(() => {
        if (mounted.current && !busyNow.current) reset();
      });
  };

  const pressIn = (e: GestureResponderEvent) => {
    const kind = (e?.nativeEvent as { type?: string } | undefined)?.type ?? "";
    byKey.current = kind.startsWith("key");
    downAt.current = Date.now();
    if (byKey.current || off || done.current) return;
    ticks.current = 0;
    setPhase("holding");
    haptic.soft();
    run.current?.stop();
    run.current = Animated.timing(progress, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: false });
    run.current.start(({ finished }) => finished && complete());
  };
  // Lifting the finger, sliding it off, or the phone cancelling the touch: never gives, only stops the fill.
  const pressOut = () => {
    if (byKey.current || off || done.current) return;
    stopHolding();
  };
  // Only a release inside the button arrives here. A short one is a tap: the first explains, a second gives (for
  // anyone who can't hold). A screen reader's double tap, Enter and switch control arrive with no touch just before.
  const press = () => {
    if (off || done.current) return;
    if (byKey.current) {
      byKey.current = false;
      return complete();
    }
    const sinceDown = Date.now() - downAt.current;
    if (sinceDown > 1500) return complete();
    if (sinceDown >= TAP_MS) return;
    if (hint) return complete();
    setHint(true);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(false), SECOND_TAP_MS);
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
