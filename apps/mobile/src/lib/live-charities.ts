/**
 * The live charity directory: approved charities' public profile, their
 * photos and updates. Pure functions (no React Native), so the website's
 * test suite can check them.
 */
import type { Cause, Charity, CharityPhoto, CharityUpdate } from "../data/sample";

export type CharityRow = {
  id: string;
  slug: string;
  name_en: string;
  description_en: string | null;
  funds_use_en: string | null;
  cover_path: string | null;
  suburb: string | null;
  city: string | null;
  is_s18a: boolean;
  mandate_signed_at: string | null;
  charity_categories: { category_id: string }[] | null;
};
export type CategoryRow = { id: string; name_en: string };
export type PhotoRow = { id: string; storage_path: string; caption_en: string | null };
export type UpdateRow = { id: string; body_en: string; photo_path: string | null; created_at: string };

export const CHARITY_COLUMNS =
  "id, slug, name_en, description_en, funds_use_en, cover_path, suburb, city, is_s18a, mandate_signed_at, charity_categories(category_id)";

/** Public images live in the charity-public bucket. */
export function imageUrl(base: string, path: string | null): string | null {
  if (!path || path.includes("..")) return null;
  return `${base.replace(/\/$/, "")}/storage/v1/object/public/charity-public/${path.split("/").map(encodeURIComponent).join("/")}`;
}

/** The first sentence (or line) of a description, as the card's one-liner. */
export function oneLiner(text: string | null, max = 90): string {
  const t = (text ?? "").trim().split(/\n/)[0];
  const sentence = t.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? t;
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).trimEnd()}…`;
}

export function toCharity(row: CharityRow, base: string): Charity {
  const causeIds = (row.charity_categories ?? []).map((c) => c.category_id);
  return {
    slug: row.slug,
    nameEn: row.name_en,
    nameHe: "",
    cause: oneLiner(row.description_en),
    causeId: causeIds[0] ?? "",
    causeIds,
    area: [row.suburb, row.city].filter(Boolean).join(", "),
    photo: row.name_en,
    // Same rule as the website (charity_can_issue_18a in the database).
    issues18a: row.is_s18a && row.mandate_signed_at !== null,
    about: [row.description_en ?? "", row.funds_use_en ?? ""],
    coverUrl: imageUrl(base, row.cover_path),
  };
}

export function toCauses(categories: CategoryRow[], charities: Charity[]): Cause[] {
  const used = new Set(charities.flatMap((c) => c.causeIds ?? [c.causeId]));
  return [{ id: "all", label: "All" }, ...categories.filter((c) => used.has(c.id)).map((c) => ({ id: c.id, label: c.name_en }))];
}

export function toPhotos(rows: PhotoRow[], base: string): CharityPhoto[] {
  return rows.flatMap((r) => {
    const url = imageUrl(base, r.storage_path);
    return url ? [{ id: r.id, url, caption: r.caption_en }] : [];
  });
}

export function toUpdates(rows: UpdateRow[], base: string): CharityUpdate[] {
  return rows.map((r) => ({ id: r.id, date: new Date(r.created_at), body: r.body_en, photoUrl: imageUrl(base, r.photo_path) }));
}

export function inCause(c: Charity, cause: string): boolean {
  return cause === "all" || c.causeId === cause || (c.causeIds ?? []).includes(cause);
}
