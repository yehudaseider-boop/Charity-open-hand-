import { useGlobalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Modal, StyleSheet, View } from "react-native";
import { gifts as sampleGifts, type Gift } from "@/data/giving";
import { useAccount } from "@/lib/account";
import { ddmmyyyy, rand } from "@/lib/format";
import { givingKindLabels } from "@/lib/giving";
import { haptic } from "@/lib/haptics";
import { reduceMotion } from "@/lib/motion";
import { colors, radius, space } from "@/theme/tokens";
import { Button } from "./button";
import { CheckIcon } from "./icons";
import { Text } from "./text";

/**
 * The moment a donation arrives: a warm thank-you instead of a silent new line
 * in the history, with the charity's own note if it wrote one.
 * Preview: add ?demo=thanks to any tab.
 */
export function ThankYou() {
  const account = useAccount();
  const demo = useGlobalSearchParams<{ demo?: string }>().demo === "thanks";
  const [demoOpen, setDemoOpen] = useState(demo);
  useEffect(() => setDemoOpen(demo), [demo]);
  const demoGift: Gift = { ...sampleGifts[0], thankYou: "Your gift fills a Shabbos table this week. From all of us at Northcliff Meals Fund, thank you." };
  const list = demoOpen ? [demoGift] : account.arrived;
  const visible = list.length > 0;

  const scale = useRef(new Animated.Value(0.6)).current;
  useEffect(() => {
    if (!visible) return;
    haptic.success();
    scale.setValue(0.6);
    if (reduceMotion()) return scale.setValue(1);
    Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
  }, [visible, scale]);

  if (!visible) return null;
  const total = list.reduce((s, g) => s + g.cents, 0);
  const one = list.length === 1 ? list[0] : null;
  const close = () => (demoOpen ? setDemoOpen(false) : account.dismissArrived());

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal accessibilityLiveRegion="polite">
          <Animated.View style={[styles.badge, { transform: [{ scale }] }]}>
            <CheckIcon size={34} color={colors.onInk} />
          </Animated.View>
          <Text variant="h1" style={{ fontSize: 30, lineHeight: 36, textAlign: "center" }}>Thank you</Text>
          {one ? (
            <Text style={styles.body}>
              Your {rand(one.cents)} to {one.charityName} arrived on {ddmmyyyy(one.date)}. It counts as {givingKindLabels[one.kind].toLowerCase()}.
            </Text>
          ) : (
            <Text style={styles.body}>{list.length} donations arrived, {rand(total)} in all. They are in your giving history.</Text>
          )}
          {one?.thankYou ? (
            <View style={styles.note}>
              <Text variant="label">From {one.charityName}</Text>
              <Text style={{ fontSize: 16, lineHeight: 24, fontStyle: "italic" }}>{one.thankYou}</Text>
            </View>
          ) : null}
          <Button label="Close" onPress={close} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(27,43,58,0.45)", justifyContent: "center", padding: space.gutter },
  card: { gap: 16, padding: 24, borderRadius: radius.card, backgroundColor: colors.surface, maxWidth: 480, width: "100%", alignSelf: "center", alignItems: "stretch" },
  badge: { alignSelf: "center", width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success, alignItems: "center", justifyContent: "center" },
  body: { fontSize: 17, lineHeight: 25, textAlign: "center", color: colors.ink },
  note: { gap: 4, padding: 14, borderRadius: radius.control, backgroundColor: colors.accentSoft },
});
