"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { parseAnswer, type Block, type Inline } from "@/lib/assistant/answer";

/**
 * "Need help?" on every charity dashboard page (21/11/2026): a panel where staff ask how to do something and get a
 * short answer from our dashboard guide, with links straight to the right page. It explains only: it can't see the
 * charity's data or change anything, and it says so. The conversation stays while they move between pages, and for
 * this browser tab only. Every state is designed: waiting, answering, stopped, offline, refused, too many questions.
 */

type Turn = { role: "user" | "assistant"; content: string; failed?: boolean };

const SUGGESTED = [
  "How do I add someone to my team?",
  "How do s18A receipts work here?",
  "How do I start a campaign?",
  "How do I thank my donors?",
  "How do I record a gift paid in cash?",
];

const ERROR_MARK = "[[error]]";
const noSubscribe = () => () => {};

function storageKey(charityId: string | undefined, demo: boolean) {
  return `givezy.helper.${demo ? "demo" : charityId}`;
}

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
  demo = false,
  base,
  whatsApp,
  email,
}: {
  charityId?: string;
  demo?: boolean;
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
  const key = storageKey(charityId, demo);

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
        const shown = text.replace(ERROR_MARK, "");
        setTurns([...asked, { role: "assistant", content: shown }]);
      }
      if (text.includes(ERROR_MARK)) {
        const partial = text.replace(ERROR_MARK, "").trim();
        setTurns([...asked, { role: "assistant", content: partial || "We couldn't finish that answer. Nothing was changed.", failed: true }]);
        setAnnounce("The answer didn't finish");
      } else {
        setAnnounce("Answer ready");
      }
    } catch (e) {
      const stopped = e instanceof DOMException && e.name === "AbortError";
      const partial = text.replace(ERROR_MARK, "").trim();
      if (stopped) {
        setTurns([...asked, { role: "assistant", content: partial ? `${partial}\n\n(Stopped.)` : "(Stopped before an answer.)" }]);
        setAnnounce("Stopped");
      } else {
        const offline = typeof navigator !== "undefined" && navigator.onLine === false;
        setTurns([
          ...asked,
          { role: "assistant", content: offline ? "The connection dropped before the answer arrived. Nothing was changed." : "We couldn't reach the helper. Nothing was changed.", failed: true },
        ]);
        setAnnounce("The answer didn't arrive");
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }

  const lastQuestion = [...turns].reverse().find((t) => t.role === "user")?.content ?? "";
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
          className="fixed bottom-4 right-4 z-40 inline-flex min-h-12 items-center gap-2 rounded-full bg-brand px-5 text-[15px] font-bold text-white shadow-[0_5px_0_#0b2a73,0_14px_30px_rgba(6,22,70,0.25)] transition-transform active:translate-y-0.5 sm:bottom-6 sm:right-6"
          aria-haspopup="dialog"
        >
          <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1v.5M12 16.5h.01" /></svg>
          Need help?
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
              <h2 id={titleId} className="font-display text-[1.25rem] font-bold leading-tight text-white!">Givezy helper</h2>
              <p className="mt-0.5 text-[13px] text-white/85">How to do things in your dashboard, with links to the right page.</p>
            </div>
            {turns.length > 0 && !busy ? (
              <button type="button" onClick={() => { setTurns([]); setNotice(null); }} className="min-h-10 rounded-full px-3 text-[13px] font-semibold text-white/90 hover:bg-white/10">
                New chat
              </button>
            ) : null}
            <button type="button" onClick={close} aria-label="Close the helper" className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10">
              <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </header>

          <div ref={scroller} className="flex-1 space-y-4 overflow-y-auto overscroll-contain bg-honey-soft/50 px-4 py-4 text-[15px] leading-relaxed">
            {turns.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-[1.25rem] bg-surface p-4 shadow-sm">
                  <p className="font-semibold">Hi. Ask me how to do anything in your Givezy dashboard.</p>
                  <p className="mt-1.5 text-[14px] text-muted">I explain and point you to the right page. I can&apos;t see your charity&apos;s donations or change anything for you.</p>
                </div>
                <div>
                  <p className="mb-2 text-[13px] font-semibold text-muted">Try asking</p>
                  <ul className="flex flex-wrap gap-2">
                    {SUGGESTED.map((s) => (
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
                placeholder="Ask how to do something"
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
              Answers come from our dashboard guide and can be wrong, so check before you act. Please don&apos;t type donors&apos; details here.
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
