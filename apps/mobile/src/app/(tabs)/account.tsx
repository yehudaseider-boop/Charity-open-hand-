import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { initials } from "@shared/charity/initials";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { InsightsLink } from "@/components/insights-link";
import { useStatusCover } from "@/components/status-cover";
import { Button } from "@/components/button";
import { ChevronIcon, GivingIcon, ReceiptsIcon } from "@/components/icons";
import { Bubbles, People } from "@/components/people";
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
import { confirmThen, notify, openSite } from "@/lib/open-site";
import { helpLine, helpMailto } from "@/lib/help";
import { TEST_BUILD } from "@/lib/test-build";
import { colors, fonts, radius, space } from "@/theme/tokens";

/**
 * Screen 9: Account. Live: email-code sign-in, then agreement, then the
 * account. Preview (no live database yet): the sample account, ?demo=signedin.
 */

/** Asks first, then resets this phone's first-open choices and shows the welcome again. */
function confirmStartAgain() {
  confirmThen(
    "Start again as a new donor?",
    "For testing. This phone forgets its first-open answers (kind of giver, causes) and the goal invitation, then shows the welcome again. Your goals, gifts and account are not touched. To get the goal invitation after a gift, be signed out and have no goal.",
    "Start again",
    () => void startAgainAsNewDonor().then(() => router.replace("/")),
    "Cancel",
  );
}

export default function Account() {
  const insets = useSafeAreaInsets();
  const status = useStatusCover();
  const { width } = useWindowDimensions();
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
      <Text style={styles.groupTitle}>Preferences</Text>
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
        {/* The For charities page's look (30/10/2026): a soft card, the key words in blue, and dots and rings
            drifting round it. Signed out, people giving; signed in, the donor's own initial. */}
        <View style={[styles.gutter, { paddingTop: insets.top + 12 }]}>
          <View style={styles.hero}>
            <Bubbles
              items={
                signedIn
                  ? [
                      { size: 150, color: colors.peach, at: { right: -56, top: -64 } },
                      { size: 12, color: colors.orange, float: true, at: { right: 26, top: 18 } },
                    ]
                  : [
                      { size: 170, color: colors.peach, at: { right: -60, top: -60 } },
                      { size: 14, color: colors.orange, float: true, at: { right: 36, top: 26 } },
                      { size: 28, color: colors.blue, ring: true, float: true, at: { right: 30, bottom: 60 } },
                      { size: 10, color: colors.blue, float: true, at: { left: 30, bottom: 40 } },
                    ]
              }
            />
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
                <View style={{ gap: 8 }}>
                  <Text style={styles.headTitle} accessibilityRole="header">
                    {account.status === "agreeing" ? (
                      <>Nearly <Text style={[styles.headTitle, styles.key]}>there</Text>.</>
                    ) : (
                      <>Let&apos;s get you <Text style={[styles.headTitle, styles.key]}>set up</Text>.</>
                    )}
                  </Text>
                  <Text style={styles.headLine}>All your giving and s18A receipts, kept in one place. No password needed.</Text>
                </View>
                <People name="loveIt" width={Math.min(150, width - space.gutter * 2 - 60)} style={styles.heroArt} />
              </>
            )}
          </View>
        </View>
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
              <Tile label="Receipts" icon={<ReceiptsIcon color={colors.blue} size={26} />} tint={colors.peach} onPress={() => router.push("/receipts")} />
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
                <Bubbles
                  items={[
                    { size: 96, color: colors.lilac, ring: true, at: { right: -34, bottom: -38 } },
                    { size: 14, color: colors.orange, float: true, at: { right: 26, top: 22 } },
                  ]}
                />
                <Text style={styles.promptTitle}>Keep your giving in one place</Text>
                <Text style={styles.promptBody}>
                  Sign in with your email to see every donation and keep track of your giving goal. No password needed.
                </Text>
                <Button variant="white" label="Show a sample account" onPress={() => setDemoSignedIn(true)} style={{ marginTop: 4 }} />
                <Text style={styles.promptNote}>Preview: real sign-in switches on once the live service is connected.</Text>
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
      <View style={styles.tileRing} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />
      <View style={styles.tileIcon}>{icon}</View>
      <View style={styles.tileFoot}>
        <Text style={styles.tileLabel}>{label}</Text>
        <ChevronIcon color={colors.blue} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gutter: { paddingHorizontal: space.gutter },
  hero: { backgroundColor: colors.lilacSoft, borderRadius: radius.card, paddingTop: 24, paddingHorizontal: 22, paddingBottom: 22, overflow: "hidden", gap: 12 },
  heroArt: { alignSelf: "center", marginTop: 4, marginBottom: -22 },
  key: { color: colors.blue },
  groupTitle: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24, color: colors.navy, paddingHorizontal: 4 },
  prefs: { paddingHorizontal: 16, paddingVertical: 6, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface },
  profile: { flexDirection: "row", alignItems: "center", gap: 16, paddingRight: 30 },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: colors.blue, borderWidth: 4, borderColor: colors.surface, alignItems: "center", justifyContent: "center" },
  avatarText: { fontFamily: fonts.displayBold, fontSize: 26, color: colors.onInk },
  headTitle: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 37, letterSpacing: -0.4, color: colors.navy },
  headLine: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23, color: colors.muted },
  tiles: { flexDirection: "row", gap: 12 },
  tile: { flex: 1, minHeight: 132, borderRadius: radius.card, padding: 16, justifyContent: "space-between", gap: 14, overflow: "hidden" },
  tileRing: { position: "absolute", right: -22, top: -22, width: 70, height: 70, borderRadius: 35, borderWidth: 8, borderColor: colors.surface, opacity: 0.8 },
  tileIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  tileFoot: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 6 },
  tileLabel: { flex: 1, fontFamily: fonts.display, fontSize: 18, lineHeight: 23, color: colors.navy },
  screen: { flex: 1, backgroundColor: "transparent" },
  prompt: { gap: 10, padding: 22, borderRadius: radius.card, backgroundColor: colors.blue, overflow: "hidden" },
  promptTitle: { fontFamily: fonts.display, fontSize: 22, lineHeight: 27, color: colors.onInk, paddingRight: 24 },
  promptBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.lilacSoft },
  promptNote: { fontFamily: fonts.bodySemibold, fontSize: 14, lineHeight: 20, color: colors.lilacSoft, paddingRight: 44 },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
