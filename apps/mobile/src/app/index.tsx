import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { parseRandToCents } from "@shared/money";
import { Backdrop } from "@/components/backdrop";
import { Blob } from "@/components/blob";
import { Button, TextLink } from "@/components/button";
import { FadeUp } from "@/components/fade-up";
import { Field } from "@/components/field";
import { CheckIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { Text } from "@/components/text";
import { useAccount } from "@/lib/account";
import { saveCausePrefs } from "@/lib/cause-prefs";
import { causeList } from "@/lib/directory";
import { rand } from "@/lib/format";
import { saveGoals } from "@/lib/goals-store";
import { haptic } from "@/lib/haptics";
import { notify } from "@/lib/open-site";
import { hasBeenWelcomed, markWelcomed } from "@/lib/welcome";
import { colors, fonts, radius, space, touch } from "@/theme/tokens";

/** The onboarding steps after the welcome screen. */
const STEPS = 3;

/** Goal names to start from; the donor names their own goal, so maaser is one option, never the default. */
const GOAL_NAMES = ["Giving goal", "Maaser", "Tithe"] as const;

const SAFE = [
  { title: "Your card goes on a secure page", body: "You enter it on our payment partner's own secure page, never in this app." },
  { title: "Kept there, not with us", body: "For monthly donations, your card is kept by the payment partner, so next month needs no typing. Givezy never sees or stores it." },
  { title: "Givezy never holds the money", body: "Your gift goes from the payment partner straight to the charity's bank account." },
];

/**
 * First open: the blue welcome, then three steps: the causes you care about, your giving goal, and
 * how giving is kept safe. Skippable, and shown once per phone.
 * `?welcome=1&step=2` shows it again for design review (step 0 is the welcome).
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const account = useAccount();
  const p = useLocalSearchParams<{ welcome?: string; step?: string }>();
  const forced = p.welcome === "1";
  const [seen, setSeen] = useState<boolean | null>(forced ? false : null);
  const [step, setStep] = useState(() => Math.min(STEPS, Math.max(0, Number(p.step) || 0)));
  const [picked, setPicked] = useState<string[]>([]);
  const [goalName, setGoalName] = useState<string>("Giving goal");
  const [ownName, setOwnName] = useState("");
  const [writingOwn, setWritingOwn] = useState(false);
  const [yearly, setYearly] = useState("");
  const [amountError, setAmountError] = useState<string | undefined>();

  useEffect(() => {
    if (!forced) hasBeenWelcomed().then(setSeen);
  }, [forced]);

  // Android's back button steps back through the welcome rather than closing the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (step <= 0) return false;
      setStep(step - 1);
      return true;
    });
    return () => sub.remove();
  }, [step]);

  if (seen === null) return <View style={styles.blueScreen} />;
  if (seen) return <Redirect href="/home" />;

  const finish = () => {
    markWelcomed();
    router.replace("/home");
  };
  const next = () => setStep((s) => Math.min(STEPS, s + 1));
  const yearlyCents = parseRandToCents(yearly);
  const perMonth = yearlyCents && yearlyCents > 0 ? Math.ceil(yearlyCents / 12 / 100) * 100 : null;
  const causes = causeList().filter((c) => c.id !== "all");

  if (step === 0) {
    return (
      <View style={[styles.blueScreen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <Blob size={260} color={colors.orange} rotate={25} style={{ right: -110, top: insets.top + 90 }} />
        <Blob size={200} color={colors.lilac} rotate={-20} stretch={1.2} style={{ left: -110, top: insets.top + 150 }} />
        <View style={styles.gutter}><Logo width={150} white /></View>
        <View style={{ flex: 1 }} />
        <FadeUp style={[styles.gutter, { gap: 14 }]}>
          <Text style={styles.welcomeTitle} accessibilityRole="header">Give in a few taps.</Text>
          <Text style={styles.welcomeLine}>All your giving, finally in one place. Every charity checked by us.</Text>
        </FadeUp>
        <View style={[styles.gutter, { gap: 6, marginTop: 28 }]}>
          <Button variant="white" label="Get started" onPress={next} />
          <Pressable onPress={() => { markWelcomed(); router.replace("/account"); }} accessibilityRole="link" style={styles.alreadyLink}>
            <Text style={styles.alreadyText}>I already have an account</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Backdrop variant="page" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space.gutter, paddingTop: insets.top + 16, paddingBottom: insets.bottom + space.md, gap: space.block }}>
        <View style={styles.topRow}>
          {/* Three segments: where you are in the setup. */}
          <View style={styles.bar} accessible accessibilityLabel={`Step ${step} of ${STEPS}`}>
            {Array.from({ length: STEPS }, (_, i) => (
              <View key={i} style={[styles.segment, i < step && styles.segmentOn]} />
            ))}
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Skip the setup" hitSlop={8} onPress={finish} style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>

        {step === 1 ? (
          <FadeUp key="causes" style={{ flex: 1, gap: space.block }}>
            <View style={{ gap: 8 }}>
              <Text variant="h1" accessibilityRole="header">What do you care about?</Text>
              <Text variant="bodyMuted">Pick as many as you like. We show you these first.</Text>
            </View>
            <View style={styles.chips}>
              {causes.map((c) => {
                const on = picked.includes(c.id);
                return (
                  <Pressable
                    key={c.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => {
                      haptic.tap();
                      setPicked((ps) => (on ? ps.filter((x) => x !== c.id) : [...ps, c.id]));
                    }}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    {on ? <CheckIcon size={16} color={colors.onInk} /> : null}
                    <Text style={[styles.chipText, on && { color: colors.onInk }]}>{c.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flex: 1 }} />
            <Button label="Next" onPress={() => { void saveCausePrefs(picked); next(); }} />
          </FadeUp>
        ) : step === 2 ? (
          <FadeUp key="goal" style={{ flex: 1, gap: space.block }}>
            <View style={{ gap: 8 }}>
              <Text variant="h1" accessibilityRole="header">Name your goal.</Text>
              <Text variant="bodyMuted">Optional. Only you see it, and you can change it any time.</Text>
            </View>
            <View style={styles.chips} accessibilityRole="radiogroup">
              {GOAL_NAMES.map((n) => {
                const on = !writingOwn && goalName === n;
                return (
                  <Pressable key={n} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={() => { haptic.tap(); setWritingOwn(false); setGoalName(n); }} style={[styles.chip, on && styles.chipOn]}>
                    <Text style={[styles.chipText, on && { color: colors.onInk }]}>{n}</Text>
                  </Pressable>
                );
              })}
              <Pressable accessibilityRole="radio" accessibilityState={{ selected: writingOwn }} onPress={() => { haptic.tap(); setWritingOwn(true); }} style={[styles.chip, writingOwn && styles.chipOn]}>
                <Text style={[styles.chipText, writingOwn && { color: colors.onInk }]}>Write your own</Text>
              </Pressable>
            </View>
            {writingOwn ? <Field label="Your goal's name" value={ownName} onChangeText={setOwnName} maxLength={40} /> : null}
            <Field label="How much a year?" prefix="R" keyboardType="decimal-pad" value={yearly} onChangeText={setYearly} placeholder="0" error={amountError} />
            <View style={styles.previewCard}>
              <Text style={styles.previewKicker}>That&apos;s about</Text>
              <Text style={styles.previewAmount}>{perMonth ? `${rand(perMonth)} a month` : "R__ a month"}</Text>
            </View>
            <View style={{ flex: 1 }} />
            <Button
              label="Next"
              onPress={async () => {
                if (!yearly.trim()) return next(); // no goal for now
                if (!yearlyCents || yearlyCents <= 0) return setAmountError("Enter an amount in Rand, for example 12000");
                setAmountError(undefined);
                const name = (writingOwn ? ownName.trim() : goalName) || "Giving goal";
                const saved = await saveGoals(
                  [{ id: `${Date.now()}`, name: name.slice(0, 40), basis: "fixed", percentPpm: null, fixedCents: yearlyCents, period: "year", year: "tax", counts: null }],
                  account.status === "signed-in" ? account.userId : null,
                );
                if (!saved.ok) return notify("Your goal was not saved", "It could not be saved on this phone. Please try again, or skip and set it later on the Progress tab.");
                haptic.success();
                next();
              }}
            />
            <TextLink label="Not now" onPress={next} />
          </FadeUp>
        ) : (
          <FadeUp key="safe" style={{ flex: 1, gap: space.block }}>
            <View style={{ gap: 8 }}>
              <Text variant="h1" accessibilityRole="header">Giving in a few taps, kept safe.</Text>
              <Text variant="bodyMuted">How giving works, so you know where your card and your money go.</Text>
            </View>
            <View style={{ gap: 12 }}>
              {SAFE.map((s, i) => (
                <View key={s.title} style={styles.safeCard}>
                  <View style={styles.safeNumber}><Text style={styles.safeNumberText}>{i + 1}</Text></View>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontFamily: fonts.bodyBold, fontSize: 17, color: colors.navy }}>{s.title}</Text>
                    <Text variant="bodyMuted">{s.body}</Text>
                  </View>
                </View>
              ))}
            </View>
            <View style={{ flex: 1 }} />
            <Button variant="cta" label="Start giving" onPress={finish} />
          </FadeUp>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  blueScreen: { flex: 1, backgroundColor: colors.blue, overflow: "hidden" },
  gutter: { paddingHorizontal: space.gutter },
  welcomeTitle: { fontFamily: fonts.display, fontSize: 52, lineHeight: 56, color: colors.onInk },
  welcomeLine: { fontFamily: fonts.bodyMedium, fontSize: 19, lineHeight: 27, color: colors.lilacSoft },
  alreadyLink: { minHeight: touch, alignItems: "center", justifyContent: "center" },
  alreadyText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.onInk, textDecorationLine: "underline" },
  topRow: { flexDirection: "row", alignItems: "center", gap: 16 },
  bar: { flex: 1, flexDirection: "row", gap: 6 },
  segment: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.lightPurple },
  segmentOn: { backgroundColor: colors.blue },
  skip: { minHeight: touch, minWidth: touch, alignItems: "flex-end", justifyContent: "center" },
  skipText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.blue },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 46, paddingHorizontal: 18, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface },
  chipOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.navy },
  previewCard: { padding: 18, borderRadius: radius.card, backgroundColor: colors.lilacSoft, gap: 2 },
  previewKicker: { fontFamily: fonts.bodySemibold, fontSize: 14, color: colors.muted },
  previewAmount: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.navy },
  safeCard: { flexDirection: "row", gap: 14, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.lightPurple },
  safeNumber: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.orange, alignItems: "center", justifyContent: "center" },
  safeNumberText: { fontFamily: fonts.display, fontSize: 18, color: colors.navy },
});
