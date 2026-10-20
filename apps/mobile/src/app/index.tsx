import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Backdrop } from "@/components/backdrop";
import { Blob } from "@/components/blob";
import { Button, TextLink } from "@/components/button";
import { FadeUp } from "@/components/fade-up";
import { CheckIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { SkeletonBlock } from "@/components/states";
import { Text } from "@/components/text";
import { saveCausePrefs } from "@/lib/cause-prefs";
import { useDirectory } from "@/lib/directory";
import { GIVER_TYPES, saveGiverType, type GiverType } from "@/lib/giver-type";
import { haptic } from "@/lib/haptics";
import { markNewDonor } from "@/lib/first-run";
import { hasBeenWelcomed, markWelcomed } from "@/lib/welcome";
import { colors, fonts, radius, space, touch } from "@/theme/tokens";

/** The questions after the welcome screen: what kind of giver, then which causes. */
const STEPS = 2;

/**
 * First open, "small yes first": the blue welcome, then two quick questions (what kind of giver you are,
 * and which causes matter to you), each skippable, then straight to the charities, those you chose first.
 * A giving goal is asked about once, after the first gift (see GiftSent). Shown once per phone.
 * `?welcome=1&step=2` shows it again for design review (step 0 is the welcome).
 */
export default function Welcome() {
  const insets = useSafeAreaInsets();
  const directory = useDirectory();
  const p = useLocalSearchParams<{ welcome?: string; step?: string }>();
  const forced = p.welcome === "1";
  const [seen, setSeen] = useState<boolean | null>(forced ? false : null);
  const [step, setStep] = useState(() => Math.min(STEPS, Math.max(0, Number(p.step) || 0)));
  const [giver, setGiver] = useState<GiverType | null>(null);
  const [picked, setPicked] = useState<string[]>([]);

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

  // Straight to the charities, the donor's causes first.
  const finish = () => {
    markWelcomed();
    void markNewDonor();
    router.replace("/discover");
  };
  const next = () => (step >= STEPS ? finish() : setStep((n) => n + 1));
  const causes = (directory.data?.causes ?? []).filter((c) => c.id !== "all");

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
          <Pressable accessibilityRole="button" accessibilityLabel="Skip this question" hitSlop={8} onPress={next} style={styles.skip}>
            <Text style={styles.skipText}>Skip</Text>
          </Pressable>
        </View>

        {step === 1 ? (
          <FadeUp key="giver" style={{ flex: 1, gap: space.block }}>
            <View style={{ gap: 8 }}>
              <Text variant="h1" accessibilityRole="header">What kind of giver are you?</Text>
              <Text variant="bodyMuted">There&apos;s no right answer. It just helps us get to know you.</Text>
            </View>
            <View style={{ gap: 12 }} accessibilityRole="radiogroup">
              {GIVER_TYPES.map((g) => {
                const on = giver === g.id;
                return (
                  <Pressable
                    key={g.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      haptic.tap();
                      setGiver(g.id);
                    }}
                    style={[styles.choice, on && styles.choiceOn]}
                  >
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy }}>{g.label}</Text>
                      <Text variant="bodyMuted">{g.line}</Text>
                    </View>
                    {on ? <CheckIcon size={20} color={colors.blue} /> : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flex: 1 }} />
            <Button
              label="Next"
              disabled={!giver}
              onPress={() => {
                void saveGiverType(giver);
                next();
              }}
            />
          </FadeUp>
        ) : (
          <FadeUp key="causes" style={{ flex: 1, gap: space.block }}>
            <View style={{ gap: 8 }}>
              <Text variant="h1" accessibilityRole="header">Which causes matter to you?</Text>
              <Text variant="bodyMuted">Pick as many as you like. We show these charities first.</Text>
            </View>
            {!directory.data && !directory.failed ? (
              <View style={{ gap: 10 }}>
                <SkeletonBlock height={46} width="70%" />
                <SkeletonBlock height={46} width="55%" />
                <SkeletonBlock height={46} width="80%" />
              </View>
            ) : directory.failed && !directory.data ? (
              <View style={{ gap: 8 }} accessibilityRole="alert">
                <Text variant="bodyMuted">We couldn&apos;t load the causes. Check your connection and try again, or skip this and see all charities.</Text>
                <TextLink label="Try again" onPress={directory.retry} />
              </View>
            ) : (
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
            )}
            <View style={{ flex: 1 }} />
            <Button
              variant="cta"
              label="Show me charities"
              onPress={() => {
                void saveCausePrefs(picked);
                finish();
              }}
            />
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
  choice: { flexDirection: "row", alignItems: "center", gap: 12, padding: 18, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface },
  choiceOn: { borderColor: colors.blue, backgroundColor: colors.lilacSoft },
  chipText: { fontFamily: fonts.bodySemibold, fontSize: 16, color: colors.navy },
});
