import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import type { Charity } from "@/data/sample";
import { causeList } from "@/lib/directory";
import { haptic } from "@/lib/haptics";
import { useSaved } from "@/lib/saved";
import { colors, fonts, radius, space, touch } from "@/theme/tokens";
import { CharityImage } from "./charity-image";
import { CheckedBadge } from "./charity-photo-card";
import { HeartIcon } from "./icons";
import { PressableScale } from "./pressable-scale";
import { Text } from "./text";

const GAP = 12;

/**
 * Charities as stories to swipe through (11/11/2026): a big photo, the name and what they do, with Save and Give
 * on the card. A page at a time, a soft tick as each one arrives, and dots to show where you are. Tapping a card
 * opens the charity; Give goes straight to giving.
 */
export function StoryDeck({ charities, live, onGive }: { charities: Charity[]; live: boolean; onGive: (c: Charity) => void }) {
  const { width } = useWindowDimensions();
  const saved = useSaved();
  const cardW = Math.min(width - space.gutter * 2, 420);
  const snap = cardW + GAP;
  const [index, setIndex] = useState(0);
  const last = useRef(0);
  if (!charities.length) return null;
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.head}>
        <Text style={styles.title} accessibilityRole="header">
          Swipe to <Text style={[styles.title, { color: colors.blue }]}>explore</Text>
        </Text>
        <Text variant="label" accessibilityLiveRegion="polite">{index + 1} of {charities.length}</Text>
      </View>
      <ScrollView
        horizontal
        snapToInterval={snap}
        decelerationRate="fast"
        snapToAlignment="start"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: space.gutter, gap: GAP }}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const i = Math.max(0, Math.min(charities.length - 1, Math.round(e.nativeEvent.contentOffset.x / snap)));
          if (i !== last.current) {
            last.current = i;
            setIndex(i);
            haptic.tap();
          }
        }}
      >
        {charities.map((c) => {
          const on = saved.isSaved(c.slug);
          const cause = causeList().find((x) => x.id === c.causeId)?.label;
          const kicker = [cause, c.area].filter(Boolean).join(" · ");
          return (
            <PressableScale
              key={c.slug}
              onPress={() => router.push(`/charity/${c.slug}`)}
              accessibilityRole="button"
              accessibilityLabel={`${c.nameEn}. ${c.cause}`}
              // The Save and Give buttons inside the card are offered as actions on it, so screen readers reach them.
              accessibilityActions={[
                { name: "save", label: on ? `Remove ${c.nameEn} from your saved charities` : `Save ${c.nameEn}` },
                { name: "give", label: `Give to ${c.nameEn}` },
              ]}
              onAccessibilityAction={(e) => {
                if (e.nativeEvent.actionName === "save") void saved.toggle(c.slug);
                if (e.nativeEvent.actionName === "give") onGive(c);
              }}
              style={{ ...styles.card, width: cardW }}
              to={0.98}
            >
              <CharityImage charity={c} live={live} rounded={false} bare veil style={StyleSheet.absoluteFill} />
              <LinearGradient colors={[colors.inkClear, colors.inkVeil]} locations={[0.35, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
              <CheckedBadge issues18a={c.issues18a} style={styles.badge} />
              <View style={styles.body}>
                {kicker ? <Text style={styles.kicker} numberOfLines={1}>{kicker}</Text> : null}
                <Text style={styles.name} numberOfLines={2}>{c.nameEn}</Text>
                <Text style={styles.line} numberOfLines={2}>{c.cause}</Text>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => {
                      haptic.tap();
                      void saved.toggle(c.slug);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={on ? `Remove ${c.nameEn} from your saved charities` : `Save ${c.nameEn}`}
                    accessibilityState={{ selected: on }}
                    hitSlop={6}
                    style={styles.save}
                  >
                    <HeartIcon size={24} color={colors.blue} filled={on} />
                  </Pressable>
                  <Pressable onPress={() => onGive(c)} accessibilityRole="button" accessibilityLabel={`Give to ${c.nameEn}`} style={({ pressed }) => [styles.give, pressed && { borderBottomWidth: 2, marginTop: 3 }]}>
                    <Text style={styles.giveText}>Give</Text>
                  </Pressable>
                </View>
              </View>
            </PressableScale>
          );
        })}
      </ScrollView>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {charities.map((c, i) => <View key={c.slug} style={[styles.dot, i === index && styles.dotOn]} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingHorizontal: space.gutter },
  title: { fontFamily: fonts.display, fontSize: 24, lineHeight: 29, letterSpacing: -0.3, color: colors.navy },
  card: { height: 400, borderRadius: radius.card, overflow: "hidden", backgroundColor: colors.blue, justifyContent: "flex-end" },
  badge: { position: "absolute", left: 14, top: 14 },
  body: { padding: 20, gap: 4 },
  kicker: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.lilac },
  name: { fontFamily: fonts.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.5, color: colors.onInk },
  line: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22, color: colors.lilacSoft },
  actions: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 },
  save: { width: touch + 4, height: touch + 4, borderRadius: (touch + 4) / 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  give: { flex: 1, minHeight: 52, borderRadius: radius.control, backgroundColor: colors.orange, borderBottomWidth: 5, borderBottomColor: colors.navy, alignItems: "center", justifyContent: "center" },
  giveText: { fontFamily: fonts.bodyBold, fontSize: 18, color: colors.navy },
  dots: { flexDirection: "row", justifyContent: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.lightPurple },
  dotOn: { width: 22, backgroundColor: colors.orange },
});
