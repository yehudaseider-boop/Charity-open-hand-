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
/** Read as the server: no browser reads the bank columns since team roles (10/11/2026). */
async function asServer(sql: string, args: unknown[] = []) {
  await run("reset role");
  try {
    return await run(sql, args);
  } finally {
    await run("set local role authenticated");
  }
}

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

  it("can't change its address (it is printed on s18A receipts)", async () => {
    await scenario(noop, async () => {
      await expect(run("update public.charities set city = 'Elsewhere' where id = $1", [meals])).rejects.toThrow(
        /address of a submitted or approved charity/,
      );
    });
  });

  it("a platform admin can still correct its address", async () => {
    await scenario(
      async () => { await run("update public.profiles set role = 'platform_admin' where id = $1", [mealsAdmin]); },
      async () => { await run("update public.charities set postal_code = '2196' where id = $1", [meals]); },
    );
  });

  it("can't change its bank account", async () => {
    await scenario(noop, async () => {
      // No browser session may write the bank columns at all since 23/11/2026; the trigger refused it before.
      await expect(
        run("update public.charity_private set bank_branch_code = '123456' where charity_id = $1", [meals]),
      ).rejects.toThrow(/permission denied|Bank details/);
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
      // Refused outright: charities have no right to that column at all.
      await expect(run("update public.charities set slug = 'x' where id = $1", [meals])).rejects.toThrow(
        /permission denied|Only a platform admin/,
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
           values ($1::uuid, 'bank_confirmation', $1::text || '/y.pdf', 'y.pdf')`,
          [meals],
        );
      },
      async () => {
        await expect(run("delete from public.charity_documents where charity_id = $1", [meals])).rejects.toThrow(
          /cannot be (added, )?changed or removed/,
        );
      },
    );
  });
});

describe("draft charity", () => {
  const toDraft = async () => {
    await run("update public.charities set status = 'draft' where id = $1", [meals]);
  };

  it("can change its legal details, and its contact, from the browser", async () => {
    await scenario(toDraft, async () => {
      await run("update public.charities set legal_name_en = 'Changed' where id = $1", [meals]);
      await run("update public.charities set city = 'Changed' where id = $1", [meals]);
      await run("update public.charity_private set contact_name = 'New', notify_donations = false where charity_id = $1", [meals]);
    });
  });

  it("can't write its bank account straight through the database API, not even its owner (review 23/11/2026)", async () => {
    // The website saves it on the server after its own checks (encryption, audit, bank check, Undo).
    for (const column of ["bank_name = 'Other Bank'", "bank_account_holder = 'SOMEONE ELSE'", "bank_account_number_encrypted = 'x'", "bank_account_last4 = '9999'", "bank_branch_code = '123456'", "bank_verified_at = null"]) {
      await scenario(toDraft, async () => {
        await expect(run(`update public.charity_private set ${column} where charity_id = $1`, [meals])).rejects.toThrow(/permission denied/);
      });
    }
  });

  it("keeps the stamp when an edit does not touch the bank details", async () => {
    await scenario(
      async () => {
        await toDraft();
        await run("update public.charity_private set bank_verified_at = now() where charity_id = $1", [meals]);
      },
      async () => {
        await run("update public.charities set legal_name_en = 'Changed' where id = $1", [meals]);
        const r = await asServer("select bank_verified_at from public.charity_private where charity_id = $1", [meals]);
        expect(r.rows[0].bank_verified_at).not.toBeNull();
      },
    );
  });

  it("can't mark its own bank account verified", async () => {
    await scenario(toDraft, async () => {
      await expect(
        run("update public.charity_private set bank_verified_at = now() where charity_id = $1", [meals]),
      ).rejects.toThrow(/permission denied|Only the platform/);
    });
  });

  it("can't change its own status from the browser (only the server's submit action can)", async () => {
    await scenario(toDraft, async () => {
      await expect(run("update public.charities set status = 'pending_review' where id = $1", [meals])).rejects.toThrow(/permission denied/);
    });
  });

  it("can't approve itself", async () => {
    await scenario(toDraft, async () => {
      await expect(run("update public.charities set status = 'approved' where id = $1", [meals])).rejects.toThrow(
        /Only a platform admin|permission denied/,
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
          /Only a platform admin|permission denied/,
        );
      },
    );
  });
});

describe("bank details are the owner's (review 22/10/2026)", () => {
  it("in a draft, neither an admin nor the owner can change them from the browser: the website saves the owner's on the server (23/11/2026)", async () => {
    // The meals charity back in draft, with the meals admin made a plain admin of it.
    await scenario(
      async () => {
        await run("update public.charities set status = 'draft' where id = $1", [meals]);
        await run("update public.charity_admins set role = 'admin' where charity_id = $1 and user_id = $2", [meals, mealsAdmin]);
      },
      async () => {
        await expect(run("update public.charity_private set bank_branch_code = '123456' where charity_id = $1", [meals])).rejects.toThrow(/permission denied|owner/);
      },
    );
    await scenario(
      async () => {
        await run("update public.charities set status = 'draft' where id = $1", [meals]);
      },
      async () => {
        await expect(run("update public.charity_private set bank_branch_code = '123456' where charity_id = $1", [meals])).rejects.toThrow(/permission denied/);
      },
    );
  });

  it("the server can save them after Givezy stamped them checked, clearing the stamp (an owner sent back could never save before)", async () => {
    await client.query("begin");
    try {
      await run("update public.charities set status = 'rejected' where id = $1", [meals]);
      await run("update public.charity_private set bank_verified_at = now() where charity_id = $1", [meals]);
      await run("set local role service_role");
      await run("update public.charity_private set bank_branch_code = '654321', bank_verified_at = null where charity_id = $1", [meals]);
      await run("reset role");
      const r = await run("select bank_branch_code, bank_verified_at from public.charity_private where charity_id = $1", [meals]);
      expect(r.rows[0]).toEqual({ bank_branch_code: "654321", bank_verified_at: null });
    } finally {
      await client.query("rollback");
    }
  });
});

