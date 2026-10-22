/**
 * Puts the demo site's database back as new (see src/lib/demo/reset.ts for every check it makes first).
 *
 *   npm run demo:reset          uses .env.local (your own machine's local database)
 *
 * It refuses unless DEMO_MODE=yes and DEMO_DATABASE_URL point at the demo's own database. Never run it
 * against the real test site or the live site: it would refuse, because neither is marked as the demo.
 */
import { resetDemo } from "../src/lib/demo/reset";

resetDemo()
  .then((s) => console.log(`Demo reset: ${s.donors} donors, ${s.donations} gifts, ${s.receipts} s18A receipts (${Math.round(s.tookMs / 1000)}s).`))
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
