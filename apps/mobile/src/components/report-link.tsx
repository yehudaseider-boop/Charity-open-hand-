import { Linking, Pressable, StyleSheet } from "react-native";
import { helpLine, helpMailto } from "@/lib/help";
import { notify } from "@/lib/open-site";
import { colors, fonts } from "@/theme/tokens";
import { Text } from "./text";

/**
 * "Report this": a way to tell Givezy about something a charity posted (an update, a photo, a video) that shouldn't
 * be there (22/11/2026, Apple guideline 1.2 for content the app didn't write). It opens an email to a person at
 * Givezy with the charity and the update named, so we can look and, if needed, take it down or suspend the charity.
 */
export function ReportLink({ charityName, slug, updateId, label = "Report this" }: { charityName: string; slug: string; updateId?: string; label?: string }) {
  const report = () => {
    const what = updateId ? `an update from ${charityName}` : `${charityName}'s page`;
    const mail = helpMailto(undefined, `Report: ${what} (${slug}${updateId ? `, ${updateId}` : ""})`);
    const fallback = () => notify("Report this", `Tell us what's wrong with ${what}. ${helpLine()}`);
    if (mail) Linking.openURL(mail).catch(fallback);
    else fallback();
  };
  return (
    <Pressable onPress={report} accessibilityRole="button" accessibilityLabel={updateId ? `Report this update from ${charityName}` : `Report something on ${charityName}'s page`} hitSlop={8} style={styles.link}>
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" },
  text: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.muted, textDecorationLine: "underline" },
});
