import { amountProblem } from "./amount-input";
import { ddmmyyyy, hhmm, jhbDay, rand } from "./format";

/**
 * Small rules of the give screen, kept out of the screen so they can be tested (22/11/2026, "try to break it" pass).
 * Only `format` and `amount-input` are imported, which the website's tests can run.
 */

/**
 * What is wrong with the gift amount, in the same words as the Give check, or null when it can be given.
 * `minCents` and `maxCents` are the charity's limits from our server (platform values), as the screen already uses.
 */
/** A Rand amount that never breaks over two lines ("R1 / 000 000"): its spaces don't break. */
const keepTogether = (cents: number) => rand(cents).replace(/ /g, "\u00A0");

/**
 * Nothing chosen yet (24/11/2026): the screen shows amount buttons and "Other amount", not a box, so "Enter an amount
 * in Rand" pointed at a field the donor couldn't see.
 */
export const CHOOSE_AN_AMOUNT = "Choose an amount, or tap Other amount to type your own";
/** The own-amount box is already open and empty (24/11/2026): "tap Other amount" would point at what they just did. */
export const TYPE_AN_AMOUNT = "Type an amount in Rand";

export function giftAmountError(text: string, cents: number | null, minCents: number, maxCents: number | null, ownAmountOpen = false): string | null {
  if (!text.trim()) return ownAmountOpen ? TYPE_AN_AMOUNT : CHOOSE_AN_AMOUNT;
  if (cents === null || (cents === 0 && !minCents)) return amountProblem(text, "180 or 180.50") ?? "Enter an amount in Rand, for example 180 or 180.50";
  if (cents < minCents) return `The minimum donation is ${keepTogether(minCents)}.`;
  if (maxCents !== null && cents > maxCents) return `The largest donation in the app is ${keepTogether(maxCents)}. For a bigger gift, please contact the charity directly.`;
  return null;
}

/**
 * The total the Give button names: only when the gift amount can be given and the contribution is valid. Anything
 * else is null, so the button says plain "Hold to give" rather than a sum that could never be charged (amount 0
 * showing "R10", R29.99 under the minimum, an amount over the maximum).
 */
export function givableTotal(giftCents: number | null, amountError: string | null, contributionCents: number | null, cardChargeCents = 0): number | null {
  if (giftCents === null || amountError !== null || contributionCents === null) return null;
  return giftCents + contributionCents + cardChargeCents;
}

type Charged = { cents: number; contributionCents: number; cardChargeCents?: number };

/**
 * What one gift charged, as the Give button names it (gift, contribution and card charge), with the card charge
 * named the way the footer does: "R112.30, including the R2.30 card charge," (23/11/2026). A gift saved before
 * the card charge was kept, or with none, reads as before: "R110".
 */
export function giftTotalWords(s: Charged): string {
  const card = s.cardChargeCents ?? 0;
  const total = rand(s.cents + s.contributionCents + card);
  return card > 0 ? `${total}, including the ${rand(card)} card charge,` : total;
}

/** "R31 to Demo Charity, started at 16:39 on 22/11/2026": the same words as the Progress card for a waiting gift. */
export function waitingGiftLine(g: { charityName: string; sentAt: string; summary: Charged }): string {
  const sent = new Date(g.sentAt);
  const when = Number.isNaN(sent.getTime()) ? "" : `, started at ${hhmm(sent)} on ${ddmmyyyy(jhbDay(sent))}`;
  return `${giftTotalWords(g.summary)} to ${g.charityName}${when}.`;
}

/**
 * The line under the Give button. A long charity name is already in the top bar, so it is not repeated here past a
 * few words: "R180 to the charity" keeps the footer short on a small phone (320 wide).
 */
export function footerAmountLine(giftCents: number, charityName: string, cardChargeCents: number, contribution: string): string {
  const to = charityName.length <= 28 ? charityName : "the charity";
  return `${rand(giftCents)} to ${to}${cardChargeCents ? `, plus ${rand(cardChargeCents)} card charge` : ""}. Contribution to Givezy: ${contribution}.`;
}

/** After this long, a slow first load says so in words, not only grey blocks. */
export const STILL_CONNECTING_MS = 4_000;
/** The give screen's own wait (its readiness check) says so a little later: it usually answers in a second or two. */
export const GIVE_STILL_CONNECTING_MS = 6_000;
export const STILL_CONNECTING = "Still connecting… this is taking longer than usual.";

/**
 * What a loading screen says, by how long it has waited: `first` (or nothing) at once, then "Still connecting…".
 * `offline`: the phone says it has no connection (the web build can tell; the phone apps can't without a new
 * package, so there it stays undefined), which is said at once.
 */
export function loadingLine(elapsedMs: number, slowAfterMs: number, first: string | null = null, offline?: boolean): string | null {
  if (offline === true) return "You're offline. Check your connection: this opens as soon as you're back.";
  return elapsedMs >= slowAfterMs ? STILL_CONNECTING : first;
}

/**
 * A smaller size for a button label that wouldn't fit on one line in a button `width` wide (the ring, gap and padding
 * take about 88 points): roughly 0.56 of the font size per character. Null when it fits as it is, or before the
 * button has been measured. The phone apps also shrink it themselves (adjustsFontSizeToFit); the web build needs this.
 */
export function buttonTextFit(text: string, width: number, baseSize: number): { fontSize: number; lineHeight: number } | null {
  const room = width - 88;
  if (width <= 0 || room <= 0) return null;
  const needed = text.length * baseSize * 0.56;
  if (needed <= room) return null;
  const size = Math.max(12, Math.floor((baseSize * room) / needed));
  return { fontSize: size, lineHeight: Math.round(size * 1.3) };
}
