import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Backdrop, BlueHeader } from "@/components/backdrop";
import { MessageCard } from "@/components/charity-message";
import { BackIcon } from "@/components/icons";
import { EmptyState, ErrorState, LoadingNote, SkeletonBlock } from "@/components/states";
import { useStatusCover } from "@/components/status-cover";
import { Text } from "@/components/text";
import { useAccount } from "@/lib/account";
import { unreadCount } from "@/lib/charity-messages";
import { useCharityMessages } from "@/lib/charity-messages-live";
import { jhbToday } from "@/lib/format";
import { colors, fonts, space } from "@/theme/tokens";

/**
 * Messages from your charities (24/11/2026): every thank-you a charity sent the donor, newest first, also emailed to
 * them. Opened from Home and Account. No phone notifications: they are here when the donor looks.
 */
export default function Messages() {
  const insets = useSafeAreaInsets();
  const status = useStatusCover({ onBlue: true });
  const account = useAccount();
  const { messages, failed, retry, markRead } = useCharityMessages();
  const signedOut = account.status === "signed-out";
  const today = jhbToday();
  const unread = unreadCount(messages ?? []);

  return (
    <View style={{ flex: 1 }}>
      <Backdrop variant="receipts" />
      <ScrollView style={styles.screen} onScroll={status.onScroll} scrollEventThrottle={16} contentContainerStyle={{ paddingBottom: 40, gap: space.block }}>
        <BlueHeader paddingTop={insets.top + 12}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.navigate("/home"))} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
            <BackIcon color={colors.onInk} />
          </Pressable>
          <Text style={styles.headTitle} accessibilityRole="header">Messages from your charities</Text>
          <Text style={styles.headLine}>
            {unread ? `${unread} new. ` : ""}Thank-yous from charities you gave to. You also get each one by email.
          </Text>
        </BlueHeader>
        <View style={{ paddingHorizontal: space.gutter, gap: 14 }}>
          {signedOut ? (
            <EmptyState art="mailSent" title="Sign in to see your messages" body="When a charity you gave to sends you a thank-you, it shows here and in your email." action={{ label: "Sign in", onPress: () => router.push("/account") }} />
          ) : failed ? (
            <ErrorState body="We couldn't load your messages. Check your connection and try again. Your messages are safe." onRetry={retry} />
          ) : messages === null || account.status === "loading" ? (
            <View style={{ gap: 12 }}>
              <LoadingNote />
              <SkeletonBlock height={150} />
              <SkeletonBlock height={150} />
            </View>
          ) : messages.length === 0 ? (
            <EmptyState art="mailSent" title="No messages yet" body="When a charity you gave to sends you a thank-you, it shows here as well as in your email." away={{ label: "Back to Home", onPress: () => router.navigate("/home") }} />
          ) : (
            messages.map((m) => <MessageCard key={m.id} message={m} today={today} onRead={markRead} />)
          )}
          {messages?.length ? <Text variant="label" style={{ textAlign: "center" }}>Don&apos;t want these? The stop link in the charity&apos;s email stops both.</Text> : null}
        </View>
      </ScrollView>
      {status.cover}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  back: { width: 44, height: 44, marginLeft: -10, alignItems: "center", justifyContent: "center" },
  headTitle: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 37, letterSpacing: -0.4, color: colors.onInk, paddingRight: 30 },
  headLine: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23, color: colors.lilacSoft, paddingRight: 40 },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
