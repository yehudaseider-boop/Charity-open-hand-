import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text, type ColorValue } from "react-native";
import { ThankYou } from "@/components/thank-you";
import { haptic } from "@/lib/haptics";
import { AccountIcon, DiscoverIcon, GivingIcon, ReceiptsIcon } from "@/components/icons";
import { colors, fonts } from "@/theme/tokens";

/** Our own label: the default one clips this font's descenders. */
const label = (title: string) =>
  function TabLabel({ color }: { color: ColorValue }) {
    return <Text style={{ fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 20, color, marginTop: 2 }}>{title}</Text>;
  };

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <>
    <Tabs
      screenListeners={{ tabPress: () => haptic.tap() }}
      screenOptions={{
        headerShown: false,
        // A soft cross-fade between tabs rather than a hard cut.
        animation: "fade",
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.hairline, height: 62 + insets.bottom, paddingTop: 6, paddingBottom: insets.bottom + 4 },
        sceneStyle: { backgroundColor: colors.parchment },
      }}
    >
      <Tabs.Screen name="discover" options={{ title: "Discover", tabBarLabel: label("Discover"), tabBarIcon: ({ color }) => <DiscoverIcon color={String(color)} /> }} />
      <Tabs.Screen name="giving" options={{ title: "Giving", tabBarLabel: label("Giving"), tabBarIcon: ({ color }) => <GivingIcon color={String(color)} /> }} />
      <Tabs.Screen name="receipts" options={{ title: "Receipts", tabBarLabel: label("Receipts"), tabBarIcon: ({ color }) => <ReceiptsIcon color={String(color)} /> }} />
      <Tabs.Screen name="account" options={{ title: "Account", tabBarLabel: label("Account"), tabBarIcon: ({ color }) => <AccountIcon color={String(color)} /> }} />
    </Tabs>
    <ThankYou />
    </>
  );
}
