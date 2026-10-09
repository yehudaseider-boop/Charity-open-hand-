import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
} from "@expo-google-fonts/archivo";
import { Assistant_400Regular, Assistant_700Bold } from "@expo-google-fonts/assistant";
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
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
    // Archivo has no Hebrew letters: Hebrew text uses Assistant.
    Assistant_400Regular,
    Assistant_700Bold,
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
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.parchment }, animation: "slide_from_right" }}>
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
