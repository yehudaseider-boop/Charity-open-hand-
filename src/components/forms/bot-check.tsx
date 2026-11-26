"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { botCheckConfig, type BotCheckAction } from "@/config/bot-check";
import { BOT_CHECK_WAITING, botCheckInteractiveMessage, botCheckLoadFailedMessage, type BotCheckKind } from "@/lib/bot-check-words";
import { ErrorMark } from "./fields";

/**
 * The browser's half of the bot check (Cloudflare Turnstile, 23/11/2026). Rendered only when the check is on (the
 * page passes the site key; see src/lib/bot-check.ts). Managed mode, shown only when Cloudflare wants a tick
 * ("interaction-only"): most people never see anything, and the token is ready long before they press the button.
 *
 * Two ways to use it:
 *  - guardForm (a plain server-action form, e.g. Sign in): the token goes in a hidden field. A press before the token
 *    is ready waits for it, then sends the form; a press when the check can't finish sends nothing and says why.
 *  - handleRef (a form that sends from its own code, e.g. Give): the form asks `token()` before sending and calls
 *    `used()` once the token is on its way.
 * A token is used once: after each press the check gets a fresh one, so pressing again after a refusal just works.
 *
 * Cloudflare's script (28 KB) is loaded only when the form is about to be used (24/11/2026): when the person touches
 * or focuses the form, when the check scrolls into view (if it was not already on screen), or at the latest when they press the
 * button (the press then waits for the token, as before). The server's check is unchanged: it still requires and
 * verifies the token, so a visitor who never triggers the load simply has no token and is refused there.
 */

export type BotCheckToken = { ok: true; token: string } | { ok: false };
export type BotCheckHandle = {
  /** The token, waiting briefly if it is on its way. Not ok when Cloudflare needs a tick or couldn't load. */
  token(): Promise<BotCheckToken>;
  /** The token has been sent: get a fresh one for the next press. */
  used(): void;
};

type Status = "loading" | "ready" | "interactive" | "failed";

type Turnstile = {
  render(el: HTMLElement, opts: Record<string, unknown>): string | undefined;
  reset(id: string): void;
  remove(id: string): void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

let loading: Promise<Turnstile> | null = null;

/**
 * Cloudflare's script, once per page, with the page's own nonce (the strict pages allow only scripts that carry it or
 * that a trusted script adds). The nonce is read from the document itself, so it is right even after moving between
 * pages without a full load. A failed load is forgotten, so Try again loads it afresh.
 */
function loadTurnstile(): Promise<Turnstile> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (loading) return loading;
  loading = new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = botCheckConfig.scriptUrl;
    s.async = true;
    const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;
    if (nonce) s.nonce = nonce;
    const fail = () => {
      window.clearTimeout(timer);
      s.remove();
      loading = null;
      reject(new Error("bot check unavailable"));
    };
    const timer = window.setTimeout(fail, botCheckConfig.scriptTimeoutMs);
    s.onload = () => {
      window.clearTimeout(timer);
      if (window.turnstile) resolve(window.turnstile);
      else fail();
    };
    s.onerror = fail;
    document.head.appendChild(s);
  });
  return loading;
}

export function BotCheck({
  siteKey,
  action,
  kind,
  button,
  guardForm = false,
  handleRef,
  className,
}: {
  siteKey: string;
  action: BotCheckAction;
  /** Which form, for "nothing was sent" or "nothing was charged". */
  kind: BotCheckKind;
  /** The button's own words, for "then press Give". */
  button: string;
  guardForm?: boolean;
  handleRef?: Ref<BotCheckHandle>;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  // The script is not loaded until the form is about to be used (see the note above).
  const [started, setStarted] = useState(false);
  const widget = useRef<string | null>(null);
  const tokenNow = useRef<string | null>(null);
  const statusNow = useRef<Status>("loading");
  const waiters = useRef<((t: BotCheckToken) => void)[]>([]);
  const [status, setStatusState] = useState<Status>("loading");
  // The hidden field's value (a plain form only). React owns it: a hidden field's value is its attribute, which React
  // would put back on the next render if it were set from outside.
  const [fieldValue, setFieldValue] = useState("");
  const field = useRef<HTMLInputElement>(null);
  const [waiting, setWaiting] = useState(false);
  const [offline, setOffline] = useState(false);
  // Try again starts the check afresh (a new script load if the last one failed, and a new widget).
  const [round, setRound] = useState(0);

  const setStatus = useCallback((s: Status) => {
    statusNow.current = s;
    setStatusState(s);
  }, []);
  const setToken = useCallback((t: string | null) => {
    tokenNow.current = t;
    setFieldValue(t ?? "");
  }, []);
  const settle = useCallback((t: BotCheckToken) => {
    const all = waiters.current.splice(0);
    for (const w of all) w(t);
    setWaiting(false);
  }, []);

  // Start the check when the form is touched, focused, or comes within a screen of the view.
  useEffect(() => {
    if (started) return;
    const go = () => setStarted(true);
    const form = outer.current?.closest("form") ?? null;
    const events = ["focusin", "pointerdown", "keydown", "touchstart"] as const;
    for (const e of events) form?.addEventListener(e, go, { once: true, passive: true });
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined" || !outer.current) go();
    else {
      // Already on screen when the page opens (a short sign-in form): wait for a touch or a keypress instead, so the
      // page's first seconds stay free of Cloudflare's script. Scrolled to later (the end of the long give form): start.
      let first = true;
      io = new IntersectionObserver(
        (entries) => {
          const near = entries.some((en) => en.isIntersecting);
          if (first) {
            first = false;
            if (near) return;
          }
          if (near) go();
        },
        { rootMargin: "200px 0px" },
      );
      io.observe(outer.current);
    }
    return () => {
      for (const e of events) form?.removeEventListener(e, go);
      io?.disconnect();
    };
  }, [started]);

  useEffect(() => {
    if (!started) return;
    let gone = false;
    loadTurnstile()
      .then((ts) => {
        if (gone || !box.current) return;
        widget.current =
          ts.render(box.current, {
            sitekey: siteKey,
            action,
            appearance: "interaction-only",
            size: "flexible",
            theme: "light",
            language: "en",
            "response-field": false,
            "refresh-expired": "auto",
            callback: (t: string) => {
              setToken(t);
              setStatus("ready");
              settle({ ok: true, token: t });
            },
            // An expired token is refreshed by Cloudflare by itself; until then there is none to send.
            "expired-callback": () => {
              setToken(null);
              setStatus("loading");
            },
            "before-interactive-callback": () => {
              setStatus("interactive");
              settle({ ok: false });
            },
            "after-interactive-callback": () => {
              if (!tokenNow.current) setStatus("loading");
            },
            "error-callback": () => {
              setToken(null);
              setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
              setStatus("failed");
              settle({ ok: false });
            },
            "unsupported-callback": () => {
              setStatus("failed");
              settle({ ok: false });
            },
          }) ?? null;
      })
      .catch(() => {
        if (gone) return;
        setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
        setStatus("failed");
        settle({ ok: false });
      });
    return () => {
      gone = true;
      try {
        if (widget.current) window.turnstile?.remove(widget.current);
      } catch {
        // Already gone with its box.
      }
      widget.current = null;
      setToken(null);
    };
  }, [started, siteKey, action, round, setStatus, setToken, settle]);

  const token = useCallback((): Promise<BotCheckToken> => {
    if (tokenNow.current) return Promise.resolve({ ok: true, token: tokenNow.current });
    if (statusNow.current !== "loading") return Promise.resolve({ ok: false });
    // A press before anything started it (a keyboard-less, touch-less submit): start now and wait for the token.
    setStarted(true);
    setWaiting(true);
    return new Promise<BotCheckToken>((resolve) => {
      const timer = window.setTimeout(() => {
        waiters.current = waiters.current.filter((w) => w !== done);
        setWaiting(false);
        // Still nothing after the wait: say so, with Try again, rather than leave the press hanging.
        setOffline(typeof navigator !== "undefined" && navigator.onLine === false);
        setStatus("failed");
        resolve({ ok: false });
      }, botCheckConfig.tokenWaitMs);
      const done = (t: BotCheckToken) => {
        window.clearTimeout(timer);
        resolve(t);
      };
      waiters.current.push(done);
    });
  }, [setStatus]);

  const used = useCallback(() => {
    setToken(null);
    if (widget.current && window.turnstile) {
      setStatus("loading");
      window.turnstile.reset(widget.current);
    }
  }, [setStatus, setToken]);

  useImperativeHandle(handleRef, () => ({ token, used }), [token, used]);

  // A plain form: hold a press until the token is in, then send it; after sending, get a fresh token for next time.
  useEffect(() => {
    if (!guardForm) return;
    const form = box.current?.closest("form");
    if (!form) return;
    const onSubmit = (e: SubmitEvent) => {
      if (tokenNow.current) {
        if (field.current) field.current.value = tokenNow.current;
        // Once the form has read the token (in this same press), clear it and fetch the next one.
        window.setTimeout(used, 0);
        return;
      }
      // A field the server will turn down anyway (an empty or mistyped email): let the press through without waiting for
      // the check, so the person hears what's wrong first, not "please tick the box" (QA 26/11/2026). The server checks
      // the fields before the token and sends nothing without one, so this never lets anything out unchecked.
      if (!form.checkValidity()) return;
      // Not ready: this press sends nothing yet (and the form's own code never sees it).
      e.preventDefault();
      e.stopImmediatePropagation();
      const submitter = e.submitter;
      void token().then((t) => {
        if (!t.ok || !form.isConnected) return;
        // The token may have arrived a moment before React shows it in the field: put it there now (the same value).
        if (field.current) field.current.value = t.token;
        form.requestSubmit(submitter instanceof HTMLElement && submitter.closest("form") === form ? submitter : undefined);
      });
    };
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, [guardForm, token, used]);

  const tryAgain = () => {
    setOffline(false);
    setStatus("loading");
    setRound((r) => r + 1);
  };

  return (
    <div ref={outer} className={className}>
      {guardForm ? <input ref={field} type="hidden" name={botCheckConfig.field} value={fieldValue} data-no-draft /> : null}
      {status === "interactive" ? <p className="mb-2 text-sm font-semibold text-navy">{botCheckInteractiveMessage(button)}</p> : null}
      {/* Cloudflare's box appears here only when it wants a tick; otherwise this takes no space. */}
      <div ref={box} key={round} />
      {waiting && status === "loading" ? <p role="status" className="text-center text-sm text-muted">{BOT_CHECK_WAITING}</p> : null}
      {status === "failed" ? (
        <div role="alert" className="space-y-2 rounded-control border-2 border-danger-soft p-4 text-sm">
          <p className="flex items-start gap-1.5 font-semibold text-danger"><ErrorMark /><span>{botCheckLoadFailedMessage(kind, offline)}</span></p>
          <button type="button" onClick={tryAgain} className="min-h-11 font-bold text-brand underline underline-offset-4">
            Try again
          </button>
        </div>
      ) : null}
    </div>
  );
}
