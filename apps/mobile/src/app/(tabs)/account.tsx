import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { initials } from "@shared/charity/initials";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button } from "@/components/button";
import { GivingIcon, ReceiptsIcon } from "@/components/icons";
import { Splash } from "@/components/splash";
import { HeaderCurve } from "@/components/backdrop";
import { SettingsGroup } from "@/components/settings-group";
import { Agree, SignIn } from "@/components/sign-in";
import { SkeletonBlock } from "@/components/states";
import { Text } from "@/components/text";
import { sampleDonor } from "@/data/giving";
import { useAccount } from "@/lib/account";
import { openSite } from "@/lib/open-site";
import { colors, fonts, radius, space } from "@/theme/tokens";

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
    { label: "How Givezy works", onPress: () => router.push("/how-it-works") },
    { label: "Privacy Policy", onPress: open("/privacy") },
    { label: "Terms", onPress: open("/terms") },
  ];

  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: space.gutter, gap: space.block }}>
        <HeaderCurve depth={insets.top + 112} />
      <View>
        <Text variant="h1" accessibilityRole="header">Account</Text>
        <View style={styles.arc}><Splash size={84} /></View>
      </View>
      {/* Room for the header curve. */}
      <View style={{ height: 20 }} />

      {account.status === "loading" ? (
        <SkeletonBlock height={180} />
      ) : account.status === "agreeing" ? (
        <Agree />
      ) : signedIn ? (
        <>
          {/* Who is signed in: initials in a lilac circle, then name and email. */}
          <View style={styles.profile}>
            <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Text style={styles.avatarText}>{preview ? initials(sampleDonor.name) : (account.email ?? "?").slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              {preview ? <Text style={styles.name} numberOfLines={1}>{sampleDonor.name}</Text> : null}
              <Text variant="bodyMuted" numberOfLines={1}>{preview ? sampleDonor.email : account.email}</Text>
            </View>
          </View>

          {/* The two places people come back to, as big tiles rather than list rows. */}
          <View style={styles.tiles}>
            <Tile label="Giving and maaser" icon={<GivingIcon color={colors.blue} size={26} />} tint={colors.lilacSoft} onPress={() => router.push("/giving")} />
            <Tile label="Receipts" icon={<ReceiptsIcon color={colors.blue} size={26} />} tint={colors.blueSoft} onPress={() => router.push("/receipts")} />
          </View>

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

/** A big square shortcut: icon in a white circle, label underneath. */
function Tile({ label, icon, tint, onPress }: { label: string; icon: React.ReactNode; tint: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.tile, { backgroundColor: tint }, pressed && { opacity: 0.8 }]}>
      <View style={styles.tileIcon}>{icon}</View>
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.lilac, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.display, fontSize: 26, color: colors.blue },
  name: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, color: colors.blue },
  tiles: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, minHeight: 124, borderRadius: radius.card, padding: 16, justifyContent: "space-between", gap: 12 },
  tileIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  tileLabel: { fontFamily: fonts.bodySemibold, fontSize: 17, lineHeight: 22, color: colors.ink },
  screen: { flex: 1, backgroundColor: "transparent" },
  arc: { position: "absolute", right: space.gutter - 2, top: -10, zIndex: 2 },
  prompt: { gap: 12, padding: 20, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
