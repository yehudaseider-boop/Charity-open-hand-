import { useState } from "react";
import * as WebBrowser from "expo-web-browser";
import { Linking, View } from "react-native";
import { useAccount } from "@/lib/account";
import { IN_APP_GIVING, openGivingPage, refreshAfterGiving } from "@/lib/give-flow";
import { useLabelSuggestions } from "@/lib/use-labels";
import { donateUrl, SITE_URL } from "@/lib/website";
import { colors } from "@/theme/tokens";
import { Button } from "./button";
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
    <View style={{ gap: 18 }}>
      <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>Give to {charityName}</Text>
      <LabelPicker value={label} onChange={setLabel} suggestions={suggestions} />

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
        <Text variant="label" style={{ textAlign: "center" }}>
          {!SITE_URL ? "The website isn't live yet, so this button is off in the preview." : IN_APP_GIVING ? "Opens a secure payment page inside the app. You choose the amount and pay there." : "Opens in your browser. You choose the amount and pay there."}
        </Text>
        {error ? <Text accessibilityRole="alert" style={{ color: colors.danger, textAlign: "center" }}>{error}</Text> : null}
      </View>
    </View>
  );
}
