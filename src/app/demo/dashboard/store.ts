"use client";

import { useSyncExternalStore } from "react";

/**
 * What a visitor does in the public dashboard demo (emails sent, thank-yous, team, profile, updates, recorded gifts),
 * kept only in their own browser: nothing reaches Givezy or anyone else. Every page reads and writes through here, so
 * one "Reset the demo" puts the whole demo back. Blocked storage (private browsing) still works on the page; it is
 * just gone after a reload.
 */

const PREFIX = "givezy-demo:";
const EVENT = "givezy-demo-change";
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

/** Saves a value; false when this browser won't keep it after a reload. */
export function writeDemo<T>(key: string, value: T): boolean {
  const raw = JSON.stringify(value);
  memory.set(key, raw);
  let kept = true;
  try {
    window.localStorage.setItem(PREFIX + key, raw);
  } catch {
    kept = false;
  }
  window.dispatchEvent(new Event(EVENT));
  return kept;
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The saved value for `key`, or `start` (also what the server shows before the page is in the browser). */
export function useDemo<T>(key: string, start: T): [T, (next: T) => boolean] {
  const raw = useSyncExternalStore(subscribe, () => read(key), () => null);
  let value = start;
  if (raw) {
    try {
      value = JSON.parse(raw) as T;
    } catch {
      value = start;
    }
  }
  return [value, (next: T) => writeDemo(key, next)];
}

/** Puts the whole demo back as it started: every page, every donor's notes. */
export function resetDemo(): void {
  memory.clear();
  try {
    for (const k of Object.keys(window.localStorage)) {
      if (k.startsWith(PREFIX) || k.startsWith("givezy-demo-care:")) window.localStorage.removeItem(k);
    }
  } catch {
    // Nothing kept, nothing to clear.
  }
  window.dispatchEvent(new Event(EVENT));
}

/** "dd/mm/yyyy hh:mm" now, in Johannesburg time. */
export function demoNow(): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value]),
  );
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/** A short random id for things made in the demo. */
export const demoId = () => Math.random().toString(36).slice(2, 10);

/** A moment's pause, so "Sending…" and "Saving…" show as they do in the real dashboard. */
export const pause = (ms = 600) => new Promise((r) => setTimeout(r, ms));
