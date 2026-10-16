// One file per weight, never the package index: the index pulls in every weight and italic
// (about 7 MB), which made the app slow to download and open.
import { Fredoka_600SemiBold } from "@expo-google-fonts/fredoka/600SemiBold";
import { Fredoka_700Bold } from "@expo-google-fonts/fredoka/700Bold";
import { Heebo_400Regular } from "@expo-google-fonts/heebo/400Regular";
import { Heebo_600SemiBold } from "@expo-google-fonts/heebo/600SemiBold";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { DMSans_700Bold } from "@expo-google-fonts/dm-sans/700Bold";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { PreviewChrome } from "@/components/preview-chrome";
import { AccountProvider } from "@/lib/account";
import { SavedProvider } from "@/lib/saved";
import { colors } from "@/theme/tokens";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
    // Hebrew text (e.g. a charity's Hebrew name) is set in Heebo, beside DM Sans.
    Heebo_400Regular,
    Heebo_600SemiBold,
  });


  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  return (
    <SafeAreaProvider>
      <AccountProvider>
      <SavedProvider>
        <PreviewChrome>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.cream }, animation: "slide_from_right" }}>
            {/* The welcome hands over to the tabs with a fade, not a push: there is nothing to go back to. */}
            <Stack.Screen name="index" options={{ animation: "fade" }} />
            <Stack.Screen name="(tabs)" options={{ animation: "fade" }} />
          </Stack>
        </PreviewChrome>
      </SavedProvider>
      </AccountProvider>
    </SafeAreaProvider>
  );
}
