import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import { useAccount } from "@/lib/account";
import { cleanCode, looksLikeEmail } from "@/lib/live-giving";
import { SITE_URL, siteUrl } from "@/lib/website";
import { colors, radius, type } from "@/theme/tokens";
import { Button, TextLink } from "./button";
import { Field } from "./field";
import { Text } from "./text";

/** Sign in with an emailed 6-digit code. No password. The same account as the website. */
export function SignIn() {
  const account = useAccount();
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!sentTo) {
    return (
      <View style={styles.card}>
        <Text variant="h2" style={styles.title}>Sign in</Text>
        <Text variant="bodyMuted">
          Use the email you give with. Every donation made with it, on the website or from the app, shows up here with your maaser and chomesh.
        </Text>
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" error={error ?? undefined} />
        <Button
          label={busy ? "Sending…" : "Email me a code"}
          disabled={busy}
          onPress={async () => {
            if (!looksLikeEmail(email)) return setError("Enter a valid email address.");
            setBusy(true);
            setError(null);
            const r = await account.sendCode(email);
            setBusy(false);
            if (r.ok) setSentTo(email.trim());
            else setError(r.message);
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
          setBusy(true);
          setError(null);
          const r = await account.verifyCode(sentTo, c);
          setBusy(false);
          if (!r.ok) setError(r.message);
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
  const open = (path: string) => {
    const url = siteUrl(SITE_URL, path);
    if (url) Linking.openURL(url).catch(() => undefined);
  };

  return (
    <View style={styles.card}>
      <Text variant="h2" style={styles.title}>Before you continue</Text>
      <Text variant="bodyMuted">
        We keep your email and your giving records so you can see them here. Only you see your maaser and chomesh. We never sell your
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
        onPress={async () => {
          setBusy(true);
          const r = await account.agree();
          setBusy(false);
          if (!r.ok) setError(r.message);
        }}
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
  card: { gap: 14, padding: 20, borderRadius: radius.card, borderWidth: 1, borderColor: colors.hairline, backgroundColor: colors.surface },
  title: { fontSize: 22, lineHeight: 28 },
  check: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 44 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, borderColor: colors.hairline, alignItems: "center", justifyContent: "center", marginTop: 2 },
  boxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
