import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { DottedArc } from "@/components/dotted-arc";
import { SettingsGroup } from "@/components/settings-group";
import { Text } from "@/components/text";
import { sampleDonor } from "@/data/giving";
import { SITE_URL, siteUrl } from "@/lib/website";
import { colors, radius, space } from "@/theme/tokens";

/** Screen 9: Account. Guest by default; ?demo=signedin shows a signed-in donor. */
export default function Account() {
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ demo?: string }>();
  const [signedIn, setSignedIn] = useState(p.demo === "signedin");

  // Legal pages live on the website (one source of truth). Apple requires a
  // privacy policy link in the app, and a way to start deleting your account.
  const open = (path: string) => () => {
    const url = siteUrl(SITE_URL, path);
    if (url) Linking.openURL(url).catch(() => undefined);
  };
  const support = [
    { label: "Help" },
    { label: "Privacy Policy", onPress: open("/privacy") },
    { label: "Terms", onPress: open("/terms") },
  ];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: space.gutter, gap: space.block }}>
      <View>
        <Text variant="h1" accessibilityRole="header">Account</Text>
        <View style={styles.arc}><DottedArc size={160} opacity={0.45} /></View>
      </View>

      {signedIn ? (
        <>
          <View style={{ gap: 2 }}>
            <Text variant="h2">{sampleDonor.name}</Text>
            <Text variant="bodyMuted">{sampleDonor.email}</Text>
          </View>
          <SettingsGroup
            title="Profile"
            cells={[
              { label: "Personal details" },
              { label: "Details for 18A receipts", value: "Complete" },
            ]}
          />
          <SettingsGroup
            title="Giving"
            cells={[
              { label: "Saved charities", value: "2" },
              { label: "Maaser target" },
              { label: "Notifications", value: "On" },
            ]}
          />
          <SettingsGroup title="App" cells={support} />
          <SettingsGroup
            title="Your information"
            cells={[
              { label: "Download my information", onPress: open("/account/data") },
              { label: "Delete my account", onPress: open("/account/data") },
            ]}
          />
          <SettingsGroup cells={[{ label: "Sign out", destructive: true, onPress: () => setSignedIn(false) }]} />
        </>
      ) : (
        <>
          <View style={styles.prompt}>
            <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>Keep your giving in one place</Text>
            <Text variant="bodyMuted">
              You can give without an account. Create a free one with your email to see past donations, track maaser, set up monthly donations and get
              your tax pack. No password needed.
            </Text>
            <Button label="Create an account" onPress={() => setSignedIn(true)} />
          </View>
          <SettingsGroup title="App" cells={support} />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment },
  arc: { position: "absolute", right: -30, top: -6 },
  prompt: { gap: 12, padding: 20, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
});
