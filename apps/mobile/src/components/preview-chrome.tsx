import { Platform, StyleSheet, View } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { colors } from "@/theme/tokens";
import { Text } from "./text";

/**
 * Web preview only (used for review screenshots): pretends to be an iPhone so
 * safe areas and the home indicator region show as they will on a device.
 * Turned on with ?preview=iphone. Never active in the real app.
 */
const IPHONE = { top: 59, bottom: 34, left: 0, right: 0 };

export function isIphonePreview(): boolean {
  return Platform.OS === "web" && typeof window !== "undefined" && window.location.search.includes("preview=iphone");
}

export function PreviewChrome({ children }: { children: React.ReactNode }) {
  if (!isIphonePreview()) return <>{children}</>;
  return (
    <SafeAreaInsetsContext.Provider value={IPHONE}>
      {children}
      <View pointerEvents="none" style={styles.status}>
        <Text style={styles.time}>9:41</Text>
      </View>
      <View pointerEvents="none" style={styles.homeWrap}>
        <View style={styles.home} />
      </View>
    </SafeAreaInsetsContext.Provider>
  );
}

const styles = StyleSheet.create({
  status: { position: "absolute", top: 0, left: 0, right: 0, height: 54, justifyContent: "flex-end", paddingLeft: 52, paddingBottom: 10 },
  time: { fontFamily: "Assistant_600SemiBold", fontSize: 17, color: colors.ink },
  homeWrap: { position: "absolute", bottom: 8, left: 0, right: 0, alignItems: "center" },
  home: { width: 134, height: 5, borderRadius: 3, backgroundColor: colors.ink },
});
