import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useAccount } from "@/lib/account";
import { cleanCode, looksLikeEmail } from "@/lib/live-giving";
import { openSite } from "@/lib/open-site";
import { colors, radius, type } from "@/theme/tokens";
import { Button, TextLink } from "./button";
import { Field } from "./field";
import { Text } from "./text";

/**
 * Google and Apple sign-in show only once they are set up in Supabase (and Apple's and Google's
 * consoles): EXPO_PUBLIC_SOCIAL_SIGN_IN=yes. Until then, email sign-in only.
 */
const SOCIAL_SIGN_IN = process.env.EXPO_PUBLIC_SOCIAL_SIGN_IN === "yes";

const SOMETHING_WRONG = "Something went wrong. Please check your connection and try again.";

/**
 * Runs one sign-in step with the buttons switched off, and always switches them back on: a step
 * that throws shows the general error instead of leaving every button disabled.
 */
async function step(
  setBusy: (b: boolean) => void,
  setError: (e: string | null) => void,
  go: () => Promise<{ ok: true } | { ok: false; message: string }>,
  onOk?: () => void,
) {
  setBusy(true);
  setError(null);
  try {
    const r = await go();
    if (r.ok) onOk?.();
    else setError(r.message);
  } catch {
    setError(SOMETHING_WRONG);
  } finally {
    setBusy(false);
  }
}

/**
 * Sign in: Google or Apple when switched on, else an emailed 6-digit code. No password. The same
 * account as the website. Sits under the blue "Let's get you set up." header on Account.
 */
export function SignIn() {
  const account = useAccount();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const social = (provider: "google" | "apple") => step(setBusy, setError, () => account.signInWith(provider));

  if (!sentTo) {
    return (
      <View style={styles.card}>
        {SOCIAL_SIGN_IN ? (
          <>
            <Button variant="white" label="Continue with Google" disabled={busy} onPress={() => social("google")} />
            <Button variant="dark" label="Continue with Apple" disabled={busy} onPress={() => social("apple")} />
            <View style={styles.or}>
              <View style={styles.rule} />
              <Text variant="label">or use email</Text>
              <View style={styles.rule} />
            </View>
          </>
        ) : (
          <Text variant="bodyMuted">Use the email you give with. Every gift made with it, on the website or in the app, shows up here.</Text>
        )}
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" error={error ?? undefined} />
        <Button
          label={busy ? "Sending…" : "Send me a sign-in code"}
          disabled={busy}
          onPress={async () => {
            if (!looksLikeEmail(email)) return setError("Enter a valid email address.");
            await step(setBusy, setError, () => account.sendCode(email), () => setSentTo(email.trim()));
          }}
        />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text variant="h2" style={styles.title}>Check your email</Text>
      <Text variant="bodyMuted">We sent a 6-digit code to {sentTo}. It works once and expires soon.</Text>
      <Field label="Code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={7} error={error ?? undefined} />
      <Button
        label={busy ? "Checking…" : "Sign in"}
        disabled={busy}
        onPress={async () => {
          const c = cleanCode(code);
          if (!c) return setError("Enter the 6 digits from the email.");
          await step(setBusy, setError, () => account.verifyCode(sentTo, c));
        }}
      />
      <TextLink label="Use a different email" onPress={() => { setSentTo(null); setCode(""); setError(null); }} />
    </View>
  );
}

/** Agree to the Terms and Privacy Policy (once per version), as on the website. */
export function Agree() {
  const account = useAccount();
  const [terms, setTerms] = useState(false);
  const [age, setAge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = (path: string) => openSite(path);

  return (
    <View style={styles.card}>
      <Text variant="h2" style={styles.title}>Before you continue</Text>
      <Text variant="bodyMuted">
        We keep your email and your giving records so you can see them here. Only you see your giving goal and the labels you give your donations. We never sell your
        information or send you marketing.
      </Text>
      <Check checked={terms} onPress={() => setTerms((v) => !v)} label="I agree to the Terms and the Privacy Policy." />
      <View style={{ flexDirection: "row", gap: 16, paddingLeft: 36 }}>
        <TextLink label="Read the Terms" onPress={() => open("/terms")} />
        <TextLink label="Privacy Policy" onPress={() => open("/privacy")} />
      </View>
      <Check checked={age} onPress={() => setAge((v) => !v)} label="I am 18 or older." />
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      <Button
        label={busy ? "Saving…" : "Continue"}
        disabled={!terms || !age || busy}
        style={!terms || !age ? { opacity: 0.4 } : undefined}
        onPress={() => step(setBusy, setError, () => account.agree())}
      />
      <TextLink label="Sign out" onPress={() => account.signOut()} />
    </View>
  );
}

function Check({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked }} style={styles.check}>
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Text style={{ color: colors.onInk, fontSize: 14 }}>✓</Text> : null}</View>
      <Text style={[type.body, { flex: 1, fontSize: 16 }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 20, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.lightPurple, backgroundColor: colors.surface },
  or: { flexDirection: "row", alignItems: "center", gap: 10 },
  rule: { flex: 1, height: 1.5, backgroundColor: colors.lightPurple },
  title: { fontSize: 22, lineHeight: 28 },
  check: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.lilac, alignItems: "center", justifyContent: "center", marginTop: 2 },
  boxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
});
