/**
 * Runs once before all tests. About a hundred checks need the local test database (Supabase on port
 * 54322). If it isn't running, stop the whole run here with one plain message, instead of letting
 * those files fail one by one under hundreds of lines where the reason is easy to miss.
 * `npm run test:no-db` runs everything else when there is no local database on purpose.
 */
import { Client } from "pg";

export default async function checkTestDatabase() {
  if (process.env.SKIP_DB_TESTS === "yes") return;
  const client = new Client({
    connectionString: process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    connectionTimeoutMillis: 5_000,
  });
  try {
    await client.connect();
    await client.query("select 1");
  } catch (e) {
    throw new Error(
      [
        "",
        "The local test database is not running, so the database checks cannot run.",
        "Nothing was tested. Start it (bash scripts/local-db-up.sh) and run the tests again,",
        "or run `npm run test:no-db` to run only the checks that don't need it.",
        `(${e instanceof Error ? e.message : String(e)})`,
        "",
      ].join("\n"),
    );
  } finally {
    await client.end().catch(() => {});
  }
}
