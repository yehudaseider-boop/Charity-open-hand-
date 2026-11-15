import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CHARITY_REQUEST_CONSENT, CHARITY_REQUEST_LIMITS as L, checkCharityRequest } from "@shared/charity-requests";
import { Backdrop } from "@/components/backdrop";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { CheckIcon } from "@/components/icons";
import { Bubbles } from "@/components/people";
import { SwitchRow } from "@/components/switch-row";
import { Text } from "@/components/text";
import { TopBar } from "@/components/top-bar";
import { useAccount } from "@/lib/account";
import { sendCharityRequest, type RequestReply } from "@/lib/charity-request";
import { haptic } from "@/lib/haptics";
import { colors, fonts, radius, space } from "@/theme/tokens";

type Errors = Partial<Record<"name" | "town" | "link" | "note" | "email", string>>;

/**
 * "Ask us to add a charity" (Yehuda, 15/11/2026): from Discover, when a search finds nothing or at the end of the
 * list. The same rules as the website (@shared/charity-requests), checked here first so a mistake shows at once.
 * Everything typed stays when something goes wrong.
 */
export default function RequestCharity() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ name?: string }>();
  const account = useAccount();
  const [name, setName] = useState(typeof params.name === "string" ? params.name.slice(0, L.name) : "");
  const [town, setTown] = useState("");
  const [link, setLink] = useState("");
  const [note, setNote] = useState("");
  const [emailMe, setEmailMe] = useState(false);
  const [email, setEmail] = useState(account.email ?? "");
  const [errors, setErrors] = useState<Errors>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<Extract<RequestReply, { ok: true }> | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);

  const send = async () => {
    if (sending) return;
    const checked = checkCharityRequest({ name, town, link, note, emailMe, email });
    if (!checked.ok) {
      haptic.soft();
      setErrors(checked.fieldErrors);
      setProblem(checked.message);
      scroll.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setErrors({});
    setProblem(null);
    setSending(true);
    const token = await account.accessToken().catch(() => null);
    const reply = await sendCharityRequest({ name, town, link, note, emailMe, email }, token);
    setSending(false);
    if (reply.ok) {
      haptic.success();
      setDone(reply);
      return;
    }
    haptic.soft();
    setErrors((reply.fieldErrors ?? {}) as Errors);
    setProblem(reply.message);
  };

  const again = () => {
    setDone(null);
    setName("");
    setTown("");
    setLink("");
    setNote("");
    setEmailMe(false);
  };

  return (
    <View style={styles.screen}>
      <Backdrop variant="page" />
      <TopBar title="Ask us to add a charity" fallback="/discover" />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: insets.bottom + 32, gap: space.block }}>
          <View style={styles.hero}>
            <Bubbles
              items={[
                { size: 130, color: colors.peach, at: { right: -46, top: -44 } },
                { size: 14, color: colors.orange, float: true, at: { right: 30, top: 24 } },
                { size: 22, color: colors.blue, ring: true, float: true, at: { right: 24, bottom: 18 } },
              ]}
            />
            <Text style={styles.heroTitle} accessibilityRole="header">
              Can&apos;t find your <Text style={styles.key}>charity</Text>?
            </Text>
            <Text variant="bodyMuted" style={{ paddingRight: 40 }}>Tell us who they are and we&apos;ll ask them to join. Only the name is needed.</Text>
          </View>

          {done ? (
            <View style={{ gap: 14 }}>
              <View style={styles.doneCard} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <View style={styles.tick}><CheckIcon color={colors.onInk} /></View>
                <Text style={styles.doneText}>{done.message}</Text>
              </View>
              {done.existing ? (
                <Button label={`See ${done.existing.name}`} onPress={() => router.replace(`/charity/${done.existing!.slug}`)} />
              ) : (
                <Button label="Back to charities" onPress={() => (router.canGoBack() ? router.back() : router.replace("/discover"))} />
              )}
              <Button variant="secondary" label="Ask for another charity" onPress={again} />
            </View>
          ) : (
            <View style={{ gap: 18 }}>
              {problem ? (
                <View style={styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite">
                  <Text style={styles.problemText}>{problem}</Text>
                </View>
              ) : null}
              <Field label="Charity's name" value={name} onChangeText={setName} maxLength={L.name} error={errors.name} autoCapitalize="words" returnKeyType="next" />
              <Field label="Town or area (optional)" helper="So we find the right one. For example Soweto." value={town} onChangeText={setTown} maxLength={L.town} error={errors.town} autoCapitalize="words" />
              <Field label="Website or social page (optional)" helper="If you know it. A Facebook or Instagram page is fine." value={link} onChangeText={setLink} maxLength={L.link} error={errors.link} keyboardType="url" autoCapitalize="none" autoCorrect={false} />
              <Field label="Anything we should know (optional)" value={note} onChangeText={setNote} maxLength={L.note} error={errors.note} multiline numberOfLines={3} textAlignVertical="top" />

              <View style={styles.optIn}>
                <SwitchRow label={CHARITY_REQUEST_CONSENT.label} description="One email, only if they join." more={CHARITY_REQUEST_CONSENT.text} value={emailMe} onChange={setEmailMe} />
                {emailMe ? (
                  <Field label="Your email address" value={email} onChangeText={setEmail} maxLength={L.email} error={errors.email} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" />
                ) : null}
              </View>

              <Button variant="cta" label={sending ? "Sending…" : "Send request"} onPress={send} disabled={sending} accessibilityState={{ busy: sending, disabled: sending }} />
              {sending ? <Text variant="label" style={{ textAlign: "center" }} accessibilityLiveRegion="polite">Sending your request, please wait…</Text> : null}
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  hero: { backgroundColor: colors.lilacSoft, borderRadius: radius.card, padding: 22, paddingTop: 24, overflow: "hidden", gap: 10 },
  heroTitle: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 35, letterSpacing: -0.4, color: colors.navy, paddingRight: 40 },
  key: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 35, letterSpacing: -0.4, color: colors.blue },
  optIn: { gap: 12, padding: 16, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
  problem: { padding: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.danger, backgroundColor: colors.surface },
  problemText: { fontFamily: fonts.bodySemibold, fontSize: 16, lineHeight: 22, color: colors.danger },
  doneCard: { flexDirection: "row", gap: 14, alignItems: "flex-start", padding: 18, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
  tick: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  doneText: { flex: 1, fontFamily: fonts.bodySemibold, fontSize: 17, lineHeight: 24, color: colors.navy },
});
