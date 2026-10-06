import { NextResponse, type NextRequest } from "next/server";
import { confirmPayment } from "@/lib/donations/confirm";
import { gatewayByName } from "@/lib/gateway";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Payment notifications from the gateway.
 * 1. Check the signature (reject anything we can't verify).
 * 2. Store the event once (a repeat delivery is acknowledged and ignored).
 * 3. Ask the gateway's API directly before marking anything paid.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/webhooks/[gateway]">) {
  const { gateway: name } = await ctx.params;
  let gateway;
  try {
    gateway = gatewayByName(name);
  } catch {
    return new NextResponse("Unknown gateway", { status: 404 });
  }

  const raw = await request.text();
  const event = await gateway.parseWebhook(raw, request.headers);
  if (!event) return new NextResponse("Bad signature", { status: 401 });

  const db = createAdminClient();
  const { data: stored, error } = await db
    .from("gateway_events")
    .upsert(
      { gateway: gateway.name, event_id: event.eventId, event_type: event.type, payload: event.raw as object },
      { onConflict: "gateway,event_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) return new NextResponse("Error", { status: 500 });
  if (!stored?.length) return NextResponse.json({ ok: true, duplicate: true });

  if (event.reference && (event.type === "payment_succeeded" || event.type === "payment_failed")) {
    await confirmPayment(event.reference);
  }
  await db.from("gateway_events").update({ processed_at: new Date().toISOString() }).eq("id", stored[0].id);
  return NextResponse.json({ ok: true });
}
