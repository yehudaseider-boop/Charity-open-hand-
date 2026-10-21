/** The donor's own "kind of giver" answer: they can set it on their own account and nothing else. Needs the local Supabase, seeded. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let donor: string;
let admin: string;
beforeAll(async () => {
  await client.connect();
  donor = (await run("select id from auth.users where email = $1", ["donor@nedivlev.test"])).rows[0].id;
  admin = (await run("select id from auth.users where email = $1", ["meals.admin@nedivlev.test"])).rows[0].id;
});
afterAll(() => client.end());
async function tx(fn: () => Promise<void>) {
  await run("begin");
  try {
    await fn();
  } finally {
    await run("rollback");
  }
}
async function as(who: string | null) {
  await run("reset role");
  if (!who) return run("set local role anon");
  await run("set local role authenticated");
  await run("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: who, role: "authenticated", aal: "aal2" })]);
}

describe("profiles.giver_type", () => {
  it("a donor sets their own answer, and can change it", async () => {
    await tx(async () => {
      await as(donor);
      await run("update public.profiles set giver_type = 'occasional' where id = $1", [donor]);
      await run("update public.profiles set giver_type = 'cause_focused' where id = $1", [donor]);
      expect((await run("select giver_type from public.profiles where id = $1", [donor])).rows[0].giver_type).toBe("cause_focused");
    });
  });

  it("only the three answers are accepted", async () => {
    await tx(async () => {
      await as(donor);
      await expect(run("update public.profiles set giver_type = 'whale' where id = $1", [donor])).rejects.toThrow(/giver_type/);
    });
  });

  it("nobody sets another person's answer", async () => {
    await tx(async () => {
      await as(admin);
      const res = await run("update public.profiles set giver_type = 'regular' where id = $1", [donor]);
      expect(res.rowCount).toBe(0);
    });
    const after = await run("select giver_type from public.profiles where id = $1", [donor]);
    expect(after.rows[0].giver_type).toBeNull();
  });

  it("a signed-out visitor cannot set it", async () => {
    await tx(async () => {
      await as(null);
      await expect(run("update public.profiles set giver_type = 'regular' where id = $1", [donor])).rejects.toThrow();
    });
  });
});
