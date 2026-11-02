import type { NextRequest } from "next/server";
import { stopAppeals } from "@/lib/charity/appeals";
import { oneClickStop, toStopPage } from "@/lib/email/one-click-stop";

/** One-click stop for a charity's news and appeals (List-Unsubscribe-Post). Stops that charity only. */
export async function POST(request: NextRequest) {
  return oneClickStop(request, async (token) => (await stopAppeals(token)) !== null);
}

/** Never acts: opening the address goes to the page that asks first. */
export async function GET(request: NextRequest) {
  return toStopPage(request, "/news/stop");
}
