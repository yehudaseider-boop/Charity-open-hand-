/**
 * The Jewish calendar, worked out (no dates typed in), for the small touches
 * that make the app feel at home: the Hebrew date, Yom Tov and Rosh Chodesh,
 * a greeting that fits the day, and gentle seasonal giving prompts.
 *
 * Diaspora calendar (South Africa). `hebrewDate`, `occasion` and `roshChodesh`
 * take a civil day and give its daytime. The functions that take "now"
 * (greeting, dayLine, weekAhead, isQuietTime) follow the real Jewish day: it
 * turns over at sunset, so on Saturday night it is already Sunday's date, and
 * a festival or Rosh Chodesh starts the evening before.
 * Checked against the Hebcal library in tests.
 */
import { hebrewYearFor, roshHashana } from "./hebrew-year";
import { sunset } from "./sun";

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

const MINUTE = 60_000;
/**
 * When Shabbos and Yom Tov end: 72 minutes after sunset. Later than most
 * communities' nightfall on purpose, so the app never says the week has begun
 * (or sends a reminder) while anyone is still keeping it.
 */
const restEnds = (civil: Date) => new Date(sunset(civil).getTime() + 72 * MINUTE);

/** The civil date of the Jewish day that is running now: tomorrow's date once the sun has set. */
export function jewishDay(now: Date): Date {
  const today = midnight(now);
  return now.getTime() >= sunset(today).getTime() ? new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1) : today;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const isRestDay = (d: Date) => d.getDay() === 6 || occasion(d)?.kind === "yomTov" || occasion(d)?.name === "Yom Kippur";

/** True from Shabbos or Yom Tov coming in (sunset) until it is over (see `restEnds`). */
function inRestPeriod(now: Date): boolean {
  const today = midnight(now);
  const begun = now.getTime() >= sunset(today).getTime();
  // After sunset the next day's rest has begun; before sunset today's rest runs until it ends.
  if (begun && isRestDay(addDays(today, 1))) return true;
  if (isRestDay(today)) return !(now.getTime() >= restEnds(today).getTime() && !isRestDay(addDays(today, 1)));
  return false;
}

/** A greeting for the top of the app, fitting the Jewish day and the time. */
export function greeting(now: Date): string {
  const day = jewishDay(now);
  const o = occasion(day);
  const h = hebrewDate(day);
  if (h.month === "Elul" || (h.month === "Tishrei" && h.day <= 2)) return "Shana tova";
  if (h.month === "Tishrei" && h.day <= 10) return "Gmar chasima tova";
  if (o?.name === "Tisha B'Av") return "";
  if (o?.kind === "yomTov" || o?.kind === "erevYomTov") return "Chag sameach";
  if (o?.kind === "cholHamoed") return "Moadim l'simcha";
  if (o?.name === "Chanukah") return "Happy Chanukah";
  if (o?.name === "Purim") return "Freilichen Purim";
  const dow = now.getDay();
  // Friday, then all of Shabbos until it is over; then "a good week" until Sunday noon.
  if (dow === 5 || inRestPeriod(now)) return "Good Shabbos";
  if ((dow === 6 && now.getTime() >= restEnds(midnight(now)).getTime()) || (dow === 0 && now.getHours() < 12)) return "Shavua tov";
  const hour = now.getHours();
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

/** The line under the greeting: today's Hebrew date (it changes at sunset), and the occasion or Rosh Chodesh. */
export function dayLine(now: Date): string {
  const day = jewishDay(now);
  const extra = occasion(day)?.name ?? roshChodesh(day);
  return [formatHebrewDate(hebrewDate(day)), extra].filter(Boolean).join(" · ");
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Where the Jewish week is at: Rosh Chodesh, a festival or a fast that is on
 * now or coming in the next few days, in plain words, e.g.
 * "Rosh Chodesh Cheshvan starts tonight: Sunday and Monday." Empty when
 * nothing is close. Shabbos itself shows in the greeting, so only
 * "Shabbos starts tonight" is added, on Friday before sunset.
 */
export function weekAhead(now: Date): string[] {
  const today = midnight(now);
  const day = jewishDay(now); // the Jewish day running now, by its civil date
  const night = today.getTime() < day.getTime(); // after sunset: the evening of `day`
  const nameOf = (c: Date): string | null => occasion(c)?.name ?? roshChodesh(c);
  // Runs of the same event over the next ten Jewish days, so a long one (Chanukah) is seen whole.
  const groups: { name: string; days: Date[] }[] = [];
  for (let i = 0; i < 10; i++) {
    const c = addDays(day, i);
    const name = nameOf(c);
    if (!name) continue;
    const last = groups[groups.length - 1];
    if (last && last.name === name && daysBetween(last.days[last.days.length - 1], c) === 1) last.days.push(c);
    else groups.push({ name, days: [c] });
  }
  const lines: string[] = [];
  for (const g of groups) {
    const first = g.days[0];
    const ahead = daysBetween(day, first); // 0 = the running Jewish day
    if (ahead > 3) continue;
    const weekday = (c: Date) => WEEKDAYS[c.getDay()];
    // Already under way: its day before this one had the same name.
    const continuing = ahead === 0 && nameOf(addDays(day, -1)) === g.name;
    // Starts this evening: the running day once the sun has set, or tomorrow's while it is still daytime.
    const startsTonight = !continuing && ((ahead === 0 && night) || (ahead === 1 && !night));
    const last = g.days[g.days.length - 1];
    let when: string;
    if (g.days.length >= 4) {
      when = `until ${weekday(last)}`;
    } else {
      const labels = g.days.map((c) => {
        const n = daysBetween(day, c);
        if (startsTonight) return weekday(c);
        if (n === 0) return night ? (continuing ? "tonight" : weekday(c)) : "today";
        if (n === 1 && !night) return "tomorrow";
        return weekday(c);
      });
      // Under way and it is now evening: "tonight and Monday".
      if (continuing && night) labels.splice(1, 0, weekday(first));
      when = labels.length > 1 ? `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}` : labels[0];
    }
    lines.push(startsTonight ? `${g.name} starts tonight${g.days.length >= 4 ? " and runs " : ": "}${when}.` : `${g.name}: ${when}.`);
  }
  // Friday before sunset: Shabbos comes in tonight.
  if (now.getDay() === 5 && !night) lines.push("Shabbos starts tonight.");
  return lines.slice(0, 2);
}

export type Appeal = { key: "elul" | "purim" | "pesach"; title: string; body: string };

/** A gentle seasonal giving prompt, in the weeks before Rosh Hashana, Purim and Pesach. */
export function seasonalAppeal(now: Date): Appeal | null {
  const h = hebrewDate(jewishDay(now));
  if (h.month === "Elul")
    return { key: "elul", title: "Before Rosh Hashana", body: "Many people give extra tzedaka in Elul, the month before the new year." };
  if (h.month === purimMonth(h) && h.day <= 14)
    return { key: "purim", title: "Matanos l'evyonim", body: "On Purim day, give gifts to at least two people in need. Many charities collect and hand them out on the day." };
  if ((h.month === purimMonth(h) && h.day >= 15) || (h.month === "Nisan" && h.day <= 14))
    return { key: "pesach", title: "Maos chitim", body: "Before Pesach, help families in need with what they need for Yom Tov." };
  return null;
}

/**
 * When the app must not send reminders or notifications: Shabbos and Yom Tov,
 * from sunset when it comes in until 72 minutes after sunset when it ends
 * (see `restEnds`), and from 12:00 on the day before, to stay well clear.
 * Use it before any notification.
 */
export function isQuietTime(now: Date): boolean {
  if (inRestPeriod(now)) return true;
  return isRestDay(addDays(midnight(now), 1)) && now.getHours() >= 12;
}
