import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
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
 * payment page in the phone's browser, never in this sheet. With giving in the app switched on, every Give
 * button opens the app's own give screen instead (lib/give-entry.ts), so this sheet is only ever the website's way in.
 */
export function GiveSheet({ charityName, slug, onDone, initialLabel = null, campaign }: { charityName: string; slug: string; onDone?: () => void; initialLabel?: string | null; campaign?: string }) {
  const [label, setLabel] = useState<string | null>(initialLabel);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
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
          label="Give on our website"
          disabled={!url || opening}
          style={!url ? { opacity: 0.4 } : undefined}
          onPress={async () => {
            if (!url || opening) return;
            setOpening(true);
            setError(null);
            try {
              await Linking.openURL(url);
              onDone?.();
            } catch {
              setError("We couldn't open your browser. Please try again.");
            } finally {
              setOpening(false);
            }
          }}
        />
        <Text variant="label" style={styles.line}>
          {!SITE_URL ? "The website isn't live yet, so this button is off in the preview." : "Opens in your browser. You choose the amount and pay there."}
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
