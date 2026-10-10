/**
 * The Jewish calendar, worked out (no dates typed in), for the small touches
 * that make the app feel at home: the Hebrew date, Yom Tov and Rosh Chodesh,
 * a greeting that fits the day, and gentle seasonal giving prompts.
 *
 * Diaspora calendar (South Africa). Dates are civil days: the evening before
 * is not split out, so a festival shows on its daytime date.
 * Checked against the Hebcal library in tests.
 */
import { hebrewYearFor, roshHashana } from "./hebrew-year";

export type HebrewMonth =
  | "Tishrei" | "Cheshvan" | "Kislev" | "Teves" | "Shevat" | "Adar" | "Adar I" | "Adar II"
  | "Nisan" | "Iyar" | "Sivan" | "Tammuz" | "Av" | "Elul";

export type HebrewDate = { day: number; month: HebrewMonth; year: number; leap: boolean };

const DAY = 86_400_000;
const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const daysBetween = (a: Date, b: Date) => Math.round((midnight(b).getTime() - midnight(a).getTime()) / DAY);

/** The months of a Hebrew year, from Tishrei, with their lengths. */
export function monthsOfYear(year: number): { month: HebrewMonth; days: number }[] {
  const length = daysBetween(roshHashana(year), roshHashana(year + 1));
  const leap = length > 355;
  const kind = length % 10; // 3 deficient, 4 regular, 5 complete (353/354/355, 383/384/385)
  const cheshvan = kind === 5 ? 30 : 29;
  const kislev = kind === 3 ? 29 : 30;
  return [
    { month: "Tishrei", days: 30 },
    { month: "Cheshvan", days: cheshvan },
    { month: "Kislev", days: kislev },
    { month: "Teves", days: 29 },
    { month: "Shevat", days: 30 },
    ...(leap ? [{ month: "Adar I" as const, days: 30 }, { month: "Adar II" as const, days: 29 }] : [{ month: "Adar" as const, days: 29 }]),
    { month: "Nisan", days: 30 },
    { month: "Iyar", days: 29 },
    { month: "Sivan", days: 30 },
    { month: "Tammuz", days: 29 },
    { month: "Av", days: 30 },
    { month: "Elul", days: 29 },
  ];
}

export function hebrewDate(d: Date): HebrewDate {
  const year = hebrewYearFor(d);
  const months = monthsOfYear(year);
  let left = daysBetween(roshHashana(year), d);
  for (const m of months) {
    if (left < m.days) return { day: left + 1, month: m.month, year, leap: months.length === 13 };
    left -= m.days;
  }
  throw new Error("Date outside its Hebrew year");
}

/** "28 Tishrei 5787" */
export function formatHebrewDate(h: HebrewDate): string {
  return `${h.day} ${h.month} ${h.year}`;
}

/** The Adar that Purim is in: Adar II in a leap year. */
const purimMonth = (h: HebrewDate): HebrewMonth => (h.leap ? "Adar II" : "Adar");

export type DayKind = "yomTov" | "cholHamoed" | "fast" | "festive" | "erevYomTov";
export type Occasion = { name: string; kind: DayKind };

/** What today is, if anything (diaspora). */
export function occasion(d: Date): Occasion | null {
  const h = hebrewDate(d);
  const is = (month: HebrewMonth, from: number, to = from) => h.month === month && h.day >= from && h.day <= to;
  if (is("Elul", 29)) return { name: "Erev Rosh Hashana", kind: "erevYomTov" };
  if (is("Tishrei", 1, 2)) return { name: "Rosh Hashana", kind: "yomTov" };
  if (is("Tishrei", 9)) return { name: "Erev Yom Kippur", kind: "erevYomTov" };
  if (is("Tishrei", 10)) return { name: "Yom Kippur", kind: "fast" };
  if (is("Tishrei", 14)) return { name: "Erev Sukkos", kind: "erevYomTov" };
  if (is("Tishrei", 15, 16)) return { name: "Sukkos", kind: "yomTov" };
  if (is("Tishrei", 17, 20)) return { name: "Sukkos (Chol Hamoed)", kind: "cholHamoed" };
  if (is("Tishrei", 21)) return { name: "Hoshana Rabba", kind: "cholHamoed" };
  if (is("Tishrei", 22)) return { name: "Shemini Atzeres", kind: "yomTov" };
  if (is("Tishrei", 23)) return { name: "Simchas Torah", kind: "yomTov" };
  // Chanukah: 25 Kislev for eight days, into Teves.
  const kislev = monthsOfYear(h.year).find((m) => m.month === "Kislev")!.days;
  if (is("Kislev", 25, 30) || is("Teves", 1, 2 + (kislev === 29 ? 1 : 0)))
    return { name: "Chanukah", kind: "festive" };
  if (is("Shevat", 15)) return { name: "Tu BiShvat", kind: "festive" };
  if (is(purimMonth(h), 14)) return { name: "Purim", kind: "festive" };
  if (is("Nisan", 14)) return { name: "Erev Pesach", kind: "erevYomTov" };
  if (is("Nisan", 15, 16) || is("Nisan", 21, 22)) return { name: "Pesach", kind: "yomTov" };
  if (is("Nisan", 17, 20)) return { name: "Pesach (Chol Hamoed)", kind: "cholHamoed" };
  if (is("Sivan", 5)) return { name: "Erev Shavuos", kind: "erevYomTov" };
  if (is("Sivan", 6, 7)) return { name: "Shavuos", kind: "yomTov" };
  // Tisha B'Av moves to Sunday when 9 Av is Shabbos.
  const ninthAv = d.getDay() === 6 ? false : is("Av", 9);
  const deferred = d.getDay() === 0 && is("Av", 10);
  if (ninthAv || deferred) return { name: "Tisha B'Av", kind: "fast" };
  return null;
}

/** "Rosh Chodesh Cheshvan" on the day(s) of Rosh Chodesh, else null. */
export function roshChodesh(d: Date): string | null {
  const h = hebrewDate(d);
  const months = monthsOfYear(h.year);
  const i = months.findIndex((m) => m.month === h.month);
  if (h.day === 1 && h.month !== "Tishrei") return `Rosh Chodesh ${h.month}`;
  if (h.day === 30) {
    const next = months[i + 1];
    return next ? `Rosh Chodesh ${next.month}` : null; // 30 Elul doesn't exist; Tishrei has no Rosh Chodesh
  }
  return null;
}

/** A greeting for the top of the app, fitting the day and time. */
export function greeting(now: Date): string {
  const o = occasion(now);
  const h = hebrewDate(now);
  if (h.month === "Elul" || (h.month === "Tishrei" && h.day <= 2)) return "Shana tova";
  if (h.month === "Tishrei" && h.day <= 10) return "Gmar chasima tova";
  if (o?.name === "Tisha B'Av") return "";
  if (o?.kind === "yomTov" || o?.kind === "erevYomTov") return "Chag sameach";
  if (o?.kind === "cholHamoed") return "Moadim l'simcha";
  if (o?.name === "Chanukah") return "Happy Chanukah";
  if (o?.name === "Purim") return "Freilichen Purim";
  const dow = now.getDay();
  if (dow === 5 || dow === 6) return "Good Shabbos";
  if (dow === 0 && now.getHours() < 12) return "Shavua tov";
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** The line under the greeting: Hebrew date, and the occasion or Rosh Chodesh. */
export function dayLine(now: Date): string {
  const extra = occasion(now)?.name ?? roshChodesh(now);
  return [formatHebrewDate(hebrewDate(now)), extra].filter(Boolean).join(" · ");
}

export type Appeal = { key: "elul" | "purim" | "pesach"; title: string; body: string };

/** A gentle seasonal giving prompt, in the weeks before Rosh Hashana, Purim and Pesach. */
export function seasonalAppeal(now: Date): Appeal | null {
  const h = hebrewDate(now);
  if (h.month === "Elul")
    return { key: "elul", title: "Before Rosh Hashana", body: "Many people give extra tzedaka in Elul, the month before the new year." };
  if (h.month === purimMonth(h) && h.day <= 14)
    return { key: "purim", title: "Matanos l'evyonim", body: "On Purim day, give gifts to at least two people in need. Many charities collect and hand them out on the day." };
  if ((h.month === purimMonth(h) && h.day >= 15) || (h.month === "Nisan" && h.day <= 14))
    return { key: "pesach", title: "Maos chitim", body: "Before Pesach, help families in need with what they need for Yom Tov." };
  return null;
}

/**
 * When the app must not send reminders or notifications: Shabbos and Yom Tov.
 * Without sunset times we stay well clear: from 12:00 on Friday or Erev Yom
 * Tov until the next midnight after it ends. Use it before any notification.
 */
export function isQuietTime(now: Date): boolean {
  const restDay = (d: Date) => d.getDay() === 6 || occasion(d)?.kind === "yomTov" || occasion(d)?.name === "Yom Kippur";
  if (restDay(now)) return true;
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return restDay(tomorrow) && now.getHours() >= 12;
}
