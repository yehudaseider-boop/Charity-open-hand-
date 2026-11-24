"use client";

import Link from "next/link";
import { storageKey } from "@/lib/assistant/storage-key";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { parseAnswer, type Block, type Inline } from "@/lib/assistant/answer";
import { followUps, splitNext, startingSuggestions } from "@/lib/assistant/suggestions";

/**
 * The Givezy helper on every charity dashboard page (21/11/2026; looks things up since 22/11/2026): a round white
 * button with the Givezy splash opens a panel where staff ask about their charity's giving, what's left to set up, or
 * how to do something, and get a short answer with links straight to the right page. It reads only, as the person
 * asking, and can't change anything, and says so. The conversation stays while they move between pages, for this
 * browser tab and this person only. Every state is designed: waiting, looking up, answering, stopped, offline,
 * refused, too many questions.
 */

/** `next`: the lookups an answer used, for its follow-up questions (22/11/2026). */
type Turn = { role: "user" | "assistant"; content: string; failed?: boolean; next?: string[] };

const ERROR_MARK = "[[error]]";
const noSubscribe = () => () => {};

/** One saved chat per person and charity, so someone signing in next on the same tab never sees it (review 21/11/2026). */

function Parts({ parts, onLink }: { parts: Inline[]; onLink: () => void }) {
  return (
    <>
      {parts.map((p, i) =>
        p.kind === "link" ? (
          <Link key={i} href={p.href} onClick={onLink} className="font-semibold text-brand underline underline-offset-2">
            {p.text}
          </Link>
        ) : p.kind === "bold" ? (
          <strong key={i} className="font-semibold">{p.text}</strong>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function Answer({ blocks, onLink }: { blocks: Block[]; onLink: () => void }) {
  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) =>
        b.kind === "para" ? (
          <p key={i}><Parts parts={b.parts} onLink={onLink} /></p>
        ) : b.ordered ? (
          <ol key={i} className="list-decimal space-y-1.5 pl-5">{b.items.map((it, j) => <li key={j}><Parts parts={it} onLink={onLink} /></li>)}</ol>
        ) : (
          <ul key={i} className="list-disc space-y-1.5 pl-5">{b.items.map((it, j) => <li key={j}><Parts parts={it} onLink={onLink} /></li>)}</ul>
        ),
      )}
    </div>
  );
}

export function HelpAssistant({
  charityId,
  who,
  names = false,
  demo = false,
  live = false,
  base,
  whatsApp,
  email,
}: {
  charityId?: string;
  /** The signed-in person's id: the saved chat is theirs only. */
  who?: string;
  /** Givy can see donors' names (ASSISTANT_DONOR_DATA): the saved chat is kept apart from one made without. */
  names?: boolean;
  demo?: boolean;
  /** The charity takes donations (approved): its starting questions lead with donations, not setting up. */
  live?: boolean;
  /** This dashboard's address ("/charity-admin/<id>" or "/demo/dashboard"), for the answer's links. */
  base: string;
  /** A WhatsApp chat link to the Givezy team, and the team's email. */
  whatsApp: string | null;
  email: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  const abort = useRef<AbortController | null>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const key = storageKey(charityId, demo, who, names);

  // The conversation survives moving between pages and a reload, in this tab only: read back when the panel opens.
  const loaded = useRef(false);
  const openPanel = () => {
    if (!loaded.current) {
      loaded.current = true;
      try {
        const saved = sessionStorage.getItem(key);
        if (saved) setTurns((JSON.parse(saved) as Turn[]).filter((t) => t && typeof t.content === "string" && !t.failed).slice(-20));
      } catch {
        /* private window or blocked storage: start empty */
      }
    }
    setOpen(true);
  };
  useEffect(() => {
    // Not until the saved conversation has been read back, so it is never overwritten with an empty one.
    if (busy || !loaded.current) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(turns.slice(-20)));
    } catch {
      /* not kept: fine */
    }
  }, [turns, busy, key]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);
  useEffect(() => {
    if (turns.length > 0) scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [turns, open]);
  // Room at the very end of the page (the footer included), so the last line always scrolls clear of the round button.
  useEffect(() => {
    document.body.classList.add("has-givy");
    return () => document.body.classList.remove("has-givy");
  }, []);
  // Drawn straight into the page body, so the dashboard's own layout can never trap or clip it.
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => launcher.current?.focus());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  async function ask(question: string, history: Turn[]) {
    const q = question.trim();
    if (!q || busy) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setNotice("You're offline, so the question wasn't sent. Your words are kept: check your connection and press Send again.");
      return;
    }
    setNotice(null);
    setDraft("");
    const asked: Turn[] = [...history.filter((t) => !t.failed), { role: "user", content: q }];
    setTurns([...asked, { role: "assistant", content: "" }]);
    setBusy(true);
    setAnnounce("Looking that up");
    const controller = new AbortController();
    abort.current = controller;
    let text = "";
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ charityId, demo, page: pathname, messages: asked.map(({ role, content }) => ({ role, content })) }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        let message = "We couldn't get an answer just now. Nothing was changed. Please try again.";
        try {
          message = ((await res.json()) as { message?: string }).message ?? message;
        } catch {
          /* keep the plain message */
        }
        setTurns([...asked.slice(0, -1)]);
        setDraft(q);
        setNotice(message);
        setAnnounce(message);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setTurns([...asked, { role: "assistant", content: splitNext(text.replace(ERROR_MARK, "")).text }]);
      }
      if (text.includes(ERROR_MARK)) {
        const partial = text.replace(ERROR_MARK, "").trim();
        setTurns([...asked, { role: "assistant", content: partial || "We couldn't finish that answer. Nothing was changed.", failed: true }]);
        setAnnounce("The answer didn't finish");
      } else {
        const { text: answer, tools } = splitNext(text);
        setTurns([...asked, { role: "assistant", content: answer, ...(tools ? { next: tools } : {}) }]);
        setAnnounce("Answer ready");
      }
    } catch (e) {
      const stopped = e instanceof DOMException && e.name === "AbortError";
      const partial = splitNext(text.replace(ERROR_MARK, "")).text.trim();
      if (stopped) {
        setTurns([...asked, { role: "assistant", content: partial ? `${partial}\n\n(Stopped.)` : "(Stopped before an answer.)" }]);
        setAnnounce("Stopped");
      } else {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        setTurns([
          ...asked,
          { role: "assistant", content: offline ? "The connection dropped before the answer arrived. Nothing was changed." : "We couldn't reach Givy. Nothing was changed.", failed: true },
        ]);
        setAnnounce("The answer didn't arrive");
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  const lastQuestion = [...turns].reverse().find((t) => t.role === "user")?.content ?? "";
  const askedSoFar = turns.filter((t) => t.role === "user").map((t) => t.content);
  const lastFailed = turns.length > 0 && turns[turns.length - 1].failed;
  const onLink = () => {
    // On a phone the panel covers the page: close it so the page that was linked to shows.
    if (window.matchMedia("(max-width: 639px)").matches) setOpen(false);
  };
  const tooLong = draft.length > 800;

  if (!mounted) return null;
  return createPortal(
    <div className="print:hidden">
      {!open ? (
        <button
          ref={launcher}
          type="button"
          onClick={openPanel}
          aria-haspopup="dialog"
          aria-label="Ask Givy, your Givezy helper"
          title="Ask Givy"
          className="group fixed bottom-4 right-4 z-40 grid h-16 w-16 place-items-center rounded-full border-2 border-border bg-white shadow-[0_5px_0_var(--border),0_16px_34px_rgba(14,27,61,0.22)] transition-[transform,box-shadow] duration-150 hover:-translate-y-0.5 hover:shadow-[0_7px_0_var(--border),0_20px_40px_rgba(14,27,61,0.26)] active:translate-y-1 active:shadow-[0_1px_0_var(--border),0_8px_18px_rgba(14,27,61,0.2)] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-coral motion-reduce:transition-none sm:bottom-6 sm:right-6"
        >
          {/* The splash from the logo, cut from the logo file (never redrawn). A soft ring breathes once on arrival. */}
          <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full ring-4 ring-honey/50 animate-[helper-hello_1.6s_ease-out_1] motion-reduce:animate-none" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/splash.png" alt="" aria-hidden width={640} height={451} className="w-10 select-none transition-transform duration-200 group-hover:scale-110 group-hover:-rotate-6 motion-reduce:transition-none" />
        </button>
      ) : null}

      {open ? (
        <section
          role="dialog"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 flex flex-col bg-surface text-navy sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(42rem,calc(100dvh-3rem))] sm:w-[26rem] sm:overflow-hidden sm:rounded-card sm:border-2 sm:border-border sm:shadow-[0_30px_70px_rgba(6,22,70,0.28)]"
        >
          <header className="flex items-start gap-3 bg-brand px-5 pb-4 pt-[max(1rem,env(safe-area-inset-top))] text-white">
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="flex items-center gap-2.5 font-display text-[1.25rem] font-bold leading-tight text-white!">
                <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/splash.png" alt="" width={640} height={451} className="w-6" />
                </span>
                Givy
              </h2>
              <p className="mt-1 text-[13px] text-white/85">Your donations, what&apos;s left to set up, and how to do things.</p>
            </div>
            {turns.length > 0 && !busy ? (
              <button type="button" onClick={() => { setTurns([]); setNotice(null); }} className="min-h-10 rounded-full px-3 text-[13px] font-semibold text-white/90 hover:bg-white/10">
                New chat
              </button>
            ) : null}
            <button type="button" onClick={close} aria-label="Close Givy" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10">
              <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>

          <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto overscroll-contain bg-honey-soft/50 px-4 py-4 text-[15px] leading-relaxed">
            {turns.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-[1.25rem] bg-surface p-4 shadow-sm">
                  <p className="font-semibold">Hi, I&apos;m Givy. Ask me about your charity&apos;s donations, what&apos;s left to set up, or how to do something in your dashboard.</p>
                  <p className="mt-1.5 text-[14px] text-muted">I see what you see on your dashboard, and I&apos;ll link you to the right page. I can&apos;t change, send or approve anything.</p>
                </div>
                <div>
                  <p className="mb-2 text-[13px] font-semibold text-muted">Try asking</p>
                  <ul className="flex flex-wrap gap-2">
                    {startingSuggestions(live).map((s) => (
                      <li key={s}>
                        <button type="button" onClick={() => ask(s, turns)} className="min-h-10 rounded-full border-2 border-border bg-surface px-3.5 py-1.5 text-left text-[14px] font-semibold text-brand hover:border-brand">
                          {s}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : (
              turns.map((t, i) =>
                t.role === "user" ? (
                  <div key={i} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-[1.25rem] rounded-br-md bg-brand px-4 py-2.5 text-white" dir="auto">
                    {t.content}
                  </div>
                ) : (
                  <div key={i} className={`max-w-[92%] rounded-[1.25rem] rounded-bl-md bg-surface px-4 py-3 shadow-sm ${t.failed ? "border-2 border-danger-soft" : ""}`}>
                    {t.content ? (
                      <Answer blocks={parseAnswer(t.content, base)} onLink={onLink} />
                    ) : (
                      <p className="flex items-center gap-2 text-muted">
                        <span aria-hidden className="flex gap-1">
                          <span className="h-2 w-2 animate-bounce rounded-full bg-brand/60 [animation-delay:-0.2s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-brand/60 [animation-delay:-0.1s]" />
                          <span className="h-2 w-2 animate-bounce rounded-full bg-brand/60" />
                        </span>
                        Looking that up
                      </p>
                    )}
                    {/* What to ask next, fitting what was just looked up: under the newest answer only. */}
                    {!busy && !t.failed && t.next && i === turns.length - 1 ? (
                      <ul aria-label="Ask next" className="mt-3 flex flex-wrap gap-2 border-t-2 border-border pt-3">
                        {followUps(t.next, askedSoFar, live).map((s) => (
                          <li key={s}>
                            <button type="button" onClick={() => ask(s, turns)} className="min-h-10 rounded-full border-2 border-border bg-surface px-3 py-1 text-left text-[13px] font-semibold text-brand hover:border-brand">
                              {s}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {t.failed && i === turns.length - 1 ? (
                      <button type="button" onClick={() => ask(lastQuestion, turns.slice(0, -2))} className="mt-3 inline-flex min-h-10 items-center rounded-control border-2 border-brand px-4 text-[14px] font-bold text-brand hover:bg-brand-soft">
                        Try again
                      </button>
                    ) : null}
                  </div>
                ),
              )
            )}
            <p aria-live="polite" className="sr-only">{announce}</p>
          </div>

          <div className="border-t-2 border-border bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
            {notice ? <p role="alert" className="mb-2 rounded-control bg-warning-soft px-3 py-2 text-[14px] text-navy">{notice}</p> : null}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!tooLong) ask(draft, lastFailed ? turns.slice(0, -2) : turns);
              }}
              className="flex items-end gap-2"
            >
              <label htmlFor={`${titleId}-q`} className="sr-only">Your question</label>
              <textarea
                id={`${titleId}-q`}
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    if (!tooLong) ask(draft, lastFailed ? turns.slice(0, -2) : turns);
                  }
                }}
                rows={1}
                placeholder="Ask about donations or setup"
                aria-invalid={tooLong || undefined}
                className="max-h-32 min-h-12 flex-1 resize-none rounded-control border-2 border-outline bg-surface px-3.5 py-3 text-[15px] text-navy outline-none [field-sizing:content] focus:border-brand"
                dir="auto"
              />
              {busy ? (
                <button type="button" onClick={() => abort.current?.abort()} className="min-h-12 rounded-control border-2 border-navy/25 px-4 text-[15px] font-bold text-navy">
                  Stop
                </button>
              ) : (
                <button type="submit" disabled={!draft.trim() || tooLong} className="min-h-12 rounded-control bg-brand px-5 text-[15px] font-bold text-white shadow-[0_4px_0_#0b2a73] disabled:opacity-50 disabled:shadow-none">
                  Send
                </button>
              )}
            </form>
            {tooLong ? <p className="mt-1.5 text-[13px] text-danger">Please keep it under 800 characters ({draft.length} now).</p> : null}
            <p className="mt-2.5 text-[12px] leading-snug text-muted">
              Givy can get things wrong, so check the page before you act. Please don&apos;t type donors&apos; contact or ID details here.
              {whatsApp || email ? <> Need a person? </> : null}
              {whatsApp ? <a href={whatsApp} target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline">WhatsApp us</a> : null}
              {whatsApp && email ? " or " : null}
              {email ? <a href={`mailto:${email}`} className="font-semibold text-brand underline">email us</a> : null}
              {whatsApp || email ? "." : null}
            </p>
          </div>
        </section>
      ) : null}
    </div>,
    document.body,
  );
}
