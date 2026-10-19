import { useEffect, useState } from "react";
import { Animated, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { reduceMotion } from "@/lib/motion";
import { colors, radius, space } from "@/theme/tokens";
import { TextLink } from "./button";
import { Text } from "./text";

/** Why a sheet shouldn't just close: a save is in flight, or the person has typed something. */
export type SheetGuard = "busy" | "typed" | null;

/** What the swipe handlers need to know, updated outside of render. */
class Live {
  scrollY = 0;
  guard: SheetGuard = null;
  constructor(
    public onClose: () => void,
    public onAsk: () => void,
  ) {}
  setScroll(y: number) {
    this.scrollY = y;
  }
  setOnClose(fn: () => void, guard: SheetGuard, ask: () => void) {
    this.onClose = fn;
    this.guard = guard;
    this.onAsk = ask;
  }
  /** A swipe, a tap outside or the back button: close, unless that would lose a save or what was typed. */
  requestClose(): boolean {
    if (this.guard === "busy") return false;
    if (this.guard === "typed") {
      this.onAsk();
      return false;
    }
    this.onClose();
    return true;
  }
}

/**
 * Motion 1: a bottom sheet that rises over the whole screen (tab bar included).
 * Android's back button closes it, and it slides away before it disappears.
 * Swipe down to close: from the handle area at the top (a big target, not just the
 * little bar), or from anywhere on the sheet once its list is scrolled to the top.
 * `guard`: while a save is in flight the sheet stays open; once something is typed, it asks first.
 */
export function Sheet({ visible, onClose, guard = null, children }: { visible: boolean; onClose: () => void; guard?: SheetGuard; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [v] = useState(() => new Animated.Value(0));
  const [mounted, setMounted] = useState(visible);
  const [keyboard, setKeyboard] = useState(0);
  const [drag] = useState(() => new Animated.Value(0));
  // Plain mutable holder read by the gesture handlers (kept out of render).
  const [asking, setAsking] = useState(false);
  const [live] = useState(() => new Live(onClose, () => setAsking(true)));
  useEffect(() => {
    live.setOnClose(onClose, guard, () => setAsking(true));
  }, [onClose, guard, live]);
  // While sliding away, keep showing what was there (the screen may already have cleared it).
  const [shown, setShown] = useState(children);
  if (visible && !mounted) {
    setMounted(true);
    setAsking(false);
  }
  if (asking && guard !== "typed") setAsking(false);
  if (visible && shown !== children) setShown(children);

  useEffect(() => {
    // Reduced motion: no slide, but the same sequence (the sheet is removed once it has "finished").
    Animated.timing(v, { toValue: visible ? 1 : 0, duration: reduceMotion() ? 0 : 260, useNativeDriver: true }).start(() => {
      if (!visible) setMounted(false);
    });
  }, [visible, v]);

  useEffect(() => {
    if (!visible) return;
    drag.setValue(0);
    // A new sheet starts at the top of its list, so a swipe from the body works straight away.
    live.setScroll(0);
  }, [visible, drag, live]);

  const springBack = () => Animated.spring(drag, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
  const settle = (dy: number, vy: number) => {
    if ((dy > 90 || vy > 0.7) && live.requestClose()) return;
    springBack();
  };
  const tryClose = () => {
    live.requestClose();
  };
  const move = (_: unknown, g: { dy: number }) => drag.setValue(Math.max(0, g.dy));
  const end = (_: unknown, g: { dy: number; vy: number }) => settle(g.dy, g.vy);
  // The handle area always drags down.
  const [handlePan] = useState(() =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => Keyboard.dismiss(),
      onPanResponderMove: move,
      onPanResponderRelease: end,
      onPanResponderTerminate: () => settle(0, 0),
    }),
  );
  // The body drags down only when the list is at the top and the move is mostly vertical.
  const [bodyPan] = useState(() =>
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => live.scrollY <= 0 && g.dy > 10 && g.dy > Math.abs(g.dx) * 1.5,
      onPanResponderGrant: () => Keyboard.dismiss(),
      onPanResponderMove: move,
      onPanResponderRelease: end,
      onPanResponderTerminate: () => settle(0, 0),
    }),
  );

  // The sheet's own scroll area shrinks when the keyboard is up, so the top stays on screen.
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (e) => setKeyboard(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setKeyboard(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (!mounted) return null;
  const room = Math.max(200, Math.min(height * 0.75, height - keyboard - insets.top - 80));
  return (
    <Modal transparent visible animationType="none" onRequestClose={tryClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: v }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={tryClose} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.anchor} pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              { paddingBottom: keyboard ? space.md : insets.bottom + space.md },
              { transform: [{ translateY: Animated.add(v.interpolate({ inputRange: [0, 1], outputRange: [480, 0] }), drag) }] },
            ]}
            {...bodyPan.panHandlers}
          >
            <View {...handlePan.panHandlers} style={styles.handleZone} accessible accessibilityRole="adjustable" accessibilityLabel="Swipe down to close" accessibilityActions={[{ name: "dismiss", label: "Close" }]} onAccessibilityAction={tryClose}>
              <View style={styles.grabber} />
            </View>
            {asking ? (
              <View style={styles.ask} accessibilityLiveRegion="polite">
                <Text style={styles.askText}>Close and lose what you typed?</Text>
                <View style={styles.askRow}>
                  <TextLink label="Keep editing" onPress={() => setAsking(false)} />
                  <TextLink label="Close" onPress={onClose} />
                </View>
              </View>
            ) : null}
            {/* Tall forms scroll inside the sheet instead of running off a small screen. */}
            <ScrollView style={{ maxHeight: room }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} scrollEventThrottle={16} onScroll={(e) => { live.setScroll(e.nativeEvent.contentOffset.y); }}>
              {visible ? children : shown}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.scrimSoft },
  anchor: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: space.gutter,
    paddingTop: 0,
  },
  // A tall, full-width strip so the swipe is easy to start with a thumb.
  handleZone: { height: 44, marginHorizontal: -space.gutter, alignItems: "center", justifyContent: "center" },
  grabber: { width: 48, height: 5, borderRadius: 3, backgroundColor: colors.lilac },
  ask: { backgroundColor: colors.blueSoft, borderRadius: radius.control, padding: space.md, gap: 8, marginBottom: space.md },
  askText: { color: colors.ink },
  askRow: { flexDirection: "row", justifyContent: "space-between" },
});
