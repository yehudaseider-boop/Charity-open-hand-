import { Fredoka_600SemiBold, Fredoka_700Bold } from "@expo-google-fonts/fredoka";
import { Heebo_400Regular, Heebo_600SemiBold } from "@expo-google-fonts/heebo";
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from "@expo-google-fonts/inter";
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
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    // Hebrew text (e.g. a charity's Hebrew name) is set in Heebo, beside Inter.
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
