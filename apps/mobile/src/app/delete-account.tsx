import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, KeyboardAvoidingView, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CANT_UNDO, DELETED_LIST, KEPT_LIST, KEPT_WHY, TAKES_HOW_LONG } from "@shared/delete-account";
import { Backdrop, BlueHeader } from "@/components/backdrop";
import { Button, TextLink } from "@/components/button";
import { Field } from "@/components/field";
import { BackIcon } from "@/components/icons";
import { isIphonePreview } from "@/components/preview-chrome";
import { Bubbles, People } from "@/components/people";
import { LoadingNote, SkeletonBlock } from "@/components/states";
import { useStatusCover } from "@/components/status-cover";
import { Text } from "@/components/text";
import { sampleDonor } from "@/data/giving";
import { useAccount } from "@/lib/account";
import { checkDeletion, deleteReady, phoneKeysFor, requestDeletion } from "@/lib/delete-account";
import { startAgainAsNewDonor } from "@/lib/first-run";
import { haptic } from "@/lib/haptics";
import { helpLine, helpMailto } from "@/lib/help";
import { cleanCode } from "@/lib/live-giving";
import { secureStorage } from "@/lib/secure-storage";
import { SITE_URL } from "@/lib/website";
import { colors, fonts, radius, space } from "@/theme/tokens";

/**
 * Delete my account, inside the app (25/11/2026; Apple guideline 5.1.1(v)). ALL WORDING IS DRAFT for Yosef (the lawyer).
 *
 *   intro    what is deleted, what is kept and why, that it can't be undone, that monthly donations are cancelled
 *   confirm  type DELETE (or your email), then the dark "Delete my account" button
 *   code     only if you signed in more than ten minutes ago: a fresh emailed code first, what you typed is kept
 *   working  "Deleting your account…" (the server does it all at once; keep the app open)
 *   done     signed out, this phone's copies forgotten, then back to the welcome with a short confirmation
 *
 * Every failure says what happened, what was kept, what to do, and how to reach a person. Offline, nothing is deleted
 * and what was typed stays. Preview (no live server): the sample account, and ?state=confirm|error|code|refused|done
 * for design review.
 */
type Stage = "check" | "intro" | "confirm" | "code" | "working" | "done";
type ProblemInfo = { title: string; message: string };

export default function DeleteAccount() {
  const insets = useSafeAreaInsets();
  const status = useStatusCover({ onBlue: true });
  const account = useAccount();
  const p = useLocalSearchParams<{ state?: string }>();
  const preview = account.status === "preview";
  const shot = preview || isIphonePreview() ? p.state : undefined;
  const email = preview ? sampleDonor.email : account.email;

  const [stage, setStage] = useState<Stage>(shot === "confirm" || shot === "error" ? "confirm" : shot === "code" ? "code" : shot === "done" ? "done" : preview ? "intro" : "check");
  const [typed, setTyped] = useState(shot === "confirm" || shot === "error" ? "DELETE" : "");
  const [refusal, setRefusal] = useState<string | null>(shot === "refused" ? "You manage a charity on Givezy, so we can't delete your account yet. A charity needs an owner: hand it over to someone else first. Nothing was deleted." : null);
  const [problem, setProblem] = useState<ProblemInfo | null>(shot === "error" ? { title: "Your account wasn't deleted", message: "We couldn't reach Givezy. Check your connection and try again. Nothing was deleted that we know of, and what you typed is still here." } : null);
  const [needsFreshSignIn, setNeedsFreshSignIn] = useState(false);
  const [codeSent, setCodeSent] = useState(shot === "code" ? true : false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /** An earlier try got no answer, so it may have gone through. */
  const attempted = useRef(false);
  const working = stage === "working";

  // The check before anything is typed: can this account be deleted here? Refusals show first, not after typing.
  const check = useCallback(async () => {
    if (preview || !SITE_URL) return;
    setStage("check");
    setProblem(null);
    const token = await account.accessToken();
    if (!token) {
      setStage("intro");
      setNeedsFreshSignIn(true);
      return;
    }
    const r = await checkDeletion(SITE_URL, token);
    if (r.kind === "ok") {
      setNeedsFreshSignIn(r.signInAgain);
      setRefusal(null);
      setStage("intro");
    } else if (r.kind === "refused") {
      setRefusal(r.message);
      setStage("intro");
    } else {
      setProblem({ title: "We couldn't check your account", message: r.message });
      setStage("intro");
    }
  }, [account, preview]);

  const signedIn = preview || account.status === "signed-in";
  useEffect(() => {
    if (!signedIn || preview) return;
    // Started after this render (not inside it), so the screen's states are set from a callback.
    const t = setTimeout(() => void check(), 0);
    return () => clearTimeout(t);
    // Only when the screen opens or the sign-in changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, preview]);

  // While it runs, the back button waits: leaving half way would hide what happened.
  useEffect(() => {
    if (!working) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [working]);

  const leave = () => (router.canGoBack() ? router.back() : router.navigate("/account"));

  /** Signed out, this phone's copies forgotten, first open reset: the account is gone, so is what this phone kept for it. */
  const finish = async () => {
    const id = account.userId;
    try {
      await account.signOut();
    } catch {
      // The account is already gone on our side: the phone still lets go of its copy of the sign-in.
    }
    if (id) await Promise.all(phoneKeysFor(id).map((k) => secureStorage.removeItem(k).catch(() => undefined)));
    await startAgainAsNewDonor().catch(() => undefined);
    haptic.success();
    setStage("done");
  };

  const run = async () => {
    setProblem(null);
    setStage("working");
    if (preview || !SITE_URL) {
      await new Promise((r) => setTimeout(r, 900));
      return setStage("done");
    }
    const token = await account.accessToken();
    if (!token) {
      setNeedsFreshSignIn(true);
      setStage("code");
      return;
    }
    const o = await requestDeletion(SITE_URL, token, typed, attempted.current);
    switch (o.kind) {
      case "done":
        return finish();
      case "sign_in_again":
        setNeedsFreshSignIn(true);
        setCodeError(null);
        return setStage("code");
      case "refused":
        setRefusal(o.message);
        return setStage("intro");
      case "maybe_done":
        setProblem({ title: "We're not sure it went through", message: o.message });
        return setStage("confirm");
      case "no_answer":
        // No answer: it may or may not have gone through, so a later 401 is read as "maybe already deleted".
        attempted.current = true;
        setProblem({ title: "Your account wasn't deleted", message: o.message });
        return setStage("confirm");
    }
  };

  const pressDelete = () => {
    if (!deleteReady(typed, email, busy)) return;
    if (needsFreshSignIn) {
      setCodeError(null);
      return setStage("code");
    }
    void run();
  };

  const sendCode = async () => {
    if (!email || busy) return;
    setBusy(true);
    setCodeError(null);
    const r = preview ? { ok: true as const } : await account.sendCode(email).catch(() => ({ ok: false as const, message: "We couldn't send the code just now. Nothing was deleted. Please try again in a minute." }));
    setBusy(false);
    if (r.ok) setCodeSent(true);
    else setCodeError(r.message);
  };

  const confirmCode = async () => {
    const c = cleanCode(code);
    if (!c) return setCodeError("Enter the code from the email, numbers only.");
    if (!email || busy) return;
    setBusy(true);
    setCodeError(null);
    const r = preview ? { ok: true as const } : await account.verifyCode(email, c).catch(() => ({ ok: false as const, message: "We couldn't check the code just now. Nothing was deleted. Please try again." }));
    setBusy(false);
    if (!r.ok) return setCodeError(r.message);
    setNeedsFreshSignIn(false);
    setCode("");
    // Signed in just now: carry straight on with what was typed.
    void run();
  };

  const reach = () => {
    const mail = helpMailto(undefined, "Delete my Givezy account");
    if (mail) void Linking.openURL(mail).catch(() => undefined);
  };

  return (
    <View style={{ flex: 1 }}>
      <Backdrop variant="account" />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView style={styles.screen} onScroll={status.onScroll} scrollEventThrottle={16} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + 40, gap: space.block }}>
          <BlueHeader paddingTop={insets.top + 12}>
            {working || stage === "done" ? (
              <View style={{ height: 44 }} />
            ) : (
              <Pressable onPress={stage === "confirm" ? () => { setStage("intro"); setProblem(null); } : stage === "code" ? () => setStage("confirm") : leave} accessibilityRole="button" accessibilityLabel="Back" style={styles.back}>
                <BackIcon color={colors.onInk} />
              </Pressable>
            )}
            <Text style={styles.headTitle} accessibilityRole="header">{stage === "done" ? "Your account is deleted" : "Delete my account"}</Text>
            <Text style={styles.headLine}>
              {stage === "done" ? "We&apos;ve emailed you a confirmation." : stage === "confirm" || stage === "code" || working ? "Nearly done. One more check." : "Read this first. It takes a minute."}
            </Text>
          </BlueHeader>

          <View style={{ paddingHorizontal: space.gutter, gap: 16 }}>
            {/* Working and done come first: once the account is gone the phone is signed out, and that must not
                flash "Sign in first" in the middle of it. */}
            {stage === "done" ? (
              <Done onContinue={() => router.replace("/?deleted=1")} />
            ) : working ? (
              <View style={styles.card} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Bubbles items={[{ size: 90, color: colors.lilac, ring: true, at: { right: -34, bottom: -36 } }, { size: 12, color: colors.orange, float: true, at: { right: 28, top: 22 } }]} />
                <Text variant="h2">Deleting your account…</Text>
                <Text variant="bodyMuted">Please keep the app open. This takes a few seconds, and there is nothing else for you to do.</Text>
                <SkeletonBlock height={14} width="70%" />
              </View>
            ) : !signedIn && account.status !== "loading" ? (
              <View style={styles.card}>
                <Text variant="h2">Sign in first</Text>
                <Text variant="bodyMuted">To delete your account we need to know it is you. Sign in with the email you use with Givezy, then come back here.</Text>
                <Button label="Sign in" onPress={() => router.replace("/account")} />
              </View>
            ) : account.status === "loading" || stage === "check" ? (
              <View style={{ gap: 12 }}>
                <LoadingNote />
                <SkeletonBlock height={150} />
                <SkeletonBlock height={150} />
              </View>
            ) : stage === "code" ? (
              <View style={styles.card}>
                <Text variant="h2">Sign in again first</Text>
                <Text variant="bodyMuted">
                  It&apos;s a safety step: deleting can&apos;t be undone, so we check it is you. We&apos;ll email a code to {email}. What you typed stays here, and nothing has been deleted.
                </Text>
                {codeSent ? (
                  <>
                    <Text variant="bodyMuted">We sent the code. It works once and expires soon. Use the newest one.</Text>
                    <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={14} error={codeError ?? undefined} />
                    <Button variant="dark" label={busy ? "Checking…" : "Confirm code and delete my account"} disabled={busy} onPress={confirmCode} />
                    <TextLink label={busy ? "Sending…" : "Send a new code"} onPress={() => { if (!busy) { setCode(""); void sendCode(); } }} />
                  </>
                ) : (
                  <>
                    {codeError ? <Text variant="label" style={{ color: colors.danger }} accessibilityRole="alert">{codeError}</Text> : null}
                    <Button label={busy ? "Sending…" : "Email me a code"} disabled={busy} onPress={sendCode} />
                  </>
                )}
                <TextLink label="Keep my account" onPress={leave} />
                <Text variant="label" style={{ textAlign: "center" }}>{helpLine()}</Text>
              </View>
            ) : stage === "confirm" ? (
              <>
                {problem ? <Problem problem={problem} onReach={reach} /> : null}
                <View style={styles.card}>
                  <Text variant="h2">Type DELETE to confirm</Text>
                  <Text variant="bodyMuted">Your monthly donations will be cancelled and your account deleted for good. {CANT_UNDO}</Text>
                  <Field
                    label="Type DELETE, or your email address"
                    value={typed}
                    onChangeText={setTyped}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoComplete="off"
                    placeholder="DELETE"
                    returnKeyType="done"
                    onSubmitEditing={pressDelete}
                  />
                  <Button variant="dark" label="Delete my account" disabled={!deleteReady(typed, email, busy)} onPress={pressDelete} />
                  <TextLink label="Keep my account" onPress={leave} />
                </View>
              </>
            ) : (
              <>
                {problem ? <Problem problem={problem} onReach={reach} onRetry={() => void check()} /> : null}
                {refusal ? (
                  <View style={styles.card} accessibilityRole="alert">
                    <Text variant="h2">We can&apos;t delete it here</Text>
                    <Text variant="body">{refusal}</Text>
                    <Text variant="bodyMuted">{helpLine()}</Text>
                    <Button label="Back to Account" onPress={leave} />
                  </View>
                ) : (
                  <Intro onContinue={() => setStage("confirm")} onKeep={leave} />
                )}
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      {status.cover}
    </View>
  );
}

function Bullets({ lines, tone = "blue" }: { lines: readonly string[]; tone?: "blue" | "ink" }) {
  return (
    <View style={{ gap: 8 }}>
      {lines.map((l) => (
        <View key={l} style={styles.bullet}>
          <View style={[styles.dot, tone === "ink" && { backgroundColor: colors.navy }]} />
          <Text variant="body" style={{ flex: 1 }}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

function Intro({ onContinue, onKeep }: { onContinue: () => void; onKeep: () => void }) {
  return (
    <>
      <View style={[styles.card, styles.soft]}>
        <Bubbles items={[{ size: 120, color: colors.peach, at: { right: -44, top: -46 } }, { size: 12, color: colors.orange, float: true, at: { right: 26, top: 20 } }]} />
        <Text variant="h2" style={{ paddingRight: 56 }}>What will be <Text variant="h2" style={{ color: colors.blue }}>deleted</Text></Text>
        <Bullets lines={DELETED_LIST} />
      </View>

      <View style={styles.card}>
        <Text variant="h2">What we keep, and why</Text>
        <Bullets lines={KEPT_LIST} tone="ink" />
        <Text variant="bodyMuted">{KEPT_WHY}</Text>
      </View>

      <View style={[styles.card, styles.blueCard]}>
        <Bubbles items={[{ size: 96, color: colors.lilac, ring: true, at: { right: -36, bottom: -38 } }, { size: 40, color: colors.orange, at: { right: -14, top: -14 } }]} />
        <Text style={styles.blueTitle}>Before you go</Text>
        <Text style={styles.blueLine}>Your monthly donations will be cancelled, so you are never charged again.</Text>
        <Text style={styles.blueLine}>{CANT_UNDO}</Text>
        <Text style={styles.blueLine}>{TAKES_HOW_LONG}</Text>
      </View>

      <View style={{ gap: 6 }}>
        <Button label="Continue" onPress={onContinue} />
        <TextLink label="Keep my account" onPress={onKeep} />
      </View>
      <Text variant="label" style={{ textAlign: "center" }}>{helpLine()}</Text>
    </>
  );
}

/** What went wrong, what was kept, what to do, and a way to reach a person. */
function Problem({ problem, onReach, onRetry }: { problem: ProblemInfo; onReach: () => void; onRetry?: () => void }) {
  return (
    <View style={styles.problem} accessibilityRole="alert">
      <Text style={styles.problemTitle}>{problem.title}</Text>
      <Text variant="body">{problem.message}</Text>
      <Text variant="bodyMuted">{helpLine()}</Text>
      {onRetry ? <Button label="Try again" onPress={onRetry} /> : null}
      {helpMailto() ? <TextLink label="Email a person" onPress={onReach} /> : null}
    </View>
  );
}

function Done({ onContinue }: { onContinue: () => void }) {
  return (
    <View style={{ gap: 16 }}>
      <View style={[styles.card, styles.soft, { alignItems: "center" }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
        <People name="mailSent" width={190} />
        <Text variant="h2" style={{ textAlign: "center" }}>All done</Text>
        <Text variant="bodyMuted" style={{ textAlign: "center" }}>
          Your account is deleted, your monthly donations are cancelled, and you are signed out. We&apos;ve emailed you a confirmation of what was deleted and what we kept.
        </Text>
      </View>
      <Button label="Back to Givezy" onPress={onContinue} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  back: { width: 44, height: 44, marginLeft: -10, alignItems: "center", justifyContent: "center" },
  headTitle: { fontFamily: fonts.displayBold, fontSize: 32, lineHeight: 37, letterSpacing: -0.4, color: colors.onInk, paddingRight: 30 },
  headLine: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23, color: colors.lilacSoft, paddingRight: 40 },
  card: { gap: 12, padding: 20, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface, overflow: "hidden" },
  soft: { backgroundColor: colors.lilacSoft, borderColor: colors.lilacSoft },
  blueCard: { backgroundColor: colors.blue, borderColor: colors.blue },
  blueTitle: { fontFamily: fonts.displayBold, fontSize: 24, lineHeight: 29, color: colors.onInk },
  blueLine: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 23, color: colors.onInk, paddingRight: 28 },
  bullet: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.blue, marginTop: 9 },
  problem: { gap: 10, padding: 20, borderRadius: radius.card, borderWidth: 2, borderColor: colors.danger, backgroundColor: colors.surface },
  problemTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 26, color: colors.danger },
});

/** A failure while drawing shows "Try again" and the error, not a blank page. */
export { ScreenError as ErrorBoundary } from "@/components/screen-error";
