/**
 * The live charity directory: approved charities' public profile, their
 * photos and updates. Pure functions (no React Native), so the website's
 * test suite can check them.
 */
import type { Campaign, Cause, Charity, CharityPhoto, CharityUpdate } from "../data/sample";

export type CharityRow = {
  id: string;
  slug: string;
  name_en: string;
  description_en: string | null;
  funds_use_en: string | null;
  impact_en?: string | null;
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
  "id, slug, name_en, description_en, funds_use_en, impact_en, cover_path, suburb, city, is_s18a, mandate_signed_at, charity_categories(category_id)";

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
    id: row.id,
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
    impact: row.impact_en?.trim() || null,
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

/**
 * Saved charities, newest first, without repeats. Used when someone who saved
 * charities on this phone signs in: those join the ones already on their account.
 */
export function mergeSaved(account: string[], device: string[]): string[] {
  return [...new Set([...device, ...account])];
}

/** Saved slugs in order, as charities from the directory (ones no longer listed drop out). */
export function savedCharities(slugs: string[], directory: Charity[]): Charity[] {
  const bySlug = new Map(directory.map((c) => [c.slug, c]));
  return slugs.flatMap((s) => bySlug.get(s) ?? []);
}

/** Charities the donor gave to before, most recent first, each once: "Give again". */
export function givenBefore(gifts: { charitySlug: string; date: Date }[], charities: Charity[], limit = 6): Charity[] {
  const seen = new Set<string>();
  const out: Charity[] = [];
  for (const g of [...gifts].sort((a, b) => b.date.getTime() - a.date.getTime())) {
    if (seen.has(g.charitySlug)) continue;
    seen.add(g.charitySlug);
    const c = charities.find((x) => x.slug === g.charitySlug);
    if (c) out.push(c);
    if (out.length === limit) break;
  }
  return out;
}

export type CampaignRow = { id: string; title: string; description: string | null; target_cents: number | string | null; ends_at: string | null };
export type ProgressRow = { campaign_id: string; raised_cents: number | string; gift_count: number | string };

/** Active campaigns with their totals; any past its last day is left out (the server refuses those gifts too). */
export function toCampaigns(rows: CampaignRow[], progress: ProgressRow[], now: Date = new Date()): Campaign[] {
  return rows.flatMap((r) => {
    const endsAt = r.ends_at ? new Date(r.ends_at) : null;
    if (endsAt && endsAt.getTime() < now.getTime()) return [];
    const p = progress.find((x) => x.campaign_id === r.id);
    return [{
      id: r.id,
      title: r.title,
      description: r.description,
      targetCents: r.target_cents === null ? null : Number(r.target_cents),
      raisedCents: p ? Number(p.raised_cents) : 0,
      giftCount: p ? Number(p.gift_count) : 0,
      endsAt,
    }];
  });
}

/** How far along, as a whole percentage for the bar (0 to 100). */
export function campaignPercent(c: Pick<Campaign, "raisedCents" | "targetCents">): number {
  if (!c.targetCents || c.targetCents <= 0) return 0;
  return Math.min(100, Math.floor((c.raisedCents * 100) / c.targetCents));
}

export type RaisingNow = { campaign: Campaign; charity: Charity };

/**
 * "Raising now" on Discover: running campaigns of charities in the directory, the closest to their
 * goal first (a nearly-full bar is the strongest nudge), then the newest. At most `max`.
 */
export function raisingNow(rows: (CampaignRow & { charity_id: string })[], progress: ProgressRow[], charities: Charity[], max = 6, now: Date = new Date()): RaisingNow[] {
  const byId = new Map(charities.filter((c) => c.id).map((c) => [c.id!, c]));
  const out: RaisingNow[] = [];
  for (const r of rows) {
    const charity = byId.get(r.charity_id);
    const [campaign] = toCampaigns([r], progress, now);
    if (charity && campaign) out.push({ campaign, charity });
  }
  return out
    .map((x, i) => ({ x, i, pct: campaignPercent(x.campaign) }))
    .sort((a, b) => b.pct - a.pct || a.i - b.i)
    .slice(0, max)
    .map(({ x }) => x);
}
