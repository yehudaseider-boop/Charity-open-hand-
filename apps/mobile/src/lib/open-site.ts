import { Alert, Linking, Platform } from "react-native";
import { SITE_URL, siteUrl } from "./website";

/** Tell the person something, on phones and in the web preview (where Alert does nothing). */
export function notify(title: string, message: string) {
  if (Platform.OS === "web") globalThis.alert?.(`${title}\n\n${message}`);
  else Alert.alert(title, message);
}

/** Ask before doing something that can't be undone. */
export function confirmThen(title: string, message: string, okLabel: string, onOk: () => void) {
  if (Platform.OS === "web") {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onOk();
    return;
  }
  Alert.alert(title, message, [
    { text: "Keep it", style: "cancel" },
    { text: okLabel, style: "destructive", onPress: onOk },
  ]);
}

/** Open a page on our website, or say why it can't open yet. */
export function openSite(path: string) {
  const url = siteUrl(SITE_URL, path);
  if (!url) return notify("Not available yet", "This opens on the NEDIV lev website once it is live.");
  Linking.openURL(url).catch(() => notify("Couldn't open the website", "Please check your connection and try again."));
}

/** Open any https link (e.g. the donation page), or explain. */
export function openUrl(url: string | null) {
  if (!url) return notify("Not available yet", "Giving opens on the NEDIV lev website once it is live.");
  Linking.openURL(url).catch(() => notify("Couldn't open the website", "Please check your connection and try again."));
}
