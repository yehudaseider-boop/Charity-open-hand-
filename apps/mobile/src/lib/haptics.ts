import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/** Gentle vibrations for key moments. Silent on the web preview and if the phone doesn't support it. */
export const haptic = {
  tap() {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => undefined);
  },
  press() {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  },
  success() {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
};
