import "server-only";
import { centsToRandDecimal, formatRand } from "@/lib/money";
import { toXlsx, type XlsxCell } from "@/lib/xlsx";
import type { It3dResult } from "./it3d";

/**
 * The eFiling capture sheet (.xlsx): what to type into SARS's IT3-01 form, for a charity with up to 50 s18A
 * receipts in the period (Guide p.14). Your charity's details once at the top (submitting and reporting entity),
 * then one row per donation with the donor's details, in the order the form asks, then the totals. The values
 * are the same ones the data file would carry; rows with a problem say so in the last column.
 */
export function it3dCaptureSheet(result: It3dResult, title: { charityName: string; period: string }): Buffer {
  const { entity, header, rows, amountColumn } = result.sheet;
  const width = header.length;
  const pad = (cells: XlsxCell[]) => [...cells, ...Array(Math.max(0, width - cells.length)).fill("")];
  const out: XlsxCell[][] = [];
  out.push(pad([`${title.charityName}, ${title.period}. Type these into the IT3-01 form on eFiling (Returns, Third Party Data, IT3(d)). Dates are dd/mm/yyyy.`]));
  out.push(pad([]));
  for (const [label, value] of entity) out.push(pad([label, value]));
  out.push(pad([]));
  const headingRow = out.length;
  out.push(header);
  for (const r of rows) {
    const note = r.problems.length ? `${r.blocking ? "Fix before submitting" : "Check"}: ${r.problems.join(" ")}` : "";
    out.push([...r.values, note]);
  }
  if (rows.length) {
    const totalCents = result.totals.totalCents;
    const total = pad(["Total", `${result.totals.donations} ${result.totals.donations === 1 ? "donation" : "donations"} (${formatRand(totalCents)})`]);
    total[amountColumn] = centsToRandDecimal(totalCents);
    out.push(total);
  } else {
    out.push(pad(["No s18A receipts in this period."]));
  }
  return toXlsx("IT3(d) capture sheet", pad(["Your charity (submitting and reporting entity)", "Value"]), out, [amountColumn], [headingRow]);
}
