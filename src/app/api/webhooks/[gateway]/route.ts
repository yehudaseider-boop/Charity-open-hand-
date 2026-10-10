import { NextResponse, type NextRequest } from "next/server";
import { confirmPayment } from "@/lib/donations/confirm";
import { gatewayByName } from "@/lib/gateway";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Payment notifications from the gateway.
 * 1. Check the signature (reject anything we can't verify).
 * 2. Store the event once. A repeat delivery is acknowledged and ignored,
 *    unless the first delivery never finished processing: then it is retried.
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

  let eventRowId = stored?.[0]?.id;
  if (!eventRowId) {
    // Seen before. Only skip it if that delivery was fully processed; if it
    // failed part-way (say the gateway's API was down), process it now.
    const { data: earlier, error: lookupError } = await db
      .from("gateway_events")
      .select("id, processed_at")
      .eq("gateway", gateway.name)
      .eq("event_id", event.eventId)
      .single();
    if (lookupError || !earlier) return new NextResponse("Error", { status: 500 });
    if (earlier.processed_at) return NextResponse.json({ ok: true, duplicate: true });
    eventRowId = earlier.id;
  }

  // confirmPayment is safe to repeat: a donation only moves pending -> paid/failed once.
  // If it throws, processed_at stays empty and the gateway's retry processes the event again.
  if (event.reference && (event.type === "payment_succeeded" || event.type === "payment_failed")) {
    await confirmPayment(event.reference);
  }
  await db.from("gateway_events").update({ processed_at: new Date().toISOString() }).eq("id", eventRowId);
  return NextResponse.json({ ok: true });
}
