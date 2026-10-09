import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/** Subtle vibrations: a faint tick on taps, and one fuller buzz only for a donation arriving. Silent on the web preview and if the phone doesn't support it. */
export const haptic = {
  tap() {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => undefined);
  },
  // Buttons get the same faint tick as choices: the lightest feedback the phone has.
  press() {
    if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => undefined);
  },
  success() {
    if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
};
