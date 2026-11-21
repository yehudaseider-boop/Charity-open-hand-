/**
 * Charity search ignores accents both ways (migration 20261121000001, 21/11/2026): the website's search, run as a
 * visitor against charities.search_text with the website's own pattern, finds "Café Kids Trust" for "Cafe", "cafe" and
 * "CAFÉ", and "Cafe Bongani" for "café"; words with signs between them are still found; a suspended charity never is;
 * % and _ typed are never wildcards. Fixtures are built in a transaction that is rolled back.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import pg from "pg";

vi.mock("server-only", () => ({}));
const { cleanQuery, searchPattern } = await import("@/app/charities/view");
const { searchWords } = await import("@/lib/charity/search-text");

const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres" });
beforeAll(() => client.connect());
afterAll(() => client.end());

const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
const one = async (sql: string, args: unknown[] = []) => (await run(sql, args)).rows[0];
async function tx(fn: () => Promise<void>) {
  await run("begin");
  try {
    await fn();
  } finally {
    await run("rollback");
  }
}

let seq = 0;
const stamp = () => `${++seq}-${Date.now()}`;
async function charity(name: string, status = "approved", extra: { description?: string; city?: string } = {}) {
  const { id } = await one(
    `insert into public.charities (slug, quickgive_code, name_en, legal_name_en, description_en, city, status)
     values ($1, $2, $3, $3 || ' NPC', $4, $5, $6::public.charity_status) returning id`,
    [`sa-${stamp()}`, `S${seq}${String(Date.now()).slice(-5)}`, name, extra.description ?? null, extra.city ?? null, status],
  );
  return id as string;
}

/** What Find a charity does with what was typed: the same cleaning and pattern, read as a visitor. Names found. */
async function find(typed: string): Promise<string[]> {
  const search = cleanQuery(typed);
  if (!search || searchWords(search).length === 0) return [];
  await run("savepoint search");
  try {
    await run("set local role anon");
    const r = await run("select name_en from public.charities where status = 'approved' and search_text like $1 order by name_en", [searchPattern(search)]);
    return r.rows.map((x) => x.name_en as string);
  } finally {
    await run("rollback to savepoint search");
  }
}
/** Only this test's charities (their names start with "Zq"), so seeded ones don't get in the way. */
const ours = async (typed: string) => (await find(typed)).filter((n) => n.startsWith("Zq"));

describe("charity search and accents", () => {
  it("finds Café with or without the accent, in any case", async () => {
    await tx(async () => {
      await charity("Zq Café Kids Trust");
      for (const typed of ["Cafe", "cafe", "CAFÉ", "café", "zq cafe kids"]) expect(await ours(typed)).toEqual(["Zq Café Kids Trust"]);
    });
  });

  it("finds a name typed without an accent when the search has one", async () => {
    await tx(async () => {
      await charity("Zq Cafe Bongani");
      expect(await ours("café bongani")).toEqual(["Zq Cafe Bongani"]);
      expect(await ours("Crèche")).toEqual([]);
    });
  });

  it("still finds words with signs between them", async () => {
    await tx(async () => {
      await charity("Zq Save-a-Life");
      await charity("Zq Boys & Girls Club");
      expect(await ours("save a life")).toEqual(["Zq Save-a-Life"]);
      expect(await ours("Save-a-Life")).toEqual(["Zq Save-a-Life"]);
      expect(await ours("boys girls")).toEqual(["Zq Boys & Girls Club"]);
      // Every word must be there. (Order is only kept within one run of text: the five columns are searched together,
      // so "girls boys" also finds it, through the name and then the legal name.)
      expect(await ours("boys kitchen")).toEqual([]);
    });
  });

  it("searches the legal name, description and town too, and letters unaccent spells out", async () => {
    await tx(async () => {
      await charity("Zq Hope", "approved", { description: "Meals in Zürich Street", city: "Pietermaritzburg" });
      await charity("Zq Straße Fund");
      expect(await ours("zurich")).toEqual(["Zq Hope"]);
      expect(await ours("pietermaritzburg")).toEqual(["Zq Hope"]);
      expect(await ours("zq hope npc")).toEqual(["Zq Hope"]);
      expect(await ours("strasse")).toEqual(["Zq Straße Fund"]);
    });
  });

  it("never finds a charity that isn't approved", async () => {
    await tx(async () => {
      await charity("Zq Café Suspended", "suspended");
      await charity("Zq Café Draft", "draft");
      expect(await ours("zq cafe")).toEqual([]);
    });
  });

  it("treats % and _ as signs, never as wildcards", async () => {
    await tx(async () => {
      await charity("Zq Café Kids Trust");
      for (const typed of ["%", "_", "%%%", "__", "%_%"]) expect(await find(typed)).toEqual([]);
      // Folding never makes a wildcard, and cleaning removes typed ones.
      expect((await one("select public.plain_search_text('50%_Off Café') as t")).t).toBe("50%_off cafe");
      expect(searchPattern(cleanQuery("caf%_é"))).toBe("%caf%e%");
    });
  });

  it("keeps the column up to date when a name changes", async () => {
    await tx(async () => {
      const id = await charity("Zq Plain Name");
      await run("update public.charities set name_en = 'Zq Éducation Trust' where id = $1", [id]);
      expect((await one("select search_text from public.charities where id = $1", [id])).search_text).toMatch(/^zq education trust /);
      expect(await ours("education")).toEqual(["Zq Éducation Trust"]);
    });
  });

  it("lets visitors read the column and run the folding, and nothing more than before", async () => {
    const r = await one(
      `select has_column_privilege('anon', 'public.charities', 'search_text', 'select') as anon_reads,
              has_column_privilege('anon', 'public.charities', 'search_text', 'update') as anon_writes,
              has_function_privilege('anon', 'public.plain_search_text(text)', 'execute') as anon_runs,
              (select prosecdef from pg_proc where oid = 'public.plain_search_text(text)'::regprocedure) as definer`,
    );
    expect(r).toEqual({ anon_reads: true, anon_writes: false, anon_runs: true, definer: false });
  });
});
