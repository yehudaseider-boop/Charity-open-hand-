import { NextResponse, type NextRequest } from "next/server";
import { audit } from "@/lib/charity/export";
import { it3dBytes, SOURCE_IDENTIFIER_LENGTH } from "@/lib/receipts/it3d";
import { authoriseIt3d, prepareIt3d, readChoice } from "@/lib/receipts/it3d-request";

const say = (message: string, status: number) =>
  new NextResponse(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

function fromThisSite(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === req.headers.get("host");
    } catch {
      return false;
    }
  }
  return req.headers.get("sec-fetch-site") === "same-origin";
}

/**
 * The IT3(d) data file (.psv) for SARS HTTPS. A POST, so the Source Identifier never sits in an address or a log.
 * It is used for this one file and never stored, logged or sent back.
 */
export async function POST(req: NextRequest, ctx: RouteContext<"/charity-admin/[id]/receipts/sars/file">) {
  const { id } = await ctx.params;
  // Only from this site's own page: the browser's Origin must be this site, or, when a browser sends no Origin,
  // Sec-Fetch-Site must say same-origin. A request with neither is refused like one from another site.
  if (!fromThisSite(req)) return say("This download only works from the SARS page on Givezy. Nothing was downloaded.", 403);
  const who = await authoriseIt3d(id);
  if ("status" in who) return say(who.message, who.status);

  const form = await req.formData().catch(() => null);
  const choice = readChoice(form?.get("year"), form?.get("period"));
  if (!form || !choice) return say("Choose a tax year and a period, then try again. Nothing was downloaded.", 400);
  const testData = form.get("test_data") === "T";
  const source = String(form.get("source_identifier") ?? "").replace(/^\s+|\s+$/g, "");
  const where = "SARS gives it to your submitter when they enrol for third-party data on HTTPS. With up to 50 receipts you can use the capture sheet on eFiling instead, without it.";
  if (!source) return say(`Type the Source Identifier SARS gave you. ${where}`, 400);
  if ([...source].length !== SOURCE_IDENTIFIER_LENGTH) {
    return say(`The Source Identifier must be exactly ${SOURCE_IDENTIFIER_LENGTH} characters. The one typed has ${[...source].length}. Check it was copied in full. ${where}`, 400);
  }
  if (/[|\r\n]/.test(source) || [...source].some((ch) => ch.codePointAt(0)! > 0xff || ch.codePointAt(0)! < 0x20)) {
    return say("The Source Identifier has a character SARS's file can't hold. Copy it again from SARS. Nothing was downloaded.", 400);
  }

  const result = await prepareIt3d(id, choice, { testData, sourceIdentifier: source });
  if (result.nil) return say("No s18A receipts in this period. If SARS asks for a nil declaration, it is done on eFiling, not with this file.", 409);
  if (!result.fileReady) return say("There are problems to fix first: they are listed on this page. Nothing was downloaded. The capture sheet still downloads with them marked.", 409);

  await audit({
    actorUserId: who.userId,
    action: "charity.it3d_file_downloaded",
    entityType: "charity",
    entityId: id,
    // Counts only: never an ID number or the Source Identifier.
    details: { taxYear: choice.taxYear, period: choice.period, testData, fileName: result.fileName, ...result.totals },
  });
  return new NextResponse(new Uint8Array(it3dBytes(result.lines)), {
    headers: {
      "Content-Type": "text/plain; charset=ISO-8859-1",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
