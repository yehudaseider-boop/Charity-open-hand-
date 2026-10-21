/** Emails to donors in the database: the 4-a-month limit, never twice, and closed to browsers. Needs the local Supabase, seeded. */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
let charity: string;
beforeAll(async () => {
  await client.connect();
  charity = (await run("select id from public.charities where slug = $1", ["northcliff-meals-fund"])).rows[0].id;
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
const donor = async () => (await run("insert into public.donors (email, donor_type) values ($1, 'individual') returning id", [`ap-${Math.random()}@x.test`])).rows[0].id as string;
const appeal = async (donors: string[]) => {
  const id = (await run("insert into public.charity_appeals (charity_id, subject, body, audience, audience_label) values ($1, 'News', 'Some news for you all.', '{}', 'All') returning id", [charity])).rows[0].id as string;
  for (const d of donors) await run("insert into public.charity_appeal_recipients (appeal_id, charity_id, donor_id) values ($1, $2, $3)", [id, charity, d]);
  return id;
};
const claim = async (id: string, n = 25) => (await run("select donor_id from public.claim_appeal_recipients($1, $2)", [id, n])).rows.map((r) => r.donor_id as string);
const statusOf = async (id: string, d: string) => (await run("select status from public.charity_appeal_recipients where appeal_id = $1 and donor_id = $2", [id, d])).rows[0].status as string;

describe("emails to donors", () => {
  it("a donor is claimed once: pressing again sends nobody twice", async () => {
    await tx(async () => {
      const [a, b] = [await donor(), await donor()];
      const id = await appeal([a, b]);
      expect((await claim(id, 1)).length).toBe(1);
      expect((await claim(id)).length).toBe(1);
      expect(await claim(id)).toEqual([]);
      expect(await statusOf(id, a)).toBe("sending");
    });
  });

  it("at most 4 in 30 days from one charity to one donor: the fifth is left out", async () => {
    await tx(async () => {
      const d = await donor();
      for (let i = 0; i < 4; i++) {
        const id = await appeal([d]);
        expect(await claim(id)).toEqual([d]);
        await run("update public.charity_appeal_recipients set status = 'sent' where appeal_id = $1", [id]);
      }
      const fifth = await appeal([d]);
      expect(await claim(fifth)).toEqual([]);
      expect(await statusOf(fifth, d)).toBe("skipped");
      // Older than 30 days no longer counts.
      await run("update public.charity_appeal_recipients set claimed_at = now() - interval '31 days' where donor_id = $1 and status = 'sent'", [d]);
      const later = await appeal([d]);
      expect(await claim(later)).toEqual([d]);
    });
  });

  it("an opt-out is kept once per charity and address", async () => {
    await tx(async () => {
      const h = "a".repeat(64);
      await run("insert into public.charity_email_opt_outs (charity_id, email_hash, source) values ($1, $2, 'checkout')", [charity, h]);
      await run("savepoint s");
      await expect(run("insert into public.charity_email_opt_outs (charity_id, email_hash, source) values ($1, $2, 'stop_link')", [charity, h])).rejects.toThrow(/duplicate key/);
      await run("rollback to savepoint s");
      await expect(run("insert into public.charity_email_opt_outs (charity_id, email_hash, source) values ($1, 'not-a-hash', 'checkout')", [charity])).rejects.toThrow(/charity_email_opt_out_hash/);
    });
  });

  it("browsers can't read or write any of it, or claim recipients", async () => {
    await tx(async () => {
      await run("set local role authenticated");
      for (const t of ["charity_appeals", "charity_appeal_recipients", "charity_email_opt_outs", "charity_email_stop_tokens"]) {
        await run("savepoint s");
        await expect(run(`select * from public.${t}`), t).rejects.toThrow(/permission denied/);
        await run("rollback to savepoint s");
      }
      await expect(run("select * from public.claim_appeal_recipients(gen_random_uuid(), 1)")).rejects.toThrow(/permission denied/);
    });
  });
});
