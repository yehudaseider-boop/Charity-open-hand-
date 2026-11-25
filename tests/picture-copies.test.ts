/**
 * "Resize at upload" (Yehuda, 25/11/2026): charity pictures get lighter copies once, at upload, and pages and the app
 * pick the right one. Checks: the widths, never enlarged, hidden details gone, a logo's see-through parts kept, old
 * pictures (no copies) still shown as stored, copies removed with their picture, the one-off run's safety catches,
 * and that each website placement gives a 375 px phone at least three pixels per point and a laptop at least two.
 */
import sharp from "sharp";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PictureSlot } from "@/lib/charity/picture-sizes";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/charity/queries", () => ({ publicImageUrl: (p: string | null) => (p ? `https://ref.supabase.co/storage/v1/object/public/charity-public/${p}` : null) }));

const { makeCopies, preparePicture, removePicture, storePicture } = await import("@/lib/charity/picture-copies");
const sizes = await import("@/lib/charity/picture-sizes");
const { SLOTS } = await import("@/lib/charity/picture-slots");
const { CharityImage } = await import("@/components/charity-image");
const script = await import("../scripts/make-picture-copies");

const C = "c0000000-0000-0000-0000-000000000001";

/** A photo with real detail (noise), like a phone's, so file sizes mean something. */
async function photo(width: number, height: number, format: "jpeg" | "png" = "jpeg", exif = false) {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = (i * 7919 + ((i / 3) | 0) % width) % 256;
  let img = sharp(raw, { raw: { width, height, channels: 3 } });
  if (exif) img = img.withExif({ IFD0: { Make: "PhoneCo" }, IFD3: { GPSLatitudeRef: "S", GPSLatitude: "26/1 9/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "28/1 2/1 0/1" } });
  return format === "png" ? img.png().toBuffer() : img.jpeg({ quality: 92 }).toBuffer();
}

/** A logo: a blue circle on a see-through square. */
async function logo(side: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><circle cx="${side / 2}" cy="${side / 2}" r="${side / 3}" fill="#1749B5"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

describe("copies made at upload", () => {
  it("a phone photo gets 640, 1280 and 1920 wide WebP copies, its size in its name", async () => {
    const p = await preparePicture(await photo(2400, 1800), "image/jpeg", `${C}/cover-a.jpg`);
    expect(p.path).toBe(`${C}/cover-a.2400x1800.jpg`);
    expect(p.copies.map((c) => [c.path, c.width])).toEqual([
      [`${C}/cover-a.2400x1800.w640.webp`, 640],
      [`${C}/cover-a.2400x1800.w1280.webp`, 1280],
      [`${C}/cover-a.2400x1800.w1920.webp`, 1920],
    ]);
    for (const c of p.copies) {
      const m = await sharp(c.bytes).metadata();
      expect([m.format, m.width, m.height]).toEqual(["webp", c.width, Math.round((c.width * 1800) / 2400)]);
    }
  });

  it("never makes a copy wider than the picture (a small one gets fewer, or none)", async () => {
    const mid = await preparePicture(await photo(1000, 750), "image/jpeg", `${C}/photos/b.jpg`);
    expect(mid.copies.map((c) => c.width)).toEqual([640]);
    const small = await preparePicture(await photo(500, 400), "image/jpeg", `${C}/updates/c.jpg`);
    expect(small.path).toBe(`${C}/updates/c.500x400.jpg`);
    expect(small.copies).toEqual([]);
    expect(sizes.pictureForBox(small.path, 343, 193, 3)).toBe(small.path); // the original: nothing larger exists
  });

  it("a huge photo is first brought down to 2 400 px, as before", async () => {
    const p = await preparePicture(await photo(4032, 3024), "image/jpeg", `${C}/cover-d.jpg`);
    expect(p.path).toBe(`${C}/cover-d.2400x1800.jpg`);
  });

  it("strips a phone photo's GPS position from the picture and every copy", async () => {
    const withGps = await photo(1400, 1050, "jpeg", true);
    expect((await sharp(withGps).metadata()).exif).toBeDefined();
    const p = await preparePicture(withGps, "image/jpeg", `${C}/photos/e.jpg`);
    expect((await sharp(p.original).metadata()).exif).toBeUndefined();
    for (const c of p.copies) expect((await sharp(c.bytes).metadata()).exif).toBeUndefined();
  });

  it("keeps a logo's see-through parts in its 128, 256 and 512 copies", async () => {
    const p = await preparePicture(await logo(600), "image/png", `${C}/logo-f.png`);
    expect(p.copies.map((c) => c.width)).toEqual([128, 256, 512]);
    for (const c of p.copies) {
      const img = sharp(c.bytes);
      expect((await img.metadata()).hasAlpha).toBe(true);
      const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(data[3]).toBe(0); // the top-left corner is still see-through
      const mid = ((info.height >> 1) * info.width + (info.width >> 1)) * 4;
      expect(data[mid + 3]).toBe(255); // the circle is solid
    }
  });

  it("copies are much lighter than the picture they come from", async () => {
    const p = await preparePicture(await photo(2400, 1800), "image/jpeg", `${C}/cover-g.jpg`);
    const w1280 = p.copies.find((c) => c.width === 1280)!;
    expect(w1280.bytes.length).toBeLessThan(p.original.length / 2);
  });

  it("makeCopies on its own follows the name: none for a name without a size", async () => {
    expect(await makeCopies(await photo(800, 600), `${C}/photos/old.jpg`)).toEqual([]);
  });
});

type Up = { path: string; type: string };
function bucket(fail: (path: string) => boolean = () => false) {
  const ups: Up[] = [];
  const removed: string[] = [];
  return {
    ups,
    removed,
    upload: async (path: string, body: Blob, o: { contentType: string }) => (fail(path) ? { error: { message: "storage down" } } : (ups.push({ path, type: o.contentType }), { error: null })),
    remove: async (paths: string[]) => (removed.push(...paths), { error: null }),
  };
}
const fileOf = async (bytes: Buffer, type: string, name: string) => new File([new Uint8Array(bytes)], name, { type });

describe("storing a picture", () => {
  it("stores the copies, then the picture under its sized name", async () => {
    const b = bucket();
    const r = await storePicture(b, `${C}/cover-h.jpg`, await fileOf(await photo(2000, 1500), "image/jpeg", "h.jpg"));
    expect(r.path).toBe(`${C}/cover-h.2000x1500.jpg`);
    expect(b.ups.map((u) => u.path)).toEqual([`${C}/cover-h.2000x1500.w640.webp`, `${C}/cover-h.2000x1500.w1280.webp`, `${C}/cover-h.2000x1500.w1920.webp`, `${C}/cover-h.2000x1500.jpg`]);
    expect(b.ups.at(-1)!.type).toBe("image/jpeg");
  });

  it("if a copy can't be stored, the picture is stored as before (full size, no copies) and nothing half-made stays", async () => {
    const b = bucket((p) => p.endsWith(".w1280.webp"));
    const r = await storePicture(b, `${C}/photos/i.jpg`, await fileOf(await photo(2000, 1500), "image/jpeg", "i.jpg"));
    expect(r.path).toBe(`${C}/photos/i.jpg`);
    expect(b.removed.sort()).toEqual([`${C}/photos/i.2000x1500.w1920.webp`, `${C}/photos/i.2000x1500.w640.webp`]);
    expect(sizes.pictureCandidates(r.path!)).toEqual([{ path: r.path, width: 0 }]);
  });

  it("if the picture itself can't be stored, its copies are removed and the upload says it failed", async () => {
    const b = bucket((p) => p.endsWith(".jpg"));
    const r = await storePicture(b, `${C}/photos/j.jpg`, await fileOf(await photo(1400, 1050), "image/jpeg", "j.jpg"));
    expect(r.error).toBeTruthy();
    expect(b.removed).toEqual([`${C}/photos/j.1400x1050.w640.webp`, `${C}/photos/j.1400x1050.w1280.webp`]);
  });

  it("a file that only starts like a picture is refused, with nothing stored", async () => {
    const b = bucket();
    const r = await storePicture(b, `${C}/photos/k.jpg`, await fileOf(Buffer.from([0xff, 0xd8, 0xff, 0, 1, 2, 3]), "image/jpeg", "k.jpg"));
    expect(r.error).toBeTruthy();
    expect(b.ups).toEqual([]);
  });

  it("removing a picture removes it with every copy (and the full-size file it had before copies)", async () => {
    const b = bucket();
    await removePicture(b, `${C}/logo-l.900x900.png`);
    expect(b.removed).toEqual([`${C}/logo-l.900x900.png`, `${C}/logo-l.900x900.w128.webp`, `${C}/logo-l.900x900.w256.webp`, `${C}/logo-l.900x900.w512.webp`, `${C}/logo-l.png`]);
    const old = bucket();
    await removePicture(old, `${C}/logo-old.png`);
    expect(old.removed).toEqual([`${C}/logo-old.png`]);
  });
});

describe("pictures from before copies (no size in the name)", () => {
  const old = `${C}/cover-old.jpg`;
  it("are shown as stored: no srcset on the website, the original in the app", () => {
    expect(sizes.pictureSrcSet(old, (p) => p)).toBe("");
    expect(sizes.pictureForBox(old, 343, 193, 3)).toBe(old);
    expect(sizes.pictureForBox(`https://ref.supabase.co/storage/v1/object/public/charity-public/${old}`, 343, 193, 3)).toBe(`https://ref.supabase.co/storage/v1/object/public/charity-public/${old}`);
    const html = renderToStaticMarkup(createElement(CharityImage, { path: old, alt: "", width: 1200, height: 675, slots: SLOTS.pageCover }));
    expect(html).toContain(`src="https://ref.supabase.co/storage/v1/object/public/charity-public/${old}"`);
    expect(html).not.toContain("srcSet");
    expect(html).not.toContain("srcset");
  });

  it("new pictures get a srcset of their copies and the original", () => {
    const html = renderToStaticMarkup(createElement(CharityImage, { path: `${C}/cover-n.2400x1800.jpg`, alt: "", width: 1200, height: 675, slots: SLOTS.pageCover }));
    expect(html).toMatch(/srcSet="[^"]*cover-n\.2400x1800\.w640\.webp 640w, [^"]*w1280\.webp 1280w, [^"]*w1920\.webp 1920w, [^"]*cover-n\.2400x1800\.jpg 2400w"/);
    expect(html).toContain('sizes="(min-width: 1200px) 2304px, (min-width: 640px) calc((100vw - 48px) * 2), calc(100vw - 32px)"');
  });
});

describe("the app picks by its box", () => {
  const url = `https://ref.supabase.co/storage/v1/object/public/charity-public/${C}/cover-a.2400x1800.jpg`;
  it("a card on an iPhone gets the 1280 copy; a full-screen story card gets the original", () => {
    expect(sizes.pictureForBox(url, 343, 193, 3)).toBe(url.replace(".jpg", ".w1280.webp"));
    expect(sizes.pictureForBox(url, 390, 844, 3)).toBe(url);
    expect(sizes.pictureForBox(url, 220, 165, 3)).toBe(url.replace(".jpg", ".w1280.webp")); // 660 px: the 640 is too narrow
    expect(sizes.pictureForBox(url, 100, 75, 2)).toBe(url.replace(".jpg", ".w640.webp"));
  });
});

/** Works out a `sizes` value the way a browser does, for the forms our slots use. */
function evalSizes(value: string, viewport: number): number {
  for (const entry of value.split(/,\s*(?![^()]*\))/)) {
    const m = /^\(min-width: (\d+)px\)\s+(.*)$/.exec(entry.trim());
    if (m && viewport < Number(m[1])) continue;
    const len = (m ? m[2] : entry).trim();
    const expr = len.replace(/^calc/, "").replace(/(\d+(?:\.\d+)?)vw/g, `($1*${viewport}/100)`).replace(/(\d+(?:\.\d+)?)px/g, "$1");
    return Function(`return (${expr})`)() as number;
  }
  throw new Error(`no size for ${viewport}`);
}
/** The browser's choice from a srcset: the narrowest file wide enough for the size times the screen's density. */
function choose(candidates: { width: number }[], cssWidth: number, dpr: number) {
  return candidates.find((c) => c.width >= cssWidth * dpr) ?? candidates.at(-1)!;
}
/** The box's real width on screen for this viewport (the slot without the laptop doubling). */
function boxWidth(slots: PictureSlot[], viewport: number) {
  const slot = slots.find((s) => !s.media || viewport >= Number(/(\d+)px/.exec(s.media)![1]))!;
  return { width: evalSizes(slot.width, viewport), aspect: slot.aspect };
}

describe("every website placement is sharp: 3x on a 375 px phone, 2x on a laptop", () => {
  const pictures = {
    photo: [`${C}/cover-p.2400x1800.jpg`, `${C}/photos/q.1800x2400.jpg`, `${C}/updates/r.2400x800.jpg`],
    logo: [`${C}/logo-s.1024x1024.png`, `${C}/logo-t.1200x600.png`],
  };
  const placements = Object.entries(SLOTS) as [keyof typeof SLOTS, PictureSlot[]][];
  for (const [name, slots] of placements) {
    const kind = /Logo$/.test(name) ? "logo" : "photo";
    for (const path of pictures[kind]) {
      for (const [viewport, dpr, wanted] of [[375, 3, 3], [1440, 1, 2], [1440, 2, 2], [800, 1, 2]] as const) {
        it(`${name}, ${path.split("/").pop()}, ${viewport} px at ${dpr}x: at least ${wanted} pixels per point`, () => {
          const box = boxWidth(slots, viewport);
          const drawn = box.width * sizes.coverStretch(sizes.pictureSize(path), box.aspect); // how wide the picture is drawn
          const pick = choose(sizes.pictureCandidates(path), evalSizes(sizes.pictureSizes(slots, path), viewport), dpr);
          const original = sizes.pictureSize(path)!.width;
          // As sharp as the source allows: the original itself is the most there is.
          expect(pick.width / drawn).toBeGreaterThanOrEqual(Math.min(wanted, original / drawn) - 1e-9);
          if (original / drawn >= wanted) expect(pick.width / drawn).toBeGreaterThanOrEqual(wanted);
        });
      }
    }
  }

  it("a phone takes a lighter copy, not the full-size file, for the page's cover and a card", () => {
    const p = `${C}/cover-p.2400x1800.jpg`;
    for (const slots of [SLOTS.pageCover, SLOTS.cardCover, SLOTS.pageUpdate, SLOTS.pageGallery]) {
      expect(choose(sizes.pictureCandidates(p), evalSizes(sizes.pictureSizes(slots, p), 375), 3).width).toBeLessThan(2400);
    }
    expect(choose(sizes.pictureCandidates(`${C}/logo-s.1024x1024.png`), evalSizes(sizes.pictureSizes(SLOTS.pageLogo, `${C}/logo-s.1024x1024.png`), 375), 3).width).toBe(512);
  });
});

describe("the one-off run for pictures already stored (scripts/make-picture-copies.ts)", () => {
  const TEST = `https://${script.TEST_PROJECT_REF}.supabase.co`;
  const LIVE = "https://abcdefghijklmnopqrst.supabase.co";
  it("only reads unless told to write, and names the project to write to", () => {
    expect(script.parseArgs([], TEST).mode).toBe("dry-run");
    expect(script.parseArgs([], LIVE).mode).toBe("dry-run");
    expect(() => script.parseArgs(["--write"], TEST)).toThrow(/--project=<ref>/);
    expect(() => script.parseArgs(["--write", "--project=someotherprojectref1"], TEST)).toThrow(/is not the project/);
    expect(script.parseArgs(["--write", `--project=${script.TEST_PROJECT_REF}`], TEST).mode).toBe("write");
    expect(() => script.parseArgs(["--writ"], TEST)).toThrow(/Unknown option/);
    expect(() => script.parseArgs([], undefined)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("refuses the live project (any project but TEST) without a second flag", () => {
    expect(() => script.parseArgs(["--write", "--project=abcdefghijklmnopqrst"], LIVE)).toThrow(/not the TEST project.*--live-project-yes/);
    expect(() => script.parseArgs(["--remove-old", "--project=abcdefghijklmnopqrst"], LIVE)).toThrow(/--live-project-yes/);
    expect(script.parseArgs(["--write", "--project=abcdefghijklmnopqrst", "--live-project-yes"], LIVE).mode).toBe("write");
  });

  function fakeDb(rows: Record<string, Record<string, unknown>[]>, files: Record<string, Buffer>) {
    const calls: string[] = [];
    const db = {
      calls,
      from: (table: string) => {
        let patch: Record<string, unknown> | null = null;
        const where: [string, unknown][] = [];
        const q = {
          select: () => q,
          order: () => q,
          range: async () => ({ data: rows[table] ?? [], error: null }),
          update: (p: Record<string, unknown>) => ((patch = p), q),
          eq: (c: string, v: unknown) => (where.push([c, v]), q),
          then: (ok: (v: unknown) => unknown) => {
            const hit = (rows[table] ?? []).filter((r) => where.every(([c, v]) => r[c] === v));
            if (patch) {
              calls.push(`update ${table} ${JSON.stringify(patch)}`);
              hit.forEach((r) => Object.assign(r, patch));
            }
            return Promise.resolve({ data: hit, error: null }).then(ok);
          },
        };
        return q;
      },
      storage: {
        from: () => ({
          download: async (p: string) => (files[p] ? { data: new Blob([new Uint8Array(files[p])]), error: null } : { data: null, error: { message: "not found" } }),
          upload: async (p: string) => (calls.push(`upload ${p}`), { error: null }),
          copy: async (a: string, b: string) => (calls.push(`copy ${a} -> ${b}`), { error: null }),
          remove: async (ps: string[]) => (calls.push(`remove ${ps.join(" ")}`), { data: ps.map((name) => ({ name })), error: null }),
        }),
      },
    };
    return db;
  }

  it("a dry run reads and reports, and writes nothing", async () => {
    const rows = { charities: [{ id: C, logo_path: null, cover_path: `${C}/cover-o.jpg` }], charity_photos: [], charity_updates: [] };
    const db = fakeDb(rows, { [`${C}/cover-o.jpg`]: await photo(1600, 1200) });
    const lines: string[] = [];
    const t = await script.makeAllCopies(db as never, script.parseArgs([], TEST), (l) => lines.push(l));
    expect(db.calls).toEqual([]);
    expect(rows.charities[0].cover_path).toBe(`${C}/cover-o.jpg`);
    expect(t.copyBytes).toBeGreaterThan(0);
    expect(lines.join("\n")).toMatch(/would make .*cover-o\.1600x1200\.jpg.*copies 640 .*1280/);
  });

  it("writing stores the copies, copies the picture to its new name, and points the row at it; a second run does nothing", async () => {
    const rows = { charities: [{ id: C, logo_path: `${C}/logo-o.png`, cover_path: null }], charity_photos: [{ id: "p1", charity_id: C, storage_path: `${C}/photos/o.jpg` }], charity_updates: [] };
    const db = fakeDb(rows, { [`${C}/logo-o.png`]: await logo(300), [`${C}/photos/o.jpg`]: await photo(900, 600, "jpeg", true) });
    const opts = script.parseArgs(["--write", `--project=${script.TEST_PROJECT_REF}`], TEST);
    await script.makeAllCopies(db as never, opts, () => {});
    expect(rows.charities[0].logo_path).toBe(`${C}/logo-o.300x300.png`);
    expect(rows.charity_photos[0].storage_path).toBe(`${C}/photos/o.900x600.jpg`);
    expect(db.calls).toContain(`copy ${C}/logo-o.png -> ${C}/logo-o.300x300.png`); // same bytes, nothing to clean
    expect(db.calls).toContain(`upload ${C}/photos/o.900x600.jpg`); // it carried a GPS position: cleaned, as an upload is
    expect(db.calls).toEqual(expect.arrayContaining([`upload ${C}/logo-o.300x300.w128.webp`, `upload ${C}/logo-o.300x300.w256.webp`, `upload ${C}/photos/o.900x600.w640.webp`]));
    expect(db.calls.some((c) => c.startsWith("remove"))).toBe(false); // the old files stay until --remove-old
    db.calls.length = 0;
    await script.makeAllCopies(db as never, opts, () => {});
    expect(db.calls).toEqual([]);
  });

  it("later, --remove-old removes the full-size files from before, never one a row still points at", async () => {
    const rows = { charities: [{ id: C, logo_path: `${C}/logo-o.300x300.png`, cover_path: `${C}/cover-z.jpg` }], charity_photos: [], charity_updates: [] };
    const db = fakeDb(rows, {});
    expect(await script.removeOldOriginals(db as never, script.parseArgs([], TEST), () => {})).toEqual({ removed: 0 });
    expect(db.calls).toEqual([]);
    await script.removeOldOriginals(db as never, script.parseArgs(["--remove-old", `--project=${script.TEST_PROJECT_REF}`], TEST), () => {});
    expect(db.calls).toEqual([`remove ${C}/logo-o.png`]);
  });
});
