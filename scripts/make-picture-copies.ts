/**
 * One-off: give charity pictures uploaded before 25/11/2026 their smaller copies ("Resize at upload", Yehuda). New
 * uploads get them at upload (src/lib/charity/picture-copies.ts); this does the same for the logos, cover photos,
 * update photos and gallery photos already in storage.
 *
 *   npm run picture-copies                                              what it would do (nothing is written)
 *   npm run picture-copies -- --write --project=<ref>                   make the copies (TEST project, or local)
 *   npm run picture-copies -- --write --project=<ref> --live-project-yes   the same on any other project (live)
 *   npm run picture-copies -- --remove-old --project=<ref> [...]        later: remove the full-size files from before
 *
 * Nothing is written without --write (or --remove-old) and --project naming the project in NEXT_PUBLIC_SUPABASE_URL.
 * Any project but the TEST project (or a local one) also needs --live-project-yes. Run TEST first, with Yehuda's go,
 * then live with its own go (docs/go-live-checklist.md). Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.
 *
 * For each picture with no size in its name it reads the file, makes the copies (never wider than the picture), stores
 * them and the picture under its new name (`<name>.<width>x<height>.<ext>`, the same bytes; a picture that still
 * carries hidden details such as a phone's GPS position, or is larger than 2 400 px, is cleaned as an upload is), then
 * points the charity's row at the new name, only if it still names the old one (otherwise what it made is removed
 * again). It is safe to run twice: a picture with its size in its name is skipped. The old full-size file stays until
 * --remove-old (run it a day later, when no page or app still has the old name), so nothing breaks meanwhile.
 */
import { pathToFileURL } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { cleanImageBytes, MAX_IMAGE_SIDE } from "../src/lib/charity/clean-image";
import { makeCopies } from "../src/lib/charity/picture-copies";
import { pictureSize, withSize, pictureFiles } from "../src/lib/charity/picture-sizes";

export const TEST_PROJECT_REF = "bodfyjskiwrwxhagtkxt";
const BUCKET = "charity-public";

export type Options = { mode: "dry-run" | "write" | "remove-old"; ref: string; limit: number | null };

/** The project's reference from its address: `https://<ref>.supabase.co` (a local database is "local"). */
export function projectRef(url: string): string {
  const u = new URL(url);
  if (["127.0.0.1", "localhost"].includes(u.hostname)) return "local";
  const m = /^([a-z0-9]{20})\.supabase\.co$/.exec(u.hostname);
  if (!m) throw new Error(`Not a Supabase project address: ${u.hostname}`);
  return m[1];
}

/** Reads the command line. Throws, with what to do, whenever writing isn't clearly asked for and allowed. */
export function parseArgs(argv: string[], supabaseUrl: string | undefined): Options {
  if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL. Nothing was done.");
  const ref = projectRef(supabaseUrl);
  const known = /^--(write|remove-old|live-project-yes|project=.*|limit=\d+)$/;
  const unknown = argv.filter((a) => !known.test(a));
  if (unknown.length) throw new Error(`Unknown option ${unknown.join(" ")}. Nothing was done.`);
  const write = argv.includes("--write");
  const removeOld = argv.includes("--remove-old");
  if (write && removeOld) throw new Error("Use --write or --remove-old, not both. Nothing was done.");
  const limitArg = argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : null;
  if (!write && !removeOld) return { mode: "dry-run", ref, limit };
  const named = argv.find((a) => a.startsWith("--project="))?.slice("--project=".length);
  if (!named) throw new Error(`Writing needs --project=<ref> naming the project (this is ${ref}). Nothing was done.`);
  if (named !== ref) throw new Error(`--project=${named} is not the project in NEXT_PUBLIC_SUPABASE_URL (${ref}). Nothing was done.`);
  if (ref !== TEST_PROJECT_REF && ref !== "local" && !argv.includes("--live-project-yes")) {
    throw new Error(`${ref} is not the TEST project (${TEST_PROJECT_REF}). Writing to it also needs --live-project-yes, with Yehuda's go for that project. Nothing was done.`);
  }
  return { mode: write ? "write" : "remove-old", ref, limit };
}

/** One picture the database points at. */
export type PictureRef = { table: "charities" | "charity_photos" | "charity_updates"; id: string; charityId: string; column: "logo_path" | "cover_path" | "storage_path" | "photo_path"; path: string };

async function readAll<T>(db: SupabaseClient, table: string, columns: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(columns).order("id").range(from, from + 999);
    if (error) throw new Error(`Couldn't read ${table}: ${error.message}. Nothing was changed.`);
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) return out;
  }
}

/** Every charity picture the database points at now. */
export async function listPictures(db: SupabaseClient): Promise<PictureRef[]> {
  const charities = await readAll<{ id: string; logo_path: string | null; cover_path: string | null }>(db, "charities", "id, logo_path, cover_path");
  const photos = await readAll<{ id: string; charity_id: string; storage_path: string }>(db, "charity_photos", "id, charity_id, storage_path");
  const updates = await readAll<{ id: string; charity_id: string; photo_path: string | null }>(db, "charity_updates", "id, charity_id, photo_path");
  const own = (charityId: string, path: string) => path.toLowerCase().startsWith(`${charityId.toLowerCase()}/`) && !path.includes("..");
  const refs: PictureRef[] = [
    ...charities.flatMap((c) => (["logo_path", "cover_path"] as const).flatMap((column) => (c[column] ? [{ table: "charities" as const, id: c.id, charityId: c.id, column, path: c[column]! }] : []))),
    ...photos.map((p) => ({ table: "charity_photos" as const, id: p.id, charityId: p.charity_id, column: "storage_path" as const, path: p.storage_path })),
    ...updates.flatMap((u) => (u.photo_path ? [{ table: "charity_updates" as const, id: u.id, charityId: u.charity_id, column: "photo_path" as const, path: u.photo_path }] : [])),
  ];
  return refs.filter((r) => own(r.charityId, r.path));
}

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp" };
const kb = (n: number) => `${Math.round(n / 1024)} kB`;

/** The plan for one old picture: its new name, its copies, and whether it must be cleaned first. Reads only. */
export async function planPicture(bytes: Buffer, path: string) {
  const type = TYPES[path.slice(path.lastIndexOf(".") + 1).toLowerCase()];
  if (!type) return null;
  const meta = await sharp(bytes).metadata();
  // Hidden details (a phone's GPS position) or a picture larger than an upload may be: cleaned as an upload is.
  const clean = Boolean(meta.exif || meta.xmp || meta.iptc || (meta.orientation ?? 1) > 1 || Math.max(meta.width ?? 0, meta.height ?? 0) > MAX_IMAGE_SIDE);
  const original = clean ? await cleanImageBytes(bytes, type) : bytes;
  const { width, height } = clean ? await sharp(original).metadata() : meta;
  if (!width || !height) return null;
  const newPath = withSize(path, width, height);
  return { type, clean, original, newPath, copies: await makeCopies(original, newPath) };
}

export type Log = (line: string) => void;

/** Make the copies (mode "write"), or say what would be made ("dry-run"). */
export async function makeAllCopies(db: SupabaseClient, opts: Options, log: Log) {
  const bucket = db.storage.from(BUCKET);
  const todo = (await listPictures(db)).filter((r) => !pictureSize(r.path));
  const list = opts.limit ? todo.slice(0, opts.limit) : todo;
  const totals = { pictures: 0, done: 0, skipped: 0, failed: 0, originalBytes: 0, copyBytes: 0 };
  log(`${list.length} picture(s) without copies${opts.limit && todo.length > list.length ? ` (of ${todo.length}, --limit)` : ""}. ${opts.mode === "write" ? "Writing." : "Dry run: nothing is written."}`);
  for (const r of list) {
    totals.pictures++;
    const what = `${r.table}.${r.column} ${r.id}: ${r.path}`;
    const got = await bucket.download(r.path);
    if (got.error || !got.data) {
      totals.skipped++;
      log(`  skip ${what} (couldn't read the file: ${got.error?.message ?? "empty"})`);
      continue;
    }
    const bytes = Buffer.from(await got.data.arrayBuffer());
    const plan = await planPicture(bytes, r.path).catch(() => null);
    if (!plan) {
      totals.skipped++;
      log(`  skip ${what} (not a picture that can be read)`);
      continue;
    }
    totals.originalBytes += bytes.length;
    const copyBytes = plan.copies.reduce((n, c) => n + c.bytes.length, 0);
    totals.copyBytes += copyBytes;
    const line = `${what} -> ${plan.newPath} (${kb(bytes.length)}${plan.clean ? ", cleaned of hidden details" : ""}), copies ${plan.copies.map((c) => `${c.width} (${kb(c.bytes.length)})`).join(", ") || "none (already small)"}`;
    if (opts.mode !== "write") {
      log(`  would make ${line}`);
      continue;
    }
    const blob = (b: Buffer, type: string) => new Blob([new Uint8Array(b)], { type });
    const ups = await Promise.all([
      ...plan.copies.map((c) => bucket.upload(c.path, blob(c.bytes, "image/webp"), { contentType: "image/webp", upsert: true })),
      plan.clean ? bucket.upload(plan.newPath, blob(plan.original, plan.type), { contentType: plan.type, upsert: true }) : bucket.copy(r.path, plan.newPath),
    ]);
    const upError = ups.find((u) => u.error)?.error;
    if (upError && !/already exists|Duplicate/i.test(upError.message)) {
      await bucket.remove(pictureFiles(plan.newPath).filter((p) => p !== r.path));
      totals.failed++;
      log(`  FAILED ${what} (${upError.message}); nothing changed for it`);
      continue;
    }
    // Only if the row still names the old file: a charity may have changed its picture meanwhile.
    const { data, error } = await db.from(r.table).update({ [r.column]: plan.newPath }).eq("id", r.id).eq(r.column, r.path).select("id");
    if (error || !data?.length) {
      await bucket.remove(pictureFiles(plan.newPath).filter((p) => p !== r.path));
      totals[error ? "failed" : "skipped"]++;
      log(`  ${error ? "FAILED" : "skip"} ${what} (${error ? error.message : "changed since it was read"}); what was made for it is removed`);
      continue;
    }
    totals.done++;
    log(`  made ${line}`);
  }
  log(
    `${opts.mode === "write" ? `Done: ${totals.done} given copies, ${totals.skipped} skipped, ${totals.failed} failed.` : "Dry run, nothing written."} ` +
      `Full-size files read: ${kb(totals.originalBytes)}; copies ${opts.mode === "write" ? "stored" : "it would store"}: ${kb(totals.copyBytes)}.`,
  );
  return totals;
}

/** The old full-size file a picture was renamed from (`a.2400x1800.jpg` -> `a.jpg`), once nothing points at it. */
export async function removeOldOriginals(db: SupabaseClient, opts: Options, log: Log) {
  const refs = await listPictures(db);
  const current = new Set(refs.map((r) => r.path));
  const old = refs
    .filter((r) => pictureSize(r.path))
    .map((r) => r.path.replace(/\.\d+x\d+(\.[a-z]+)$/, "$1"))
    .filter((p) => !current.has(p));
  log(`${old.length} picture(s) may still have their full-size file from before copies. ${opts.mode === "remove-old" ? "Removing." : "Dry run: nothing is removed."}`);
  if (opts.mode !== "remove-old" || !old.length) return { removed: 0 };
  let removed = 0;
  for (let i = 0; i < old.length; i += 100) {
    const { data, error } = await db.storage.from(BUCKET).remove(old.slice(i, i + 100));
    if (error) throw new Error(`Couldn't remove old files: ${error.message}. ${removed} removed so far.`);
    removed += (data ?? []).length;
  }
  log(`Removed ${removed} old full-size file(s).`);
  return { removed };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2), process.env.NEXT_PUBLIC_SUPABASE_URL);
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) throw new Error("Missing SUPABASE_SECRET_KEY. Nothing was done.");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, { auth: { persistSession: false } });
  console.log(`Project ${opts.ref}, ${opts.mode}.`);
  if (opts.mode === "remove-old") await removeOldOriginals(db, opts, console.log);
  else {
    await makeAllCopies(db, opts, console.log);
    if (opts.mode === "dry-run") await removeOldOriginals(db, opts, console.log);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
