import { router } from "expo-router";
import { useRef, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Backdrop } from "@/components/backdrop";
import { Button } from "@/components/button";
import { CheckIcon } from "@/components/icons";
import { Bubbles } from "@/components/people";
import { Splash } from "@/components/splash";
import { Text } from "@/components/text";
import { TopBar } from "@/components/top-bar";
import { UndoToast, type UndoMessage } from "@/components/undo-toast";
import { haptic } from "@/lib/haptics";
import { openPhoneSettings } from "@/lib/phone-reminders";
import { useReminder } from "@/lib/reminder";
import { REMINDER_DAYS, REMINDER_HOUR, ddmmyyyy, dayName, reminderMessage, reminderSummary, remindButton, type ReminderDay } from "@/lib/reminders";
import { colors, fonts, radius, space, touch } from "@/theme/tokens";

const UNDO_MS = 6_000;
const at = `${String(REMINDER_HOUR).padStart(2, "0")}:00`;

/**
 * The payday reminder (27/11/2026): choose a day, see the reminder exactly as it will look, and only then is the phone
 * asked. Apple gives one chance at that question, so the app never shows it cold: the button names what the donor
 * gets ("Remind me on the 25th"), and the phone's question follows as the confirmation. "Not now" is respected, and a
 * phone's "no" is explained, never asked again by the app.
 *
 * The same screen changes the day, shows when the next one goes off, and turns it off (with Undo).
 */
export default function ReminderScreen() {
  const insets = useSafeAreaInsets();
  const reminder = useReminder();
  const s = reminder.settings;
  const [day, setDay] = useState<ReminderDay>(s?.day ?? 25);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ kind: "done" | "problem"; text: string; settings?: boolean } | null>(null);
  const [undo, setUndo] = useState<UndoMessage | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set before anything is awaited: a second tap in the same moment can't ask the phone twice.
  const busyRef = useRef(false);
  const scroll = useRef<ScrollViewInstance>(null);

  const showUndo = (m: UndoMessage) => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(m);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  };

  const on = Boolean(s?.on);
  const next = reminder.state.kind === "set" ? reminder.state.next : null;
  // The phone needs asking again (after the app was put back): the same button asks.
  const changing = on && (s?.day !== day || reminder.state.kind === "ask");

  const remind = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setNote(null);
    try {
      const r = await reminder.start(day);
      if (r.ok) {
        haptic.success();
        setNote({ kind: "done", text: r.next ? `Done. We'll remind you on the ${dayName(day)}, starting ${ddmmyyyy(r.next)}.` : `Done. We'll remind you on the ${dayName(day)} of each month.` });
      } else if (r.reason === "denied") {
        haptic.soft();
        setNote({
          kind: "problem",
          text: "Your phone said no to reminders from Givezy, so none is set. If you change your mind, turn on notifications for Givezy in your phone's Settings, then come back here.",
          settings: true,
        });
      } else {
        haptic.soft();
        setNote({ kind: "problem", text: r.reason === "unavailable" ? "This version of the app can't set reminders. Update Givezy, then try again." : "Your reminder wasn't set just now. Nothing changed. Please try again." });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
      // The answer shows near the top: take the donor there.
      scroll.current?.scrollTo({ y: 0, animated: true });
    }
  };

  const notSaved = (what: string) => {
    haptic.soft();
    setNote({ kind: "problem", text: `${what} Nothing changed. Please try again.` });
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const turnOff = async () => {
    const r = await reminder.turnOff();
    if (!r) return;
    if (r === "not-saved") return notSaved("Your reminder wasn't turned off just now.");
    haptic.press();
    setNote(null);
    showUndo({
      text: "Reminder turned off. Nothing more will go off.",
      label: "Undo",
      run: () => {
        setUndo(null);
        void reminder.restore(r.previous).then((ok) => {
          if (!ok) notSaved("Your reminder couldn't be turned back on just now. It's still off.");
        });
      },
    });
  };

  const notNow = async () => {
    // Kept or not, the donor said no for now: leave the screen either way (the offer may simply come back).
    await reminder.notNow();
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/account");
  };

  if (!reminder.available) {
    return (
      <View style={styles.screen}>
        <Backdrop variant="page" />
        <TopBar title="Payday reminder" fallback="/(tabs)/account" />
        <View style={{ padding: space.gutter, gap: space.md }}>
          <View style={styles.card}>
            <Text style={styles.cardText}>
              {Platform.OS === "web" ? "Reminders work in the Givezy app on your phone." : "Reminders need the newest version of Givezy. Update the app from the App Store or Google Play, then come back here."}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const preview = reminderMessage(day);
  return (
    <View style={styles.screen}>
      <Backdrop variant="page" />
      <TopBar title="Payday reminder" fallback="/(tabs)/account" />
      <ScrollView ref={scroll} contentContainerStyle={{ paddingHorizontal: space.gutter, paddingTop: space.md, paddingBottom: insets.bottom + 96, gap: space.block }}>
        <View style={styles.hero}>
          <Bubbles
            items={[
              { size: 130, color: colors.peach, at: { right: -46, top: -44 } },
              { size: 14, color: colors.orange, float: true, at: { right: 30, top: 24 } },
            ]}
          />
          <Text style={styles.heroTitle} accessibilityRole="header">
            A gentle <Text style={styles.key}>nudge</Text> on payday
          </Text>
          <Text variant="bodyMuted" style={{ paddingRight: 30 }}>
            Once a month, on the day you choose. Never more, and not in a month you&apos;ve already given. It stays on this phone.
          </Text>
        </View>

        {on && s ? (
          <View style={styles.statusCard} accessibilityLiveRegion="polite">
            {reminder.state.kind === "blocked" ? (
              <>
                <Text style={styles.cardText}>Your reminder is on, but your phone has notifications from Givezy switched off, so nothing goes off.</Text>
                <Button variant="secondary" label="Open your phone's Settings" onPress={() => void openPhoneSettings()} />
              </>
            ) : reminder.state.kind === "ask" ? (
              <Text style={styles.cardText}>Your reminder is on, but your phone needs your yes again before it can go off. Press the button below.</Text>
            ) : reminder.state.kind === "failed" ? (
              <>
                <Text style={styles.cardText}>Your reminder is on, but your phone wouldn&apos;t set it just now, so nothing goes off yet.</Text>
                <Button variant="secondary" label="Try again" onPress={() => void reminder.retry()} />
              </>
            ) : (
              <Text style={styles.cardText}>{reminderSummary(s, next)}</Text>
            )}
          </View>
        ) : null}

        {/* What just happened, where the donor is looking: right under the reminder's own status. */}
        {note ? (
          <View style={note.kind === "done" ? styles.doneCard : styles.problem} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {note.kind === "done" ? <View style={styles.tick}><CheckIcon color={colors.onInk} /></View> : null}
            <View style={{ flex: 1, gap: 12 }}>
              <Text style={note.kind === "done" ? styles.doneText : styles.problemText}>{note.text}</Text>
              {note.settings ? <Button variant="secondary" label="Open your phone's Settings" onPress={() => void openPhoneSettings()} /> : null}
            </View>
          </View>
        ) : null}
        <View style={{ gap: 10 }}>
          <Text style={styles.sectionTitle}>{on ? "Change the day" : "Which day suits you?"}</Text>
          <View style={styles.days} accessibilityRole="radiogroup">
            {REMINDER_DAYS.map((d) => {
              const picked = d === day;
              return (
                <Pressable
                  key={String(d)}
                  onPress={() => {
                    haptic.tap();
                    setDay(d);
                    setNote(null);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: picked }}
                  style={[styles.day, picked && styles.dayOn]}
                >
                  <Text style={[styles.dayText, picked && { color: colors.onInk }]}>{d === "last" ? "Last day" : dayName(d)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* The reminder exactly as the phone will show it, before anything is asked. */}
        <View style={{ gap: 10 }}>
          <Text style={styles.sectionTitle}>What you&apos;ll see{day === "last" ? " on the last day of the month" : ` on the ${dayName(day)}`}, at {at}</Text>
          <View style={styles.preview} accessible accessibilityLabel={`Preview of the reminder: ${preview.body}`}>
            <View style={styles.previewIcon}><Splash size={22} /></View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <View style={styles.previewHead}>
                <Text style={styles.previewApp}>{preview.title}</Text>
                <Text style={styles.previewWhen}>{at}</Text>
              </View>
              <Text style={styles.previewBody}>{preview.body}</Text>
            </View>
          </View>
        </View>


        {!on || changing ? (
          <View style={{ gap: 10 }}>
            <Button variant="cta" label={busy ? "Setting your reminder…" : remindButton(day)} onPress={remind} disabled={busy} accessibilityState={{ busy }} />
            {!on ? <Text variant="label" style={{ textAlign: "center" }}>Your phone asks next. Givezy only uses it for this reminder.</Text> : null}
            {!on ? <Button variant="secondary" label="Not now" onPress={notNow} disabled={busy} /> : null}
          </View>
        ) : null}

        {on ? <Button variant="secondary" label="Turn off the reminder" onPress={turnOff} /> : null}
      </ScrollView>
      <UndoToast message={undo} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  hero: { backgroundColor: colors.lilacSoft, borderRadius: radius.card, padding: 22, paddingTop: 24, overflow: "hidden", gap: 10 },
  heroTitle: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 35, letterSpacing: -0.4, color: colors.navy, paddingRight: 40 },
  key: { fontFamily: fonts.displayBold, fontSize: 30, lineHeight: 35, letterSpacing: -0.4, color: colors.blue },
  sectionTitle: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 22, color: colors.navy },
  days: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  day: { minHeight: touch, minWidth: 64, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.outline, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  dayOn: { backgroundColor: colors.blue, borderColor: colors.blue },
  dayText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.blue },
  preview: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 22, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.hairline, shadowColor: colors.navy, shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 },
  previewIcon: { width: 38, height: 38, borderRadius: 9, backgroundColor: colors.lilacSoft, alignItems: "center", justifyContent: "center" },
  previewHead: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  previewApp: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.navy },
  previewWhen: { fontFamily: fonts.body, fontSize: 13, color: colors.muted },
  previewBody: { fontFamily: fonts.body, fontSize: 15, lineHeight: 20, color: colors.navy },
  card: { padding: 18, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
  statusCard: { padding: 18, borderRadius: radius.card, backgroundColor: colors.lilacSoft, gap: 12 },
  cardText: { fontFamily: fonts.bodySemibold, fontSize: 16, lineHeight: 23, color: colors.navy },
  doneCard: { flexDirection: "row", gap: 14, alignItems: "flex-start", padding: 18, borderRadius: radius.card, backgroundColor: colors.lilacSoft },
  tick: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sage, alignItems: "center", justifyContent: "center" },
  doneText: { fontFamily: fonts.bodySemibold, fontSize: 17, lineHeight: 24, color: colors.navy },
  problem: { flexDirection: "row", padding: 14, borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.danger, backgroundColor: colors.surface },
  problemText: { fontFamily: fonts.bodySemibold, fontSize: 16, lineHeight: 22, color: colors.danger },
});

export { ScreenError as ErrorBoundary } from "@/components/screen-error";
