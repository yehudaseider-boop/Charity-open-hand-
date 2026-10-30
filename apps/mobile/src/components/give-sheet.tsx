import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { Linking, StyleSheet, View } from "react-native";
import { useAccount } from "@/lib/account";
import { IN_APP_GIVING, openGivingPage, refreshAfterGiving } from "@/lib/give-flow";
import { useLabelSuggestions } from "@/lib/use-labels";
import { donateUrl, SITE_URL } from "@/lib/website";
import { colors, fonts, radius } from "@/theme/tokens";
import { Button } from "./button";
import { Bubbles } from "./people";
import { LabelPicker } from "./label-picker";
import { Text } from "./text";

/**
 * Before leaving for the website the donor can give the gift their own label (optional), so it
 * lands in the right place in their records. The amount and payment are entered on our website's
 * payment page, never in this sheet: in the phone's browser, or inside the app when the in-app
 * giving switch is on.
 */
export function GiveSheet({ charityName, slug, onDone, initialLabel = null, campaign }: { charityName: string; slug: string; onDone?: () => void; initialLabel?: string | null; campaign?: string }) {
  const [label, setLabel] = useState<string | null>(initialLabel);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const account = useAccount();
  const suggestions = useLabelSuggestions();
  const url = donateUrl(SITE_URL, slug, label, campaign);

  return (
    <View style={{ gap: 20 }}>
      <Text style={styles.title} accessibilityRole="header">Give to <Text style={[styles.title, styles.key]}>{charityName}</Text></Text>
      <View style={styles.soft}>
        <Bubbles items={[{ size: 90, color: colors.peach, at: { right: -34, top: -40 } }, { size: 10, color: colors.orange, float: true, at: { right: 24, top: 18 } }]} />
        <LabelPicker value={label} onChange={setLabel} suggestions={suggestions} />
      </View>

      <View style={{ gap: 8 }}>
        <Button
          label={IN_APP_GIVING ? "Continue to payment" : "Give on our website"}
          disabled={!url || opening}
          style={!url ? { opacity: 0.4 } : undefined}
          onPress={async () => {
            if (!url || opening) return;
            setOpening(true);
            setError(null);
            try {
              if (IN_APP_GIVING) {
                await openGivingPage(url, (u, returnTo) => WebBrowser.openAuthSessionAsync(u, returnTo, { preferEphemeralSession: true }));
                // Back from the payment page: look for the new gift, so the thank-you appears.
                void refreshAfterGiving(account.refresh);
              } else {
                await Linking.openURL(url);
              }
              onDone?.();
            } catch {
              setError(IN_APP_GIVING ? "We couldn't open the payment page. Please try again." : "We couldn't open your browser. Please try again.");
            } finally {
              setOpening(false);
            }
          }}
        />
        <Text variant="label" style={styles.line}>
          {!SITE_URL ? "The website isn't live yet, so this button is off in the preview." : IN_APP_GIVING ? "Opens a secure payment page inside the app. You choose the amount and pay there." : "Opens in your browser. You choose the amount and pay there."}
        </Text>
        {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, textAlign: "center" }}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, color: colors.navy },
  key: { color: colors.blue },
  soft: { padding: 18, borderRadius: radius.card, backgroundColor: colors.lilacSoft, overflow: "hidden" },
  line: { textAlign: "center", lineHeight: 20 },
});
