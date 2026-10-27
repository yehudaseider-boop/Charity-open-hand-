import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { initials } from "@shared/charity/initials";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InsightsLink } from "@/components/insights-link";
import { useStatusCover } from "@/components/status-cover";
import { Button } from "@/components/button";
import { GivingIcon, ReceiptsIcon } from "@/components/icons";
import { BlueHeader } from "@/components/backdrop";
import { SettingsGroup } from "@/components/settings-group";
import { Agree, SignIn } from "@/components/sign-in";
import { SkeletonBlock } from "@/components/states";
import { Text } from "@/components/text";
import { sampleDonor } from "@/data/giving";
import { useAccount } from "@/lib/account";
import { startAgainAsNewDonor } from "@/lib/first-run";
import { setJewishMode, useJewishMode } from "@/lib/jewish-mode";
import { SavedCardRow } from "@/components/saved-card-row";
import { SwitchRow } from "@/components/switch-row";
import { notify, openSite } from "@/lib/open-site";
import { helpLine, helpMailto } from "@/lib/help";
import { TEST_BUILD } from "@/lib/test-build";
import { colors, fonts, radius, space } from "@/theme/tokens";

/**
 * Screen 9: Account. Live: email-code sign-in, then agreement, then the
 * account. Preview (no live database yet): the sample account, ?demo=signedin.
 */

/** Asks first, then resets this phone's first-open choices and shows the welcome again. */
function confirmStartAgain() {
  Alert.alert(
    "Start again as a new donor?",
    "For testing. This phone forgets its first-open answers (kind of giver, causes) and the goal invitation, then shows the welcome again. Your goals, gifts and account are not touched. To get the goal invitation after a gift, be signed out and have no goal.",
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Start again",
        onPress: () => {
          void startAgainAsNewDonor().then(() => router.replace("/"));
        },
      },
    ],
  );
}

export default function Account() {
  const insets = useSafeAreaInsets();
  const status = useStatusCover();
  const p = useLocalSearchParams<{ demo?: string }>();
  const account = useAccount();
  const [demoSignedIn, setDemoSignedIn] = useState(p.demo === "signedin");
  const preview = account.status === "preview";
  const signedIn = preview ? account.demo || demoSignedIn : account.status === "signed-in";

  // Legal pages live on the website (one source of truth). Apple requires a
  // privacy policy link in the app, and a way to start deleting your account.
  const open = (path: string) => () => openSite(path);
  const jewish = useJewishMode();
  // Available signed in or not: it lives on this phone only.
  const preferences = (
    <View style={{ gap: 8 }}>
      <Text variant="label" style={{ paddingHorizontal: 4 }}>Preferences</Text>
      <View style={styles.prefs}>
        <SwitchRow
          label="Jewish calendar and maaser"
          description="The Hebrew date, Shabbos and Yom Tov touches, and maaser and chomesh in your giving. Saved on this phone only."
          value={jewish}
          onChange={setJewishMode}
        />
      </View>
    </View>
  );
  // A person to talk to: the support email once there is one, else reply to any email from us.
  const getHelp = () => {
    const mail = helpMailto();
    if (mail) Linking.openURL(mail).catch(() => notify("Get help", helpLine()));
    else notify("Get help", helpLine());
  };
  const support = [
    { label: "Get help", onPress: getHelp },
    { label: "How Givezy works", onPress: () => router.push("/how-it-works") },
    { label: "Privacy Policy", onPress: open("/privacy") },
    { label: "Terms", onPress: open("/terms") },
    // Test builds only: see the new-donor first open again.
    ...(TEST_BUILD ? [{ label: "Start again as a new donor (testing)", onPress: confirmStartAgain }] : []),
  ];

  return (
    <>
      <ScrollView style={styles.screen} onScroll={status.onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 40, gap: space.block }}>
        <BlueHeader paddingTop={insets.top + 20}>
          {signedIn ? (
            <View style={styles.profile}>
              <View style={styles.avatar} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                <Text style={styles.avatarText}>{preview ? initials(sampleDonor.name) : (account.email ?? "?").slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.headTitle} accessibilityRole="header" numberOfLines={1}>{preview ? sampleDonor.name : "Your account"}</Text>
                <Text style={styles.headLine} numberOfLines={1}>{preview ? sampleDonor.email : account.email}</Text>
              </View>
            </View>
          ) : (
            <>
              <Text style={styles.headTitle} accessibilityRole="header">{account.status === "agreeing" ? "Nearly there." : "Let's get you set up."}</Text>
              <Text style={styles.headLine}>All your giving and s18A receipts, kept in one place. No password needed.</Text>
            </>
          )}
        </BlueHeader>
        <View style={{ paddingHorizontal: space.gutter, gap: space.block }}>
        {account.status === "loading" ? (
          <SkeletonBlock height={180} />
        ) : account.status === "agreeing" ? (
          <Agree />
        ) : signedIn ? (
          <>
            {/* The two places people come back to, as big tiles rather than list rows. */}
            <View style={styles.tiles}>
              <Tile label={jewish ? "Progress and maaser" : "Your progress"} icon={<GivingIcon color={colors.blue} size={26} />} tint={colors.lilacSoft} onPress={() => router.push("/giving")} />
              <Tile label="Receipts" icon={<ReceiptsIcon color={colors.blue} size={26} />} tint={colors.blueSoft} onPress={() => router.push("/receipts")} />
            </View>
            <InsightsLink />
            {account.demo ? (
              <Text variant="label" style={{ textAlign: "center" }}>Demo account. Sample data only: nothing here is real and no payment is taken.</Text>
            ) : null}

            <SavedCardRow />
            {preferences}
            <SettingsGroup title="App" cells={support} />
            <SettingsGroup
              title="Your information"
              cells={[
                { label: "Download my information", onPress: open("/account/data") },
                { label: "Delete my account", onPress: open("/account/data") },
              ]}
            />
            <SettingsGroup
              cells={[{ label: "Sign out", destructive: true, onPress: () => (account.demo ? account.exitDemo() : preview ? setDemoSignedIn(false) : account.signOut()) }]}
            />
          </>
        ) : (
          <>
            {preview ? (
              <View style={styles.prompt}>
                <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>Keep your giving in one place</Text>
                <Text variant="bodyMuted">
                  Sign in with your email to see every donation and keep track of your giving goal. No password needed.
                </Text>
                <Button label="Show a sample account" onPress={() => setDemoSignedIn(true)} />
                <Text variant="label">Preview: real sign-in switches on once the live service is connected.</Text>
              </View>
            ) : (
              <SignIn />
            )}
            {preferences}
            <SettingsGroup title="App" cells={support} />
          </>
        )}
        </View>
      </ScrollView>
      {status.cover}
    </>
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
  prefs: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface },
  profile: { flexDirection: "row", alignItems: "center", gap: 16 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.display, fontSize: 26, color: colors.blue },
  headTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.onInk },
  headLine: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23, color: colors.lilacSoft },
  tiles: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, minHeight: 124, borderRadius: radius.card, padding: 16, justifyContent: "space-between", gap: 12 },
  tileIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  tileLabel: { fontFamily: fonts.bodySemibold, fontSize: 17, lineHeight: 22, color: colors.ink },
  screen: { flex: 1, backgroundColor: "transparent" },
  prompt: { gap: 12, padding: 20, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
