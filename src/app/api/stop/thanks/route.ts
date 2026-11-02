import type { NextRequest } from "next/server";
import { stopThankYous } from "@/lib/charity/thank-you-send";
import { oneClickStop, toStopPage } from "@/lib/email/one-click-stop";

/** One-click stop for thank-you emails from charities (List-Unsubscribe-Post), as the stop page's button. */
export async function POST(request: NextRequest) {
  return oneClickStop(request, stopThankYous);
}

/** Never acts: opening the address goes to the page that asks first. */
export async function GET(request: NextRequest) {
  return toStopPage(request, "/thanks/stop");
}
