import { Tabs, usePathname } from "expo-router";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Pressable, StyleSheet, Text, View, type ColorValue } from "react-native";
import { Backdrop, type BackdropVariant } from "@/components/backdrop";
import { QuickGive } from "@/components/quick-give";
import { Sheet } from "@/components/sheet";
import { ThankYou } from "@/components/thank-you";
import { haptic } from "@/lib/haptics";
import { AccountIcon, DiscoverIcon, GivingIcon, ReceiptsIcon } from "@/components/icons";
import { Splash } from "@/components/splash";
import { colors, fonts, lift, radius } from "@/theme/tokens";

/** Our own label: the default one clips this font's descenders. */
const label = (title: string) =>
  function TabLabel({ color }: { color: ColorValue }) {
    return <Text style={{ fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 20, color, marginTop: 2 }}>{title}</Text>;
  };

/** The icon sits in a soft blue pill while its tab is open. */
const icon = (Icon: (p: { color: string }) => React.ReactElement) =>
  function TabIcon({ color, focused }: { color: ColorValue; focused: boolean }) {
    return (
      <View style={[styles.pill, focused && styles.pillOn]}>
        <Icon color={String(color)} />
      </View>
    );
  };

/** The big round Give button in the middle of the tab bar: giving is the first thing on every screen. */
function GiveButton({ onPress }: { onPress: () => void }) {
  return (
    <View style={styles.giveSlot} pointerEvents="box-none">
      <Pressable
        onPress={() => {
          haptic.press();
          onPress();
        }}
        accessibilityRole="button"
        accessibilityLabel="Give"
        accessibilityHint="Choose a charity and give"
        style={({ pressed }) => [styles.giveWrap, pressed && { transform: [{ scale: 0.94 }] }]}
      >
        <View style={styles.giveCircle}>
          {/* The logo's own splash, all three shapes, on white so each colour shows. */}
          <Splash size={46} />
        </View>
        <Text style={styles.giveLabel}>Give</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  giveSlot: { flex: 1, alignItems: "center" },
  giveWrap: { alignItems: "center", marginTop: -30 },
  giveCircle: { width: 70, height: 70, borderRadius: 35, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: colors.blue, ...lift, shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 8 },
  giveLabel: { fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 20, color: colors.blue, marginTop: 0 },
  pill: { width: 56, height: 32, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  pillOn: { backgroundColor: colors.blueSoft },
});

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  // Keep the last tab's background while a pushed screen (a charity page) is on top, so it doesn't swap underneath.
  const first = usePathname().split("/")[1] || "discover";
  const tab = (["discover", "giving", "receipts", "account"] as const).find((t) => t === first);
  const [variant, setVariant] = useState<BackdropVariant>(tab ?? "discover");
  if (tab && tab !== variant) setVariant(tab);
  const [giving, setGiving] = useState(false);
  return (
    <View style={{ flex: 1 }}>
    <Backdrop variant={variant} />
    <Tabs
      screenListeners={{ tabPress: () => haptic.tap() }}
      screenOptions={{
        headerShown: false,
        // A soft cross-fade between tabs rather than a hard cut.
        animation: "fade",
        tabBarActiveTintColor: colors.blue,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopWidth: 0, borderTopLeftRadius: radius.card, borderTopRightRadius: radius.card, height: 68 + insets.bottom, paddingTop: 8, paddingBottom: insets.bottom + 4, ...lift, shadowOffset: { width: 0, height: -6 } },
        sceneStyle: { backgroundColor: "transparent" },
      }}
    >
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarLabel: label("Discover"), tabBarIcon: icon(DiscoverIcon) }} />
      <Tabs.Screen name="giving" options={{ title: "Giving", tabBarLabel: label("Giving"), tabBarIcon: icon(GivingIcon) }} />
      <Tabs.Screen name="give-now" options={{ title: "Give", tabBarButton: () => <GiveButton onPress={() => setGiving(true)} /> }} />
      <Tabs.Screen name="receipts" options={{ title: "Receipts", tabBarLabel: label("Receipts"), tabBarIcon: icon(ReceiptsIcon) }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarLabel: label("Account"), tabBarIcon: icon(AccountIcon) }} />
    </Tabs>
    <Sheet visible={giving} onClose={() => setGiving(false)}>
      <QuickGive onDone={() => setGiving(false)} />
    </Sheet>
    <ThankYou />
    </View>
  );
}
