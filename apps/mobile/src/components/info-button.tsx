import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { glossary, type GlossaryTerm } from "@shared/glossary";
import { colors, radius, space, touch } from "@/theme/tokens";
import { Button } from "./button";
import { InfoIcon } from "./icons";
import { Text } from "./text";

/**
 * A small "i" button that explains a term (maaser, chomesh, s18A...) in plain
 * English, for donors who don't know it. Opens a card over whatever screen or
 * sheet it sits in.
 */
export function InfoButton({ terms, label }: { terms: GlossaryTerm[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const name = label ?? glossary[terms[0]].title;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`What is ${name}?`}
        hitSlop={12}
        style={styles.button}
      >
        <InfoIcon size={18} color={colors.accent} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close" accessibilityRole="button" />
        <View style={styles.center} pointerEvents="box-none">
          <View style={styles.card} accessibilityViewIsModal>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 18 }}>
              {terms.map((t) => (
                <View key={t} style={{ gap: 6 }}>
                  <Text variant="h2" style={{ fontSize: 20, lineHeight: 26 }}>{glossary[t].title}</Text>
                  {glossary[t].body.map((p, i) => (
                    <Text key={i} variant="bodyMuted">{p}</Text>
                  ))}
                </View>
              ))}
            </ScrollView>
            <Button label="Got it" onPress={() => setOpen(false)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { minWidth: touch * 0.6, minHeight: touch * 0.6, alignItems: "center", justifyContent: "center" },
  backdrop: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(27,43,58,0.45)" },
  center: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, justifyContent: "center", padding: space.gutter },
  card: { gap: 18, padding: 22, borderRadius: radius.card, backgroundColor: colors.surface, maxWidth: 480, width: "100%", alignSelf: "center" },
});
