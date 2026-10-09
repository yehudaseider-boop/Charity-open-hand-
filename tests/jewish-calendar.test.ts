/**
 * The app's Jewish calendar, checked day by day against the Hebcal library
 * (used in tests only) for 2020 to 2035, diaspora.
 */
import { HDate, HebrewCalendar } from "@hebcal/core";
import { describe, expect, it } from "vitest";
import { dayLine, greeting, hebrewDate, isQuietTime, occasion, roshChodesh, seasonalAppeal } from "../apps/mobile/src/lib/jewish-calendar";

const hebcalMonth: Record<string, string> = {
  Tishrei: "Tishrei", Cheshvan: "Cheshvan", Kislev: "Kislev", Tevet: "Teves", "Sh'vat": "Shevat", Adar: "Adar",
  "Adar I": "Adar I", "Adar II": "Adar II", Nisan: "Nisan", Iyyar: "Iyar", Sivan: "Sivan", Tamuz: "Tammuz", Av: "Av", Elul: "Elul",
};
const start = new Date(2020, 0, 1);
const end = new Date(2035, 11, 31);
const days: Date[] = [];
for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) days.push(d);

describe("Hebrew date", () => {
  it("matches Hebcal on every day from 2020 to 2035", () => {
    const wrong: string[] = [];
    for (const d of days) {
      const ours = hebrewDate(d);
      const theirs = new HDate(d);
      const expected = `${theirs.getDate()} ${hebcalMonth[theirs.getMonthName()]} ${theirs.getFullYear()}`;
      if (`${ours.day} ${ours.month} ${ours.year}` !== expected) wrong.push(`${d.toDateString()}: ${ours.day} ${ours.month} ${ours.year} vs ${expected}`);
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it("shows today as 28 Tishrei 5787", () => {
    expect(dayLine(new Date(2026, 9, 9))).toBe("28 Tishrei 5787");
  });
});

describe("Yom Tov, fasts and Rosh Chodesh", () => {
  const events = HebrewCalendar.calendar({ start, end, il: false, noMinorFast: true, noModern: true, noSpecialShabbat: true, noHolidays: false });
  const on = (pred: (desc: string, f: number) => boolean) =>
    new Set(events.filter((e) => pred(e.getDesc(), e.getFlags())).map((e) => e.getDate().greg().toDateString()));

  const check = (name: string, theirs: Set<string>, ours: (d: Date) => boolean) => {
    const mine = new Set(days.filter(ours).map((d) => d.toDateString()));
    const missing = [...theirs].filter((x) => !mine.has(x));
    const extra = [...mine].filter((x) => !theirs.has(x));
    expect({ name, missing: missing.slice(0, 3), extra: extra.slice(0, 3) }).toEqual({ name, missing: [], extra: [] });
  };

  it("finds the same Yom Tov days as Hebcal", () => {
    check("Rosh Hashana", on((s) => /^Rosh Hashana( II| \d+)?$/.test(s)), (d) => occasion(d)?.name === "Rosh Hashana");
    check("Yom Kippur", on((s) => s === "Yom Kippur"), (d) => occasion(d)?.name === "Yom Kippur");
    check("Pesach Yom Tov", on((s) => /^Pesach (I|II|VII|VIII)$/.test(s)), (d) => occasion(d)?.name === "Pesach");
    check("Shavuos", on((s) => /^Shavuot (I|II)$/.test(s)), (d) => occasion(d)?.name === "Shavuos");
    check("Sukkos Yom Tov", on((s) => /^Sukkot (I|II)$/.test(s)), (d) => occasion(d)?.name === "Sukkos");
    check("Shemini Atzeres", on((s) => s === "Shmini Atzeret"), (d) => occasion(d)?.name === "Shemini Atzeres");
    check("Simchas Torah", on((s) => s === "Simchat Torah"), (d) => occasion(d)?.name === "Simchas Torah");
    check("Purim", on((s) => s === "Purim"), (d) => occasion(d)?.name === "Purim");
    check("Tisha B'Av", on((s) => s === "Tish'a B'Av" || s === "Tish'a B'Av (observed)"), (d) => occasion(d)?.name === "Tisha B'Av");
  });

  it("covers all eight days of Chanukah", () => {
    check("Chanukah", on((s) => /^Chanukah: \d Candles?$/.test(s) && !/: 1 Candle$/.test(s)).size ? on((s) => /^Chanukah: (2|3|4|5|6|7|8) Candles$/.test(s) || s === "Chanukah: 8th Day") : new Set(), (d) => occasion(d)?.name === "Chanukah");
  });

  it("finds the same Rosh Chodesh days as Hebcal", () => {
    check("Rosh Chodesh", on((s) => /^Rosh Chodesh /.test(s)), (d) => roshChodesh(d) !== null);
  });
});

describe("greeting and seasonal prompts", () => {
  it("fits the day", () => {
    expect(greeting(new Date(2026, 9, 9, 9))).toBe("Good Shabbos"); // a Friday
    expect(greeting(new Date(2026, 9, 11, 8))).toBe("Shavua tov"); // Sunday morning
    expect(greeting(new Date(2026, 9, 12, 8))).toBe("Good morning");
    expect(greeting(new Date(2026, 9, 12, 14))).toBe("Good afternoon");
    expect(greeting(new Date(2026, 9, 12, 19))).toBe("Good evening");
    expect(greeting(new Date(2026, 8, 12, 10))).toBe("Shana tova"); // Rosh Hashana 5787
    expect(greeting(new Date(2026, 8, 21, 10))).toBe("Gmar chasima tova"); // Yom Kippur
    expect(greeting(new Date(2026, 8, 29, 10))).toBe("Moadim l'simcha"); // Chol Hamoed Sukkos
  });

  it("prompts before Purim and Pesach, and in Elul", () => {
    expect(seasonalAppeal(new Date(2026, 9, 9))).toBeNull();
    const purim = days.find((d) => occasion(d)?.name === "Purim" && d.getFullYear() === 2027)!;
    expect(seasonalAppeal(purim)?.key).toBe("purim");
    expect(seasonalAppeal(new Date(purim.getFullYear(), purim.getMonth(), purim.getDate() + 2))?.key).toBe("pesach");
    expect(seasonalAppeal(new Date(2027, 8, 15))?.key).toBe("elul"); // Elul 5787
    expect(seasonalAppeal(new Date(2027, 7, 20))).toBeNull(); // Av: no prompt
  });

  it("keeps quiet on Shabbos and Yom Tov, from Friday midday", () => {
    expect(isQuietTime(new Date(2026, 9, 9, 11))).toBe(false); // Friday morning
    expect(isQuietTime(new Date(2026, 9, 9, 13))).toBe(true); // Friday afternoon
    expect(isQuietTime(new Date(2026, 9, 10, 20))).toBe(true); // Shabbos
    expect(isQuietTime(new Date(2026, 9, 11, 9))).toBe(false); // Sunday
    expect(isQuietTime(new Date(2026, 8, 21, 9))).toBe(true); // Yom Kippur
  });
});
