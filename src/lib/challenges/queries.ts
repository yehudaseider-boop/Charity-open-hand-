import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PublicChallenge = {
  id: string;
  slug: string;
  charityId: string;
  charitySlug: string;
  charityName: string;
  starterName: string;
  title: string;
  reason: string | null;
  targetCents: number;
  endsAt: string | null;
  status: "active" | "stopped";
  createdAt: string;
  raisedCents: number;
  giftCount: number;
  people: number;
};

type Row = {
  id: string; slug: string; charity_id: string; charity_slug: string; charity_name: string; starter_name: string; title: string;
  reason: string | null; target_cents: number | string; ends_at: string | null; status: "active" | "stopped"; created_at: string;
  raised_cents: number | string; gift_count: number | string; people: number | string;
};

const toChallenge = (r: Row): PublicChallenge => ({
  id: r.id,
  slug: r.slug,
  charityId: r.charity_id,
  charitySlug: r.charity_slug,
  charityName: r.charity_name,
  starterName: r.starter_name,
  title: r.title,
  reason: r.reason,
  targetCents: Number(r.target_cents),
  endsAt: r.ends_at,
  status: r.status,
  createdAt: r.created_at,
  raisedCents: Number(r.raised_cents),
  giftCount: Number(r.gift_count),
  people: Number(r.people),
});

/** One challenge as anyone may see it (approved charities only; never who started it or who gave). */
export async function loadChallenge(slug: string): Promise<PublicChallenge | null> {
  if (!/^[a-z0-9-]{1,90}$/.test(slug)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("challenge_public", { p_slug: slug });
  if (error) throw error;
  const r = ((data ?? []) as Row[])[0];
  return r ? toChallenge(r) : null;
}

/** A charity's running challenges, for its public page. */
export async function loadRunningChallenges(charityId: string): Promise<PublicChallenge[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("challenge_public", { p_charity_id: charityId });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toChallenge);
}

export type CharityChallenge = Omit<PublicChallenge, "charityId" | "charitySlug" | "charityName" | "reason">;

/** Every challenge for a charity, with totals, for its own admins. */
export async function loadCharityChallenges(charityId: string): Promise<CharityChallenge[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("charity_challenges", { p_charity_id: charityId });
  if (error) throw error;
  return ((data ?? []) as Omit<Row, "charity_id" | "charity_slug" | "charity_name" | "reason">[]).map((r) => ({
    id: r.id,
    slug: r.slug,
    starterName: r.starter_name,
    title: r.title,
    targetCents: Number(r.target_cents),
    endsAt: r.ends_at,
    status: r.status,
    createdAt: r.created_at,
    raisedCents: Number(r.raised_cents),
    giftCount: Number(r.gift_count),
    people: Number(r.people),
  }));
}
