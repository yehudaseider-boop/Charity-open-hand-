import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useAccount } from "./account";
import { MESSAGES_LIMIT, isMissingTable, markedRead, toMessages, type CharityMessage, type MessageRow } from "./charity-messages";
import { supabase } from "./supabase";

/**
 * The signed-in donor's messages from charities (24/11/2026). Read as them: row-level security returns only their own,
 * so nobody can see another donor's. Before the database change has run there are none (never an error). Read again
 * whenever the app comes back to the front, and on Try again.
 *
 * Preview (sample data, for reviewing screens): two sample messages, or `?messages=none|one|long` for each state.
 */

const sampleSent = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000);
function sampleMessages(which: string | undefined): CharityMessage[] {
  if (which === "none") return [];
  const short: CharityMessage = {
    id: "sample-1",
    charityName: "Northcliff Meals Fund",
    slug: "northcliff-meals-fund",
    subject: "Thank you for your gift this month",
    body: "Thank you for standing with the families we cook for. Your gift helps us keep the kitchen running each week, and it means a lot to our volunteers.",
    sentAt: sampleSent(0),
    read: false,
  };
  const long: CharityMessage = {
    id: "sample-2",
    charityName: "Linksfield Learning Centre and Holiday Reading Programme for Young Learners",
    slug: "linksfield-learning-centre",
    subject: "A thank-you from all of us at the learning centre, for this whole tax year of giving",
    body: [
      "Thank you for giving to the learning centre this tax year. Because of donors like you, our after-school classes stayed open through every term, and the reading corner is busy every afternoon.",
      "Our tutors asked us to pass on their thanks too. Many of them started as learners here, and they know what a steady place to learn means.",
      "If you are ever nearby, you are welcome to visit on a Saturday morning and see the classes for yourself. Reply to our email and we will set a time.",
      "Thank you for being part of this with us.",
    ].join("\n\n"),
    sentAt: sampleSent(9),
    read: true,
  };
  if (which === "one") return [short];
  if (which === "long") return [long];
  return [short, long];
}

export function useCharityMessages() {
  const account = useAccount();
  const preview = account.status === "preview";
  const signedIn = account.status === "signed-in";
  const live = supabase !== null && signedIn;
  // Same ?state=empty as the other screens (walk-through, 25/11/2026: it was ignored here); ?messages=none works as before.
  const { messages: asked, state } = useLocalSearchParams<{ messages?: string; state?: string }>();
  const which = asked ?? (state === "empty" ? "none" : undefined);
  const [loaded, setLoaded] = useState<{ owner: string; list: CharityMessage[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [sample, setSample] = useState<CharityMessage[] | null>(null);
  const owner = account.userId;

  useEffect(() => {
    if (!live) return;
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") setAttempt((n) => n + 1);
    });
    return () => sub.remove();
  }, [live]);

  useEffect(() => {
    if (!live || !owner) return;
    let current = true;
    (async () => {
      const { data, error } = await supabase!
        .from("donor_messages")
        .select("id, subject, body, sent_at, read_at, charities(name_en, slug)")
        .order("sent_at", { ascending: false })
        .limit(MESSAGES_LIMIT);
      if (!current) return;
      if (error && !isMissingTable(error)) {
        setFailed(true);
        return;
      }
      setFailed(false);
      setLoaded({ owner, list: error ? [] : toMessages((data ?? []) as MessageRow[]) });
    })().catch(() => current && setFailed(true));
    return () => {
      current = false;
    };
  }, [live, owner, attempt]);

  const retry = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  /** Marks one read: shown straight away; if saving fails it simply shows as new again next time. */
  const markRead = useCallback(
    (id: string) => {
      if (preview) {
        setSample((s) => markedRead(s ?? sampleMessages(which), id));
        return;
      }
      if (!live) return;
      setLoaded((l) => (l ? { ...l, list: markedRead(l.list, id) } : l));
      void Promise.resolve(supabase!.from("donor_messages").update({ read_at: new Date().toISOString() }).eq("id", id).is("read_at", null)).catch(() => undefined);
    },
    [preview, live, which],
  );

  if (preview) return { live: false, messages: sample ?? sampleMessages(which), failed: false, retry, markRead };
  // Someone else signed in on this phone: nothing until theirs has loaded.
  const messages = live && loaded?.owner === owner ? loaded.list : null;
  return { live, messages: live ? messages : [], failed: live && failed && !messages, retry, markRead };
}
