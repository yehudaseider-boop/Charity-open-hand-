import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

const on = Platform.OS !== "web";

/**
 * Subtle vibrations. A faint tick on taps and steps, a firmer one when a held button completes, and one fuller buzz
 * only for a donation arriving. Silent on the web preview and if the phone doesn't support it.
 */
export const haptic = {
  tap() {
    if (on) Haptics.selectionAsync().catch(() => undefined);
  },
  // Buttons get the same faint tick as choices: the lightest feedback the phone has.
  press() {
    if (on) Haptics.selectionAsync().catch(() => undefined);
  },
  /** A soft thud: something started, like holding the Give button. */
  soft() {
    if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => undefined);
  },
  /** A firm thump: a held button reached the end. */
  firm() {
    if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  },
  success() {
    if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  },
};
