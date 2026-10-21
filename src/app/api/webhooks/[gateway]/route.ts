import { NextResponse, type NextRequest } from "next/server";
import { confirmPayment } from "@/lib/donations/confirm";
import { handleDispute, handleRefund } from "@/lib/donations/reverse";
import { logAudit } from "@/lib/audit";
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
  // Only an event we have finished with is marked processed. Anything unfinished
  // (still pending at the gateway, or a database or gateway error) leaves
  // processed_at empty and answers with an error status, so the gateway sends the
  // event again and the repeat is processed (see the lookup above).
  if (event.reference && (event.type === "payment_succeeded" || event.type === "payment_failed")) {
    let outcome;
    try {
      outcome = await confirmPayment(event.reference);
    } catch (e) {
      console.error(`[webhook] ${gateway.name} event ${event.eventId} not finished`, e);
      return new NextResponse("Try again", { status: 500, headers: { "Retry-After": "60" } });
    }
    if (outcome === "pending") {
      return new NextResponse("Still confirming", { status: 503, headers: { "Retry-After": "60" } });
    }
    if (outcome === "not_found" || outcome === "review") {
      // Needs a person. The audit log is the durable follow-up (review is logged by
      // confirmPayment); a repeat delivery would not change the answer.
      if (outcome === "not_found") {
        await logAudit({
          actorUserId: null,
          action: "webhook.unmatched_payment",
          entityType: "gateway_event",
          entityId: eventRowId,
          details: { gateway: gateway.name, eventId: event.eventId, reference: event.reference },
        });
      }
    }
  }
  // Refunds and disputes: a full refund marks the donation refunded; anything else is held for a person
  // (Admin, Payments). Signed by the gateway, so trusted; repeats change nothing twice.
  if (event.type === "refund_processed" || event.type === "dispute_opened" || event.type === "dispute_resolved") {
    try {
      if (event.type === "refund_processed") await handleRefund(event.reference, event.amountCents ?? null, eventRowId, event.currency ?? null);
      else await handleDispute(event.reference, event.type === "dispute_opened" ? "opened" : "resolved", event.detail ?? null, eventRowId);
    } catch (e) {
      console.error(`[webhook] ${gateway.name} event ${event.eventId} not finished`, e);
      return new NextResponse("Try again", { status: 500, headers: { "Retry-After": "60" } });
    }
  }
  const { error: doneError } = await db
    .from("gateway_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventRowId);
  if (doneError) return new NextResponse("Error", { status: 500 });
  return NextResponse.json({ ok: true });
}
