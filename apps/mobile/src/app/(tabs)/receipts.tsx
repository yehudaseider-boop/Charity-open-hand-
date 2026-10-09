import { router } from "expo-router";
import { Linking, Pressable, ScrollView, Share, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DottedArc } from "@/components/dotted-arc";
import { FadeUp } from "@/components/fade-up";
import { DownloadIcon, InfoIcon, ShareIcon } from "@/components/icons";
import { ErrorState, SkeletonBlock } from "@/components/states";
import { Text } from "@/components/text";
import { charities } from "@/data/sample";
import { gifts, receipts } from "@/data/giving";
import { ddmmyyyy, rand } from "@/lib/format";
import { Button } from "@/components/button";
import { useAccount } from "@/lib/account";
import { SITE_URL, siteUrl } from "@/lib/website";
import { useScreenState } from "@/lib/screen-state";
import { taxYearFor, taxYearRangeLabel } from "@/lib/tax-year";
import { colors, radius, space, touch } from "@/theme/tokens";

/** Screen 8: Receipts. Annual 18A receipts, grouped by tax year. */
export default function Receipts() {
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const preview = account.status === "preview";
  const signedIn = account.status === "signed-in";
  const demoState = useScreenState();
  const state = preview ? demoState : signedIn && !account.live ? "loading" : account.loadError && !account.live ? "error" : "ready";
  const current = taxYearFor(new Date());
  const currentEnd = taxYearRangeLabel(current).split(" to ")[1];

  const empty = preview ? state === "empty" : !signedIn;
  const myReceipts = preview ? (empty ? [] : receipts) : (account.live?.receipts ?? []);
  const myGifts = preview ? gifts : (account.live?.gifts ?? []);
  const years = [...new Set(myReceipts.map((r) => r.taxYear))].sort((a, b) => b - a);

  // Charities in the donor's history that never issue 18A receipts.
  const no18a = empty
    ? []
    : preview
      ? [...new Set(myGifts.filter((g) => !charities.find((c) => c.slug === g.charitySlug)?.issues18a).map((g) => g.charityName))]
      : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 40, paddingHorizontal: space.gutter, gap: space.block }}>
      <View>
        <Text variant="h1" accessibilityRole="header">Receipts</Text>
        <View style={styles.arc}><DottedArc size={160} opacity={0.45} /></View>
      </View>

      {state === "loading" ? (
        <View style={{ gap: 16 }}>
          <SkeletonBlock height={70} />
          <SkeletonBlock height={150} />
        </View>
      ) : state === "error" ? (
        <ErrorState body="We couldn't load your receipts. Check your connection and try again." onRetry={() => (preview ? router.replace("/receipts") : account.refresh())} />
      ) : (
        <>
          <View style={styles.notice}>
            <Text style={{ fontSize: 17, fontFamily: "Archivo_600SemiBold" }}>Receipts arrive once a year</Text>
            <Text variant="bodyMuted" style={{ fontSize: 16 }}>
              You get one 18A receipt per charity, covering all your donations to it in a tax year (1 March to the end of February). Receipts for this tax year
              come after {currentEnd}.
            </Text>
          </View>

          {!preview && !signedIn ? (
            <View style={{ gap: 12, alignItems: "center", paddingVertical: 24 }}>
              <Text variant="h2" style={{ textAlign: "center" }}>Sign in to see your receipts</Text>
              <Button label="Sign in" onPress={() => router.push("/account")} />
            </View>
          ) : years.length === 0 ? (
            <View style={{ gap: 8, alignItems: "center", paddingVertical: 24 }}>
              <Text variant="h2" style={{ textAlign: "center" }}>No receipts yet</Text>
              <Text variant="bodyMuted" style={{ textAlign: "center" }}>
                When you give with an 18A receipt, your first one appears here after the tax year closes.
              </Text>
            </View>
          ) : (
            years.map((y, yi) => {
              const rows = myReceipts.filter((r) => r.taxYear === y);
              return (
                <FadeUp key={y} index={yi} style={{ gap: 8 }}>
                  <View style={{ gap: 2 }}>
                    <Text variant="h2" style={{ fontSize: 22, lineHeight: 28 }}>Tax year {y}</Text>
                    <Text variant="label">{taxYearRangeLabel(y)}</Text>
                  </View>
                  <View style={styles.list}>
                    {rows.map((r, i) => (
                      <View key={r.id} style={[styles.row, i > 0 && styles.divider]}>
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={{ fontSize: 17 }}>{r.charityName}</Text>
                          <Text variant="bodyMuted" style={{ fontSize: 16 }}>{rand(r.cents)} · issued {ddmmyyyy(r.issued)}</Text>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Share receipt from ${r.charityName}`}
                          onPress={() => Share.share({ message: `18A receipt ${r.number} from ${r.charityName}, tax year ${y}` })}
                          style={styles.iconBtn}
                        >
                          <ShareIcon />
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Download receipt from ${r.charityName}`}
                          onPress={() => {
                            // The PDF is handed out by the website, after it checks who is asking.
                            const url = preview ? null : siteUrl(SITE_URL, `/receipts/${r.id}`);
                            if (url) Linking.openURL(url).catch(() => undefined);
                          }}
                          style={styles.iconBtn}
                        >
                          <DownloadIcon />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                </FadeUp>
              );
            })
          )}

          {no18a.length ? (
            <View style={styles.infoRow}>
              <InfoIcon />
              <Text variant="bodyMuted" style={{ flex: 1, fontSize: 16 }}>
                {no18a.join(", ")} {no18a.length === 1 ? "doesn't" : "don't"} issue 18A receipts, so donations to {no18a.length === 1 ? "it" : "them"} won&apos;t appear here.
              </Text>
            </View>
          ) : null}
          {preview && years.length ? <Text variant="label" style={{ textAlign: "center" }}>Sample receipts for design review</Text> : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.parchment },
  arc: { position: "absolute", right: -30, top: -6 },
  notice: { gap: 4, paddingBottom: space.block - 4, borderBottomWidth: 1, borderBottomColor: colors.hairline },
  list: { borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 16, paddingRight: 6, paddingVertical: 10, minHeight: touch + 12 },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  iconBtn: { width: touch, height: touch, alignItems: "center", justifyContent: "center" },
  infoRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
});
