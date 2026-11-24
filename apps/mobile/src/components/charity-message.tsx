import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { initials } from "@shared/charity/initials";
import { SHORT_LINES, isLongMessage, sentWhen, type CharityMessage } from "@/lib/charity-messages";
import { colors, fonts, radius } from "@/theme/tokens";
import { ChevronIcon, MailIcon } from "./icons";
import { Text } from "./text";

/** On Account: the way to every message from charities, with how many are new. */
export function MessagesLink({ unread }: { unread: number }) {
  const sub = unread ? `${unread} new` : "Thank-yous from charities you gave to";
  return (
    <Pressable onPress={() => router.push("/messages")} accessibilityRole="button" accessibilityLabel={`Messages from your charities. ${sub}`} style={({ pressed }) => [linkStyles.card, pressed && { opacity: 0.85 }]}>
      <View style={linkStyles.icon}><MailIcon color={colors.blue} /></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={linkStyles.title}>Messages from your charities</Text>
        <Text variant="label">{sub}</Text>
      </View>
      <ChevronIcon color={colors.blue} />
    </Pressable>
  );
}

const linkStyles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 76, padding: 16, borderRadius: radius.card, backgroundColor: colors.surface, borderWidth: 1.5, borderColor: colors.lightPurple },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.lilacSoft, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.bodyBold, fontSize: 17, lineHeight: 22, color: colors.ink },
});

/**
 * One message from a charity the donor gave to (24/11/2026): who sent it and when, a "New" mark until it is read, the
 * subject and the charity's own words. A long message is shortened until "Read all" is pressed, which also marks it
 * read. "Their page" opens the charity, when it is listed.
 */
export function MessageCard({ message, today, onRead }: { message: CharityMessage; today: Date; onRead: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  // Whether the words run past the shortened view, so a short message has no "Read all".
  const long = isLongMessage(message.body);
  const toggle = () => {
    if (!open && !message.read) onRead(message.id);
    setOpen((o) => !o);
  };
  return (
    <View style={[styles.card, !message.read && styles.unread]}>
      <View style={styles.by}>
        <View style={styles.mark}>
          <Text style={styles.markText}>{initials(message.charityName)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={2}>{message.charityName}</Text>
          <Text style={styles.meta}>{sentWhen(message, today)} · Thank-you from the charity</Text>
        </View>
        {!message.read ? (
          <View style={styles.newPill} accessibilityLabel="New message">
            <Text style={styles.newText}>New</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.subject}>{message.subject}</Text>
      <Text
        style={styles.body}
        numberOfLines={open ? undefined : SHORT_LINES}
      >
        {message.body}
      </Text>
      <View style={styles.actions}>
        {long || open ? (
          <Pressable onPress={toggle} accessibilityRole="button" accessibilityState={{ expanded: open }} hitSlop={8} style={styles.action}>
            <Text style={styles.actionText}>{open ? "Show less" : "Read all"}</Text>
          </Pressable>
        ) : !message.read ? (
          <Pressable onPress={() => onRead(message.id)} accessibilityRole="button" hitSlop={8} style={styles.action}>
            <Text style={styles.actionText}>Mark as read</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {message.slug ? (
          <Pressable onPress={() => router.push(`/charity/${message.slug}`)} accessibilityRole="link" accessibilityLabel={`${message.charityName}'s page`} hitSlop={8} style={styles.action}>
            <Text style={styles.actionText}>Their page</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, borderWidth: 1.5, borderColor: colors.hairline, backgroundColor: colors.surface, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 6 },
  unread: { backgroundColor: colors.lilacSoft, borderColor: colors.lightPurple },
  by: { flexDirection: "row", alignItems: "center", gap: 12 },
  mark: { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.peach },
  markText: { fontFamily: fonts.displayBold, fontSize: 14, color: colors.blue },
  name: { fontFamily: fonts.bodyBold, fontSize: 16, lineHeight: 21, color: colors.ink },
  meta: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 19, color: colors.muted },
  newPill: { borderRadius: 999, backgroundColor: colors.blue, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" },
  newText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onInk },
  subject: { fontFamily: fonts.display, fontSize: 19, lineHeight: 24, color: colors.ink, marginTop: 12 },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 23, color: colors.ink, marginTop: 6 },
  actions: { flexDirection: "row", justifyContent: "space-between" },
  action: { minHeight: 44, justifyContent: "center" },
  actionText: { fontFamily: fonts.bodyBold, fontSize: 16, color: colors.blue },
});
