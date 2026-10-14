/** Display helpers for the portal. Rand and dates follow the house style: R1 250, R34.57, dd/mm/yyyy, Johannesburg time. */
import { formatRand } from "@/lib/money";
import { showDay } from "../data/day";
import { localDay } from "../data/generate";

export const rand = (cents: number) => formatRand(cents);

/** Whole Rand only, for big headline numbers ("R1 786 800"). Rounds half up. */
export const randWhole = (cents: number) => formatRand(Math.round(cents / 100) * 100);

/** Short Rand for chart axes: "R850", "R12k", "R1.8m". Display only. */
export function randShort(cents: number): string {
  const r = cents / 100;
  if (Math.abs(r) >= 1_000_000) return `R${trim(r / 1_000_000)}m`;
  if (Math.abs(r) >= 1_000) return `R${trim(r / 1_000)}k`;
  return `R${Math.round(r)}`;
}

function trim(n: number): string {
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}

/** ISO moment to Johannesburg "dd/mm/yyyy". */
export const date = (iso: string) => showDay(localDay(iso));

/** ISO moment to Johannesburg "dd/mm/yyyy 14:05". */
export function dateTime(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + 2 * 3600_000).toISOString();
  return `${showDay(shifted.slice(0, 10))} ${shifted.slice(11, 16)}`;
}

/** 1 000s separated by a space, SA style. */
export const count = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Permille to "62%" or "62.5%". */
export function permille(p: number): string {
  const whole = Math.trunc(p / 10);
  const tenth = Math.abs(p % 10);
  return tenth ? `${whole}.${tenth}%` : `${whole}%`;
}

/** Tenths-of-a-percent change to "+12.3%". */
export function change(tenths: number): string {
  const sign = tenths > 0 ? "+" : tenths < 0 ? "−" : "";
  const abs = Math.abs(tenths);
  return `${sign}${Math.trunc(abs / 10)}.${abs % 10}%`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${count(n)} ${n === 1 ? one : many}`;
}
