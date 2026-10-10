import { AccessibilityInfo } from "react-native";

/** Whether the phone asks for less motion. Read once at start and kept up to date; animations skip straight to the end when it's on. */
let reduce = false;
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => (reduce = v))
  .catch(() => undefined);
AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => (reduce = v));

export const reduceMotion = () => reduce;
