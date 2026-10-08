/**
 * Onboarding protections: what a charity admin may and may not change.
 * Needs the local Supabase running and seeded (npm run db:reset).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pg from "pg";

const client = new pg.Client({
  connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
});
let mealsAdmin: string;
let meals: string;

beforeAll(async () => {
  await client.connect();
  mealsAdmin = (await client.query("select id from auth.users where email = 'meals.admin@nedivlev.test'")).rows[0].id;
  meals = (await client.query("select id from public.charities where slug = 'northcliff-meals-fund'")).rows[0].id;
});
afterAll(() => client.end());

/** Rolled-back transaction: set up as owner, then act as the meals admin. */
async function scenario(setup: () => Promise<void>, act: () => Promise<void>) {
  await client.query("begin");
  try {
    await setup();
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: mealsAdmin, role: "authenticated", aal: "aal2" }),
    ]);
    await act();
  } finally {
    await client.query("rollback");
  }
}
const run = (sql: string, args: unknown[] = []) => client.query(sql, args);
const noop = async () => {};

describe("approved charity", () => {
  it("can't change its legal identifiers", async () => {
    await scenario(noop, async () => {
      await expect(run("update public.charities set s18a_reference = 'X' where id = $1", [meals])).rejects.toThrow(
        /Legal details/,
      );
    });
  });

  it("can't change its legal name", async () => {
    await scenario(noop, async () => {
      await expect(run("update public.charities set legal_name_en = 'X' where id = $1", [meals])).rejects.toThrow(
        /Legal details/,
      );
    });
  });

  it("can't change its bank account", async () => {
    await scenario(noop, async () => {
      await expect(
        run("update public.charity_private set bank_branch_code = '123456' where charity_id = $1", [meals]),
      ).rejects.toThrow(/Bank details/);
    });
  });

  it("can't replace its bank account by deleting and re-inserting its private details", async () => {
    await scenario(noop, async () => {
      await expect(run("delete from public.charity_private where charity_id = $1", [meals])).rejects.toThrow(
        /permission denied/,
      );
    });
    await scenario(noop, async () => {
      await expect(
        run(
          `insert into public.charity_private (charity_id, bank_name, bank_account_last4, bank_verified_at)
           values ($1, 'Other Bank', '9999', now())`,
          [meals],
        ),
      ).rejects.toThrow(/permission denied/);
    });
  });

  it("can't change its slug or QuickGive code", async () => {
    await scenario(noop, async () => {
      await expect(run("update public.charities set slug = 'x' where id = $1", [meals])).rejects.toThrow(
        /Only a platform admin/,
      );
    });
  });

  it("can still update its contact person and description", async () => {
    await scenario(noop, async () => {
      await run("update public.charity_private set contact_name = 'New' where charity_id = $1", [meals]);
      await run("update public.charities set description_en = 'New' where id = $1", [meals]);
    });
  });

  it("can't delete submitted documents", async () => {
    await scenario(
      async () => {
        await run(
          `insert into public.charity_documents (charity_id, document_type, storage_path, file_name)
           values ($1, 'bank_confirmation', 'x/y.pdf', 'y.pdf')`,
          [meals],
        );
      },
      async () => {
        await expect(run("delete from public.charity_documents where charity_id = $1", [meals])).rejects.toThrow(
          /cannot be changed or removed/,
        );
      },
    );
  });
});

describe("draft charity", () => {
  const toDraft = async () => {
    await run("update public.charities set status = 'draft' where id = $1", [meals]);
  };

  it("can change its bank account and legal details", async () => {
    await scenario(toDraft, async () => {
      await run("update public.charity_private set bank_branch_code = '123456' where charity_id = $1", [meals]);
      await run("update public.charities set legal_name_en = 'Changed' where id = $1", [meals]);
    });
  });

  it("can't mark its own bank account verified", async () => {
    await scenario(toDraft, async () => {
      await expect(
        run("update public.charity_private set bank_verified_at = now() where charity_id = $1", [meals]),
      ).rejects.toThrow(/Only the platform/);
    });
  });

  it("can submit for review", async () => {
    await scenario(toDraft, async () => {
      await run("update public.charities set status = 'pending_review' where id = $1", [meals]);
    });
  });

  it("can't approve itself", async () => {
    await scenario(toDraft, async () => {
      await expect(run("update public.charities set status = 'approved' where id = $1", [meals])).rejects.toThrow(
        /Only a platform admin/,
      );
    });
  });

  it("can't give itself badges", async () => {
    await scenario(
      async () => {
        await run("update public.charities set status = 'draft', is_verified = false where id = $1", [meals]);
      },
      async () => {
        await expect(run("update public.charities set is_verified = true where id = $1", [meals])).rejects.toThrow(
          /Only a platform admin/,
        );
      },
    );
  });
});
