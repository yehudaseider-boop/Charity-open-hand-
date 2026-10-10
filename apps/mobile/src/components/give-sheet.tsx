import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import type { GivingKind } from "@/data/giving";
import { givingKindLabels } from "@/lib/giving";
import { haptic } from "@/lib/haptics";
import { donateUrl, SITE_URL } from "@/lib/website";
import { colors, radius, type } from "@/theme/tokens";
import { Button } from "./button";
import { InfoButton } from "./info-button";
import { Text } from "./text";

/**
 * Before leaving for the website the donor says what this donation counts as,
 * so it lands in the right place in their maaser and chomesh. No default.
 * The amount and payment are entered on the website only.
 */
export function GiveSheet({ charityName, slug, onDone }: { charityName: string; slug: string; onDone?: () => void }) {
  const [kind, setKind] = useState<GivingKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const url = kind ? donateUrl(SITE_URL, slug, kind) : null;

  return (
    <View style={{ gap: 18 }}>
      <View style={{ gap: 6 }}>
        <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>Give to {charityName}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text variant="bodyMuted" style={{ flexShrink: 1 }}>What does this donation count as? Only you see this.</Text>
          <InfoButton terms={["maaser", "chomesh", "generalTzedaka"]} label="maaser and chomesh" />
        </View>
      </View>

      <View style={{ gap: 8 }} accessibilityRole="radiogroup" accessibilityLabel="This donation counts as">
        {(Object.keys(givingKindLabels) as GivingKind[]).map((k) => {
          const selected = kind === k;
          return (
            <Pressable key={k} accessibilityRole="radio" accessibilityState={{ selected }} onPress={() => {
              haptic.tap();
              setKind(k);
            }} style={[styles.choice, selected && styles.choiceOn]}>
              <Text style={[type.button, { fontSize: 17, color: selected ? colors.accent : colors.ink }]}>{givingKindLabels[k]}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 8 }}>
        <Button
          label="Give on our website"
          disabled={!url}
          style={!url ? { opacity: 0.4 } : undefined}
          onPress={async () => {
            if (!url) return;
            try {
              await Linking.openURL(url);
              onDone?.();
            } catch {
              setError("We couldn't open your browser. Please try again.");
            }
          }}
        />
        <Text variant="label" style={{ textAlign: "center" }}>
          {kind && !SITE_URL ? "The website isn't live yet, so this button is off in the preview." : "Opens in your browser. You choose the amount and pay there."}
        </Text>
        {error ? <Text style={{ color: colors.danger, textAlign: "center" }}>{error}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  choice: { minHeight: 52, paddingHorizontal: 16, borderRadius: radius.control, borderWidth: 1, borderColor: colors.hairline, justifyContent: "center", backgroundColor: colors.surface },
  choiceOn: { borderColor: colors.accent, borderWidth: 1.5 },
});
