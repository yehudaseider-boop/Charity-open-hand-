import { router } from "expo-router";
import { Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlueHeader } from "@/components/backdrop";
import { FadeUp } from "@/components/fade-up";
import { BackIcon, InfoIcon } from "@/components/icons";
import { ReceiptSlip } from "@/components/receipt-slip";
import { ErrorState, OfflineNote, SkeletonBlock } from "@/components/states";
import { Text } from "@/components/text";
import { charities } from "@/data/sample";
import { gifts, receipts } from "@/data/giving";
import { jhbToday, rand } from "@/lib/format";
import { Button } from "@/components/button";
import { InfoButton } from "@/components/info-button";
import { useAccount } from "@/lib/account";
import { notify, openSite } from "@/lib/open-site";
import { useDirectory } from "@/lib/directory";
import { useScreenState } from "@/lib/screen-state";
import { taxYearFor, taxYearRangeLabel } from "@/lib/tax-year";
import { colors, fonts, radius, space } from "@/theme/tokens";

/** Screen 8: Receipts. Annual s18A receipts, grouped by tax year. */
export default function Receipts() {
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const preview = account.status === "preview";
  const signedIn = account.status === "signed-in";
  const demoState = useScreenState();
  const state = preview
    ? demoState
    : account.status === "loading"
      ? "loading"
      : account.loadError && !account.live
        ? "error"
        : signedIn && !account.live
          ? "loading"
          : "ready";
  const directory = useDirectory();
  const current = taxYearFor(jhbToday());
  const currentEnd = taxYearRangeLabel(current).split(" to ")[1];

  const empty = preview ? state === "empty" : !signedIn;
  const myReceipts = preview ? (empty ? [] : receipts) : (account.live?.receipts ?? []);
  const myGifts = preview ? gifts : (account.live?.gifts ?? []);
  const years = [...new Set(myReceipts.map((r) => r.taxYear))].sort((a, b) => b - a);
  // This tax year so far: the gifts that will go on next year's s18A receipts.
  const thisYear = empty ? [] : myGifts.filter((g) => g.with18a && taxYearFor(g.date) === current);
  const thisYearCents = thisYear.reduce((t, g) => t + g.cents, 0);
  const thisYearCharities = new Set(thisYear.map((g) => g.charitySlug)).size;

  // Charities in the donor's history that never issue s18A receipts.
  const no18a = empty
    ? []
    : preview
      ? [...new Set(myGifts.filter((g) => !charities.find((c) => c.slug === g.charitySlug)?.issues18a).map((g) => g.charityName))]
      : [...new Set(myGifts.filter((g) => directory.data?.charities.find((c) => c.slug === g.charitySlug)?.issues18a === false).map((g) => g.charityName))];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingBottom: 40, gap: space.block }}>
      <BlueHeader paddingTop={insets.top + 12}>
        {/* Back to wherever Receipts was opened from (Account, or the Home tile). */}
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.navigate("/account"))} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
          <BackIcon color={colors.onInk} />
        </Pressable>
        <Text style={styles.headTitle} accessibilityRole="header">Your s18A receipts</Text>
        <Text style={styles.headLine}>Ask for an s18A receipt when you give, and you get one per charity each tax year, ready for your tax return.</Text>
      </BlueHeader>
      <View style={{ paddingHorizontal: space.gutter, gap: space.block }}>

      {state === "loading" ? (
        <View style={{ gap: 16 }}>
          <SkeletonBlock height={70} />
          <SkeletonBlock height={150} />
        </View>
      ) : state === "error" ? (
        <ErrorState body="We couldn't load your receipts. Check your connection and try again." onRetry={() => (preview ? router.replace("/receipts") : account.refresh())} />
      ) : (
        <>
          {account.live?.fromCache && account.loadError ? <OfflineNote savedAt={account.live.loadedAt} /> : null}
          {/* This tax year so far: what will be on next year's receipts, and when they come. */}
          {/* Signed out (live), there is nothing of theirs to total, so no card. */}
          {preview || signedIn ? (
          <View style={styles.summary}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text style={styles.summaryKicker}>Tax year {current} so far</Text>
              <InfoButton terms={["s18a"]} />
            </View>
            <Text variant="amount" style={{ fontSize: 44, lineHeight: 50 }}>{rand(thisYearCents)}</Text>
            <Text style={styles.summaryBody}>
              {thisYearCents
                ? `Counts towards your s18A receipts from ${thisYearCharities} ${thisYearCharities === 1 ? "charity" : "charities"}. They come after ${currentEnd}, one per charity.`
                : `Nothing towards s18A receipts yet this tax year. Receipts come once a year, one per charity, after ${currentEnd}.`}
            </Text>
          </View>
          ) : null}

          {!preview && !signedIn ? (
            <View style={{ gap: 12, alignItems: "center", paddingVertical: 24 }}>
              <Text variant="h2" style={{ textAlign: "center" }}>Sign in to see your receipts</Text>
              <Button label="Sign in" onPress={() => router.push("/account")} />
            </View>
          ) : years.length === 0 ? (
            <View style={{ gap: 8, alignItems: "center", paddingVertical: 24 }}>
              <Text variant="h2" style={{ textAlign: "center" }}>No receipts yet</Text>
              <Text variant="bodyMuted" style={{ textAlign: "center" }}>
                When you give with an s18A receipt, your first one appears here after the tax year closes.
              </Text>
            </View>
          ) : (
            years.map((y, yi) => {
              const rows = myReceipts.filter((r) => r.taxYear === y);
              return (
                <FadeUp key={y} index={yi} style={{ gap: 8 }}>
                  <View style={{ gap: 2 }}>
                    <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }} accessibilityRole="header">Tax year {y}</Text>
                    <Text variant="label">{taxYearRangeLabel(y)}</Text>
                  </View>
                  <View style={{ gap: 14 }}>
                    {rows.map((r) => (
                      <ReceiptSlip
                        key={r.id}
                        receipt={r}
                        onShare={() =>
                          Share.share({ message: `s18A receipt${r.number ? ` ${r.number}` : ""} from ${r.charityName}, tax year ${y}` }).catch(() =>
                            notify("Couldn't share", "Sharing isn't available here."),
                          )
                        }
                        onDownload={() => {
                          // The PDF is handed out by the website, after it checks who is asking.
                          if (preview) return notify("Sample receipt", "In the live app this opens the receipt PDF on our website.");
                          openSite(`/receipts/${encodeURIComponent(r.id)}`);
                        }}
                      />
                    ))}
                  </View>
                </FadeUp>
              );
            })
          )}

          {/* The tax pack lives on the website (signed in there), as a page to save as a PDF or a spreadsheet. */}
          {preview || signedIn ? (
            <View style={styles.pack}>
              <Text style={{ fontFamily: fonts.bodySemibold, fontSize: 17 }}>Tax pack</Text>
              <Text variant="bodyMuted" style={{ fontSize: 16 }}>Every donation in a tax year, what goes on s18A receipts, and the totals. Opens on our website.</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
                {[current, current - 1].map((y) => (
                  <Button
                    key={y}
                    variant="secondary"
                    label={y === current ? `Tax year ${y} so far` : `Tax year ${y}`}
                    style={{ paddingHorizontal: 18 }}
                    onPress={() => (preview ? notify("Sample tax pack", "In the live app this opens your tax pack on our website.") : openSite(`/account/tax-pack/${y}`))}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {no18a.length ? (
            <View style={styles.infoRow}>
              <InfoIcon />
              <Text variant="bodyMuted" style={{ flex: 1, fontSize: 16 }}>
                {no18a.join(", ")} {no18a.length === 1 ? "doesn't" : "don't"} issue s18A receipts, so donations to {no18a.length === 1 ? "it" : "them"} won&apos;t appear here.
              </Text>
            </View>
          ) : null}
          {preview && years.length ? <Text variant="label" style={{ textAlign: "center" }}>Sample receipts for design review</Text> : null}
        </>
      )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  back: { width: 44, height: 44, marginLeft: -10, alignItems: "center", justifyContent: "center" },
  headTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.onInk },
  headLine: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23, color: colors.lilacSoft },
  summary: { gap: 6, padding: 20, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
  summaryKicker: { fontFamily: fonts.bodySemibold, fontSize: 15, color: colors.blue },
  pack: { gap: 4, padding: 20, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  summaryBody: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.ink },
  infoRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
