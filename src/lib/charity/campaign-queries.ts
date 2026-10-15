import "server-only";
import { createClient } from "@/lib/supabase/server";

export type CampaignRow = {
  id: string;
  title: string;
  description: string | null;
  targetCents: number | null;
  endsAt: string | null;
  status: "draft" | "active" | "ended";
  raisedCents: number;
  giftCount: number;
};

/** A charity's campaigns with their running totals, read as the signed-in person (row-level security decides). */
export async function loadCampaigns(charityId: string): Promise<CampaignRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("id, title, description, target_cents, ends_at, status")
    .eq("charity_id", charityId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  const rows = data ?? [];
  const progress = new Map<string, { raised: number; count: number }>();
  if (rows.length) {
    const p = await supabase.rpc("campaign_progress", { p_campaign_ids: rows.map((r) => r.id) });
    if (p.error) throw p.error;
    for (const r of (p.data ?? []) as { campaign_id: string; raised_cents: number; gift_count: number }[]) {
      progress.set(r.campaign_id, { raised: Number(r.raised_cents), count: Number(r.gift_count) });
    }
  }
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description,
    targetCents: r.target_cents === null ? null : Number(r.target_cents),
    endsAt: r.ends_at,
    status: r.status,
    raisedCents: progress.get(r.id)?.raised ?? 0,
    giftCount: progress.get(r.id)?.count ?? 0,
  }));
}
