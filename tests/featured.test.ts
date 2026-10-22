import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";
import { markFeatured, weekStartJhb } from "../apps/mobile/src/lib/live-charities";

describe("cause of the week in the app", () => {
  it("the week starts on Monday, Johannesburg time", () => {
    // Sunday 25/10 at 23:30 in Johannesburg is still the week of Monday 19/10.
    expect(weekStartJhb(new Date("2026-10-25T21:30:00Z"))).toBe("2026-10-19");
    // Monday 26/10 at 00:30 in Johannesburg (still Sunday in UTC) is the new week.
    expect(weekStartJhb(new Date("2026-10-25T22:30:00Z"))).toBe("2026-10-26");
    expect(weekStartJhb(new Date("2026-10-22T10:00:00Z"))).toBe("2026-10-19");
  });
  it("marks only Givezy's pick, and never picks one itself", () => {
    const list = [{ id: "a" }, { id: "b" }] as never[];
    expect(markFeatured(list, null)).toBe(list);
    expect(markFeatured(list, "b").map((c: { featured?: boolean }) => Boolean(c.featured))).toEqual([false, true]);
    expect(markFeatured(list, "gone").some((c: { featured?: boolean }) => c.featured)).toBe(false);
  });
});

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
beforeAll(() => client.connect());
afterAll(() => client.end());

describe("cause of the week in the database", () => {
  it("one per week, always a Monday; anyone reads picks of approved charities, nobody else writes", async () => {
    await run("begin");
    try {
      const [approved, other] = (await run("select id from public.charities where status = 'approved' order by slug limit 2")).rows.map((r) => r.id);
      // A charity that is no longer approved: its pick stays hidden.
      await run("update public.charities set status = 'suspended' where id = $1", [other]);
      await run("insert into public.featured_charities (charity_id, week_start) values ($1, '2026-10-26'), ($2, '2026-11-02')", [approved, other]);
      await run("savepoint s");
      await expect(run("insert into public.featured_charities (charity_id, week_start) values ($1, '2026-10-27')", [approved])).rejects.toThrow(/featured_week_monday/);
      await run("rollback to savepoint s");
      await expect(run("insert into public.featured_charities (charity_id, week_start) values ($1, '2026-10-26')", [approved])).rejects.toThrow(/featured_one_per_week/);
      await run("rollback to savepoint s");
      await run("set local role anon");
      expect((await run("select week_start::text from public.featured_charities order by week_start")).rows.map((r) => r.week_start)).toEqual(["2026-10-26"]);
      await expect(run("insert into public.featured_charities (charity_id, week_start) values ($1, '2026-11-09')", [approved])).rejects.toThrow(/permission denied/);
    } finally {
      await run("rollback");
    }
  });
});
