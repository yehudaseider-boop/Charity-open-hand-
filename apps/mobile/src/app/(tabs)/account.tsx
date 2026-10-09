import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { DottedArc } from "@/components/dotted-arc";
import { SettingsGroup } from "@/components/settings-group";
import { Agree, SignIn } from "@/components/sign-in";
import { SkeletonBlock } from "@/components/states";
import { Text } from "@/components/text";
import { sampleDonor } from "@/data/giving";
import { useAccount } from "@/lib/account";
import { openSite } from "@/lib/open-site";
import { colors, radius, space } from "@/theme/tokens";

/**
 * Screen 9: Account. Live: email-code sign-in, then agreement, then the
 * account. Preview (no live database yet): the sample account, ?demo=signedin.
 */
export default function Account() {
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ demo?: string }>();
  const account = useAccount();
  const [demoSignedIn, setDemoSignedIn] = useState(p.demo === "signedin");
  const preview = account.status === "preview";
  const signedIn = preview ? demoSignedIn : account.status === "signed-in";

  // Legal pages live on the website (one source of truth). Apple requires a
  // privacy policy link in the app, and a way to start deleting your account.
  const open = (path: string) => () => openSite(path);
  const support = [
    { label: "How NEDIV lev works", onPress: () => router.push("/how-it-works") },
    { label: "Privacy Policy", onPress: open("/privacy") },
    { label: "Terms", onPress: open("/terms") },
  ];

  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: space.gutter, gap: space.block }}>
      <View>
        <Text variant="h1" accessibilityRole="header">Account</Text>
        <View style={styles.arc}><DottedArc size={160} opacity={0.45} /></View>
      </View>

      {account.status === "loading" ? (
        <SkeletonBlock height={180} />
      ) : account.status === "agreeing" ? (
        <Agree />
      ) : signedIn ? (
        <>
          <View style={{ gap: 2 }}>
            {preview ? <Text variant="h2">{sampleDonor.name}</Text> : null}
            <Text variant="bodyMuted">{preview ? sampleDonor.email : account.email}</Text>
          </View>
          <SettingsGroup
            title="Giving"
            cells={[
              { label: "Your giving and maaser", onPress: () => router.push("/giving") },
              { label: "Receipts", onPress: () => router.push("/receipts") },
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
          <SettingsGroup
            cells={[{ label: "Sign out", destructive: true, onPress: () => (preview ? setDemoSignedIn(false) : account.signOut()) }]}
          />
        </>
      ) : (
        <>
          {preview ? (
            <View style={styles.prompt}>
              <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>Keep your giving in one place</Text>
              <Text variant="bodyMuted">
                Sign in with your email to see every donation and keep track of maaser and chomesh. No password needed.
              </Text>
              <Button label="Show a sample account" onPress={() => setDemoSignedIn(true)} />
              <Text variant="label">Preview: real sign-in switches on once the live service is connected.</Text>
            </View>
          ) : (
            <SignIn />
          )}
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
