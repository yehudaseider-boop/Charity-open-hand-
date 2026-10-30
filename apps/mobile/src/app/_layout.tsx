// One file per weight, never the package index: the index pulls in every weight and italic
// (about 7 MB), which made the app slow to download and open.
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
import { secureStorage } from "@/lib/secure-storage";
import { colors } from "@/theme/tokens";

SplashScreen.preventAutoHideAsync();

// A preference from an older version that no longer exists (removed 30/10/2026). It said something
// personal about the person, so it is cleared from the phone rather than left behind. Best effort.
void secureStorage.removeItem("nediv-lev.jewish-mode").catch(() => undefined);

export default function RootLayout() {
  const [loaded] = useFonts({
    // Headlines and amounts: Bricolage Grotesque, as on the website (v2.1, the app's font pass of 30/10/2026).
    // Two weights only, shipped with the app (assets/fonts, Open Font Licence) rather than another package.
    BricolageGrotesque_700Bold: require("../../assets/fonts/BricolageGrotesque-Bold.ttf"),
    BricolageGrotesque_800ExtraBold: require("../../assets/fonts/BricolageGrotesque-ExtraBold.ttf"),
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
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
