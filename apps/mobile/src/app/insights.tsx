import { router } from "expo-router";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle } from "react-native-svg";
import { Backdrop, BlueHeader } from "@/components/backdrop";
import { BackIcon } from "@/components/icons";
import { Segmented } from "@/components/segmented";
import { EmptyState, ErrorState, OfflineNote, SkeletonBlock } from "@/components/states";
import { useStatusCover } from "@/components/status-cover";
import { Text } from "@/components/text";
import { gifts as sampleGifts, type Gift } from "@/data/giving";
import { useAccount } from "@/lib/account";
import { useDirectory } from "@/lib/directory";
import { ddmmyyyy, jhbToday, rand } from "@/lib/format";
import { taxYearsGiven } from "@/lib/giving";
import { haptic } from "@/lib/haptics";
import { biggestGift, inTaxYear, longestRun, monthsOfTaxYear, shares, splits, type Share } from "@/lib/insights";
import { useScreenState } from "@/lib/screen-state";
import { taxYearFor, taxYearName, taxYearRangeLabel } from "@/lib/tax-year";
import { colors, fonts, radius, space, tabular } from "@/theme/tokens";

/** Ring colours in a fixed order (never by rank of anything else); "Other" is always the quiet slate. */
const SLICES = [colors.blue, colors.orange, colors.chartPurple];
const sliceColour = (s: Share, i: number) => (s.key === "other" ? colors.chartOther : SLICES[i % SLICES.length]);

/**
 * Your giving: insights from the donor's own gifts through Givezy, one tax year at a time. Month by month (tap a
 * bar for that month's gifts), where it went (by charity or by cause, tap a slice), and s18A and habits.
 * Nothing here is estimated or invented: every figure is added up from the gifts themselves.
 */
export default function Insights() {
  const insets = useSafeAreaInsets();
  const status = useStatusCover();
  const account = useAccount();
  const directory = useDirectory();
  const preview = account.status === "preview";
  const signedIn = account.status === "signed-in";
  const demoState = useScreenState();
  const state = preview
    ? demoState
    : account.status === "loading" || (signedIn && !account.live && !account.loadError)
      ? "loading"
      : account.loadError && !account.live
        ? "error"
        : "ready";
  const all: Gift[] = preview ? (demoState === "empty" ? [] : sampleGifts) : (account.live?.gifts ?? []);
  const today = jhbToday();
  const current = taxYearFor(today);
  const years = taxYearsGiven(all, current);
  const [year, setYear] = useState(current);
  const gifts = inTaxYear(all, year);

  return (
    <View style={{ flex: 1 }}>
      <Backdrop variant="receipts" />
      <ScrollView style={{ flex: 1 }} onScroll={status.onScroll} scrollEventThrottle={16} refreshControl={signedIn ? <RefreshControl refreshing={account.refreshing} onRefresh={account.refresh} /> : undefined} contentContainerStyle={{ paddingBottom: insets.bottom + 40, gap: space.block }}>
        <BlueHeader paddingTop={insets.top + 12}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.navigate("/giving"))} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
            <BackIcon color={colors.onInk} />
          </Pressable>
          <Text style={styles.headTitle} accessibilityRole="header">Your giving</Text>
          <Text style={styles.headLine}>Your gifts through Givezy, month by month, where they went and how you give.</Text>
        </BlueHeader>

        <View style={{ paddingHorizontal: space.gutter, gap: space.block }}>
          {state === "loading" ? (
            <View style={{ gap: 16 }}>
              <SkeletonBlock height={240} />
              <SkeletonBlock height={260} />
            </View>
          ) : state === "error" ? (
            <ErrorState body="We couldn't load your giving. Check your connection and try again." onRetry={() => account.refresh()} />
          ) : account.status === "agreeing" ? (
            <EmptyState title="One more step" body="Agree to the Terms and Privacy Policy on the Account tab, and your giving appears here." action={{ label: "Go to Account", onPress: () => router.navigate("/account") }} />
          ) : !preview && !signedIn ? (
            <EmptyState title="See your giving here" body="Sign in with the email you give with, and your gifts show up here with your insights." action={{ label: "Sign in", onPress: () => router.navigate("/account") }} />
          ) : (
            <>
              {account.live?.fromCache && account.loadError ? <OfflineNote savedAt={account.live.loadedAt} /> : null}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.gutter }} contentContainerStyle={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Which tax year">
                {years.map((y) => {
                  const on = y === year;
                  return (
                    <Pressable key={y} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { haptic.tap(); setYear(y); }} style={[styles.chip, on && styles.chipOn]}>
                      <Text style={[styles.chipText, on && { color: colors.onInk }]}>{y === current ? `${taxYearName(y)} tax year so far` : `${taxYearName(y)} tax year`}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {gifts.length === 0 ? (
                <EmptyState
                  title={year === current ? "No gifts yet this tax year" : `No gifts in the ${taxYearName(year)} tax year`}
                  body={`Gifts you make through Givezy between ${taxYearRangeLabel(year).replace(" to ", " and ")} show here.`}
                  action={{ label: "Find a charity", onPress: () => router.navigate("/discover") }}
                />
              ) : (
                <>
                  <MonthByMonth key={`m-${year}`} gifts={gifts} year={year} today={today} />
                  <WhereItWent key={`w-${year}`} gifts={gifts} charities={directory.data?.charities ?? []} causes={directory.data?.causes ?? []} />
                  <Habits gifts={gifts} />
                </>
              )}
              <Text variant="label" style={{ textAlign: "center" }}>
                {preview ? "Sample data: the demo donor's giving." : "Only gifts through Givezy. Giving you logged elsewhere is on Progress."}
              </Text>
            </>
          )}
        </View>
      </ScrollView>
      {status.cover}
    </View>
  );
}

/** A bar for each month of the tax year. Tap one for that month's total and gifts. */
function MonthByMonth({ gifts, year, today }: { gifts: Gift[]; year: number; today: Date }) {
  const months = monthsOfTaxYear(gifts, year, today);
  const latest = months.reduce((last, m, i) => (m.cents > 0 ? i : last), -1);
  const [picked, setPicked] = useState(latest);
  const [width, setWidth] = useState(0);
  const max = Math.max(...months.map((m) => m.cents), 1);
  const total = months.reduce((n, m) => n + m.cents, 0);
  const count = months.reduce((n, m) => n + m.gifts.length, 0);
  const H = 140;
  const col = width / 12;
  const bar = Math.min(18, col * 0.6);
  const sel = months[picked];

  return (
    <View style={styles.card}>
      <Text variant="h2" accessibilityRole="header" style={styles.cardTitle}>Month by month</Text>
      <Text style={styles.hero}>{rand(total)}</Text>
      <Text variant="bodyMuted">{count} {count === 1 ? "gift" : "gifts"} in the {taxYearName(year)} tax year</Text>

      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: H + 26, marginTop: 8 }}>
        {width > 0 ? (
          <>
            <View style={[styles.baseline, { top: H }]} />
            {months.map((m, i) => {
              const h = m.cents > 0 ? Math.max(6, Math.round((m.cents / max) * (H - 8))) : 0;
              const on = i === picked;
              return (
                <Pressable
                  key={m.label}
                  onPress={() => { haptic.tap(); setPicked(i); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${m.label}: ${m.future ? "still to come" : `${rand(m.cents)}, ${m.gifts.length} ${m.gifts.length === 1 ? "gift" : "gifts"}`}`}
                  style={{ position: "absolute", left: i * col, width: col, top: 0, height: H + 26, alignItems: "center" }}
                >
                  {h > 0 ? (
                    <View style={{ position: "absolute", top: H - h, width: bar, height: h, borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: on ? colors.orange : colors.blue, opacity: picked >= 0 && !on ? 0.55 : 1 }} />
                  ) : null}
                  <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={[styles.monthLetter, { top: H + 6, width: col, fontSize: col < 26 ? 9 : 11 }, on && { color: colors.ink, fontFamily: fonts.bodyBold }, m.future && { color: colors.chartOther }]}>{m.short}</Text>
                </Pressable>
              );
            })}
          </>
        ) : null}
      </View>

      {sel ? (
        <View style={styles.detail} accessibilityLiveRegion="polite">
          <View style={styles.detailHead}>
            <Text style={styles.detailTitle}>{sel.label}</Text>
            <Text style={styles.detailAmount}>{sel.future ? "Still to come" : rand(sel.cents)}</Text>
          </View>
          {sel.gifts.length === 0 ? (
            <Text variant="bodyMuted">{sel.future ? "This month hasn't happened yet." : "No gifts this month."}</Text>
          ) : (
            sel.gifts.map((g) => (
              <View key={g.id} style={styles.giftRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, lineHeight: 21 }}>{g.charityName}</Text>
                  <Text variant="label">{ddmmyyyy(g.date)}{g.monthly ? " · Monthly" : ""}</Text>
                </View>
                <Text style={styles.giftAmount}>{rand(g.cents)}</Text>
              </View>
            ))
          )}
        </View>
      ) : (
        <Text variant="bodyMuted">Tap a month to see its gifts.</Text>
      )}
    </View>
  );
}

/** A ring of where the money went, by charity or by cause. Tap a slice or a row to pick it out. */
function WhereItWent({ gifts, charities, causes }: { gifts: Gift[]; charities: { slug: string; causeId: string }[]; causes: { id: string; label: string }[] }) {
  const [by, setBy] = useState<"charity" | "cause">("charity");
  const [picked, setPicked] = useState<string | null>(null);
  const causeOf = (g: Gift) => {
    const id = charities.find((c) => c.slug === g.charitySlug)?.causeId ?? "";
    return { key: id || "unlisted", name: causes.find((c) => c.id === id)?.label ?? "Not in a cause" };
  };
  const rows =
    by === "charity"
      ? shares(gifts, (g) => ({ key: g.charitySlug, name: g.charityName }))
      : shares(gifts, causeOf);
  // By cause, each row says which charities it is made of, so the switch visibly regroups the giving.
  const shown = new Set(rows.map((x) => x.key));
  const membersOf = (key: string) =>
    [...new Set(gifts.filter((g) => (key === "other" ? !shown.has(causeOf(g).key) : causeOf(g).key === key)).map((g) => g.charityName))];
  // One charity per cause: the split looks the same as By charity, so say why rather than seem to do nothing.
  const sameSplit = by === "cause" && rows.every((x) => membersOf(x.key).length === 1);
  const total = rows.reduce((n, r) => n + r.cents, 0);
  const sel = rows.find((r) => r.key === picked) ?? null;
  const size = 176;
  const stroke = 26;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // A 2px surface gap between slices, unless there is only one.
  const gap = rows.length > 1 ? 2 : 0;
  // Where each slice starts round the ring.
  const starts = rows.map((_, i) => rows.slice(0, i).reduce((n, x) => n + (x.cents / total) * c, 0));

  return (
    <View style={styles.card}>
      <Text variant="h2" accessibilityRole="header" style={styles.cardTitle}>Where it went</Text>
      <Segmented
        label="Show by"
        value={by}
        onChange={(v) => { setBy(v); setPicked(null); }}
        options={[{ value: "charity", label: "By charity" }, { value: "cause", label: "By cause" }]}
      />
      {sameSplit ? (
        <Text variant="bodyMuted">Each charity you gave to is in a different cause, so the split is the same as By charity.</Text>
      ) : null}
      <View style={{ alignItems: "center", marginTop: 6 }}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            {rows.map((row, i) => {
              const len = (row.cents / total) * c;
              const dash = Math.max(len - gap, 1);
              return (
                <Circle
                  key={row.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={sliceColour(row, i)}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${c - dash}`}
                  strokeDashoffset={-starts[i]}
                  opacity={sel && sel.key !== row.key ? 0.3 : 1}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  onPress={() => { haptic.tap(); setPicked(picked === row.key ? null : row.key); }}
                />
              );
            })}
          </Svg>
          <View style={styles.ringCentre} pointerEvents="none">
            <Text style={styles.ringAmount}>{rand(sel ? sel.cents : total)}</Text>
            <Text variant="label" style={{ textAlign: "center" }} numberOfLines={2}>{sel ? `${sel.percent}% of your giving` : "In total"}</Text>
          </View>
        </View>
      </View>
      <View>
        {rows.map((row, i) => {
          const on = sel?.key === row.key;
          return (
            <Pressable
              key={row.key}
              onPress={() => { haptic.tap(); setPicked(on ? null : row.key); }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${row.name}: ${rand(row.cents)}, ${row.percent}%`}
              style={[styles.legendRow, i > 0 && styles.divider, on && { backgroundColor: colors.lilacSoft }]}
            >
              <View style={[styles.dot, { backgroundColor: sliceColour(row, i) }]} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ fontSize: 16, lineHeight: 21 }}>{row.name}</Text>
                {by === "cause" ? <Text variant="label" numberOfLines={2}>{membersOf(row.key).join(", ")}</Text> : null}
              </View>
              <Text variant="label">{row.percent}%</Text>
              <Text style={styles.giftAmount}>{rand(row.cents)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** s18A and habits: four plain facts from the gifts themselves. */
function Habits({ gifts }: { gifts: Gift[] }) {
  const s = splits(gifts);
  const big = biggestGift(gifts);
  const run = longestRun(gifts.map((g) => g.date));
  const pct = (n: number) => (s.total > 0 ? Math.round((n * 100) / s.total) : 0);
  return (
    <View style={styles.card}>
      <Text variant="h2" accessibilityRole="header" style={styles.cardTitle}>s18A and habits</Text>
      <View style={styles.tiles}>
        <View style={styles.tile}>
          <Text variant="label">With an s18A receipt</Text>
          <Text style={styles.tileValue}>{rand(s.with18a)}</Text>
          <SplitBar parts={[{ cents: s.with18a, colour: colors.blue }, { cents: s.without18a, colour: colors.chartOther }]} />
          <Text variant="label">{pct(s.with18a)}% of your giving · {rand(s.without18a)} without</Text>
        </View>
        <View style={styles.tile}>
          <Text variant="label">Monthly giving</Text>
          <Text style={styles.tileValue}>{rand(s.monthly)}</Text>
          <SplitBar parts={[{ cents: s.monthly, colour: colors.orange }, { cents: s.onceOff, colour: colors.chartPurple }]} />
          <Text variant="label">{pct(s.monthly)}% of your giving · {rand(s.onceOff)} once-off</Text>
        </View>
        {big ? (
          <View style={styles.tile}>
            <Text variant="label">Your biggest gift</Text>
            <Text style={styles.tileValue}>{rand(big.cents)}</Text>
            <Text variant="label">{big.charityName}, {ddmmyyyy(big.date)}</Text>
          </View>
        ) : null}
        <View style={styles.tile}>
          <Text variant="label">Longest run</Text>
          <Text style={styles.tileValue}>{run} {run === 1 ? "month" : "months"}</Text>
          <Text variant="label">in a row with at least one gift</Text>
        </View>
      </View>
    </View>
  );
}

/** A thin bar split into parts, with a 2px white gap between them. */
function SplitBar({ parts }: { parts: { cents: number; colour: string }[] }) {
  const shown = parts.filter((p) => p.cents > 0);
  return (
    <View style={styles.split} accessible={false}>
      {shown.map((p, i) => (
        <View key={i} style={{ flex: p.cents, backgroundColor: p.colour, marginLeft: i > 0 ? 2 : 0 }} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { width: 44, height: 44, marginLeft: -10, alignItems: "center", justifyContent: "center" },
  headTitle: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, color: colors.onInk },
  headLine: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23, color: colors.lilacSoft },
  chips: { gap: 8, paddingHorizontal: space.gutter },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface, justifyContent: "center" },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.navy },
  card: { gap: 10, padding: 18, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.hairline, backgroundColor: colors.surface },
  cardTitle: { fontSize: 22, lineHeight: 28 },
  hero: { ...tabular, fontFamily: fonts.displayBold, fontSize: 36, lineHeight: 42, color: colors.ink },
  baseline: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: colors.hairline },
  monthLetter: { position: "absolute", fontFamily: fonts.bodySemibold, fontSize: 11, color: colors.muted, textAlign: "center" },
  detail: { gap: 6, padding: 14, borderRadius: radius.control, backgroundColor: colors.lilacSoft },
  detailHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 },
  detailTitle: { fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink },
  detailAmount: { ...tabular, fontFamily: fonts.bodyBold, fontSize: 17, color: colors.ink },
  giftRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 6 },
  giftAmount: { ...tabular, fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.ink },
  ringCentre: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", paddingHorizontal: 34 },
  ringAmount: { ...tabular, fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 30, color: colors.ink },
  legendRow: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48, paddingHorizontal: 6, borderRadius: 10 },
  divider: { borderTopWidth: 1, borderTopColor: colors.hairline },
  dot: { width: 12, height: 12, borderRadius: 6 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { flexGrow: 1, flexBasis: "45%", minWidth: 140, gap: 4, padding: 14, borderRadius: radius.control, backgroundColor: colors.lilacSoft },
  tileValue: { ...tabular, fontFamily: fonts.bodyBold, fontSize: 22, lineHeight: 28, color: colors.ink },
  split: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: colors.hairline, marginVertical: 2 },
});
