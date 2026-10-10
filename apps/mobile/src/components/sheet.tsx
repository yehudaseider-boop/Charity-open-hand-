import { useEffect, useRef, useState } from "react";
import { Animated, Keyboard, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { reduceMotion } from "@/lib/motion";
import { colors, radius, space } from "@/theme/tokens";

/**
 * Motion 1: a bottom sheet that rises over the whole screen (tab bar included).
 * Android's back button closes it, and it slides away before it disappears.
 */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const v = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const [keyboard, setKeyboard] = useState(0);
  // While sliding away, keep showing what was there (the screen may already have cleared it).
  const shown = useRef(children);
  if (visible) shown.current = children;

  useEffect(() => {
    if (visible) setMounted(true);
    const done = () => {
      if (!visible) setMounted(false);
    };
    if (reduceMotion()) {
      v.setValue(visible ? 1 : 0);
      done();
      return;
    }
    Animated.timing(v, { toValue: visible ? 1 : 0, duration: 260, useNativeDriver: true }).start(done);
  }, [visible, v]);

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
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: v }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" accessibilityRole="button" />
        </Animated.View>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.anchor} pointerEvents="box-none">
          <Animated.View
            accessibilityViewIsModal
            style={[
              styles.sheet,
              { paddingBottom: keyboard ? space.md : insets.bottom + space.md },
              { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [480, 0] }) }] },
            ]}
          >
            <View style={styles.grabber} />
            {/* Tall forms scroll inside the sheet instead of running off a small screen. */}
            <ScrollView style={{ maxHeight: room }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {visible ? children : shown.current}
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(27,43,58,0.35)" },
  anchor: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    paddingHorizontal: space.gutter,
    paddingTop: 10,
  },
  grabber: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.hairline, marginBottom: 18 },
});
