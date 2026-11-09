import { describe, expect, it } from "vitest";
import {
  buildIt3d,
  ERASED_LEFT_OUT,
  erasedWithoutSarsDetails,
  initialsAndNames,
  it3dBytes,
  it3dPeriodRange,
  messageCreateDate,
  NO_EMAIL,
  NO_PHONE,
  sarsPhone,
  type It3dCharity,
  type It3dDonor,
  type It3dInput,
  type It3dReceipt,
} from "@/lib/receipts/it3d";

const CHARITY_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE = "S".repeat(144);
const now = new Date("2027-04-15T07:30:00Z"); // 09:30:00 in Johannesburg

const charity = (over: Partial<It3dCharity> = {}): It3dCharity => ({
  id: CHARITY_ID,
  legalName: "Meals Fund NPC",
  tradingName: "Meals Fund",
  legalForm: "OTHER_CO",
  registrationNumber: "2010/123456/08",
  taxReference: "0001339050",
  pboNumber: "930012345",
  address: { line1: "PO Box 12", line2: null, suburb: "Rosebank", city: "Johannesburg", postalCode: "2196" },
  contactName: "Sarah Jane Levin",
  contactPhone: "+27821234567",
  contactEmail: "sarah@mealsfund.org.za",
  ...over,
});

const person = (over: Partial<It3dDonor> = {}): It3dDonor => ({
  type: "individual",
  firstName: "Thabo Peter",
  lastName: "Mokoena",
  organisationName: null,
  registrationNumber: null,
  idNumber: "8001015009087",
  taxReference: null,
  phone: "0821112222",
  email: "thabo@example.co.za",
  address: { line1: "12 Main Road", line2: "Flat 4", suburb: "Parkhurst", city: "Johannesburg", postalCode: "2193" },
  erased: false,
  ...over,
});

let n = 0;
const gift = (paidAt: string, amountCents: number, recordedMethod: string | null = null) => ({ id: `0000000${++n}-0000-4000-8000-000000000000`.slice(-36), paidAt, amountCents, recordedMethod });
const receipt = (over: Partial<It3dReceipt> = {}): It3dReceipt => ({
  receiptId: `r-${++n}`,
  receiptNumber: `MF-2027-000${n}`,
  donorKey: `key${n}`,
  donor: person(),
  donations: [gift("2026-05-10T08:00:00Z", 50_000)],
  ...over,
});

const input = (over: Partial<It3dInput> = {}): It3dInput => ({
  taxYear: 2027,
  period: "full_year",
  now,
  testData: false,
  sourceIdentifier: SOURCE,
  sourceSystemVersion: "0.1.0",
  uniqueFileId: "6a1f3c2e-9b7d-4e1a-8c5f-0d2b4a6e8f10",
  charity: charity(),
  receipts: [receipt()],
  ...over,
});

const fieldsOf = (line: string) => line.split("|");
const blocking = (r: ReturnType<typeof buildIt3d>) => r.problems.filter((p) => p.severity === "blocking").map((p) => p.message);
const warnings = (r: ReturnType<typeof buildIt3d>) => r.problems.filter((p) => p.severity === "warning").map((p) => p.message);

describe("IT3(d) file structure", () => {
  const one = receipt();
  const two = receipt({ donor: person({ firstName: "Lerato", lastName: "Dlamini", idNumber: "8001015009087" }), donations: [gift("2027-01-10T08:00:00Z", 125_000), gift("2026-06-01T08:00:00Z", 3_457)] });
  // Given out of order: the file sorts by receipt number, and each donor's gifts by date paid.
  const r = buildIt3d(input({ receipts: [two, one] }));

  it("is ready with no problems", () => {
    expect(r.problems).toEqual([]);
    expect(r.fileReady).toBe(true);
    expect(r.nil).toBe(false);
  });

  it("has GH, SE, the RE, then all DE, then all DR, then the trailer", () => {
    expect(r.lines.map((l) => fieldsOf(l).slice(0, 2).join("|"))).toEqual(["H|GH", "H|SE", "B|RE", "B|DE", "B|DE", "B|DR", "B|DR", "B|DR", "T|6"]);
  });

  it("has the BRS's number of fields in every record (pipes = fields - 1)", () => {
    const want: Record<string, number> = { GH: 18, SE: 25, RE: 29, DE: 32, DR: 10 };
    for (const line of r.lines) {
      const f = fieldsOf(line);
      const kind = f[0] === "T" ? "T" : f[1];
      const expected = kind === "T" ? 4 : want[kind];
      expect(f.length, `${kind}: ${line}`).toBe(expected);
      expect((line.match(/\|/g) ?? []).length).toBe(expected - 1);
      expect(line.startsWith("|")).toBe(false);
    }
  });

  it("fills the header as decided", () => {
    const gh = fieldsOf(r.lines[0]);
    expect(gh).toEqual([
      "H", "GH", "2027-04-15T09:30:00", "1", "6a1f3c2e-9b7d-4e1a-8c5f-0d2b4a6e8f10", "", "L", "I3D", "HTTPS", SOURCE,
      "Givezy", "0.1.0", "Sarah Jane", "Levin", "0821234567", "", "0821234567", "sarah@mealsfund.org.za",
    ]);
    expect(fieldsOf(buildIt3d(input({ testData: true })).lines[0])[6]).toBe("T");
  });

  it("makes the charity the submitting entity", () => {
    const se = fieldsOf(r.lines[1]);
    expect(se).toEqual([
      "H", "SE", "2027", "2026-03-01", "2027-02-28", "OTHER_CO", "Meals Fund NPC", "", "", "Meals Fund", "004", "2010/123456/08", "", "", "",
      "0001339050", "", "PO Box 12", "", "Rosebank", "Johannesburg", "2196", "", "0821234567", "sarah@mealsfund.org.za",
    ]);
  });

  it("makes the charity the one reporting entity, with Null Declaration N", () => {
    const re = fieldsOf(r.lines[2]);
    expect(re[2]).toBe("N");
    expect(re[3]).toBe(`RE-${CHARITY_ID}-2027`);
    expect(re[4]).toBe("1");
    expect(re.slice(5, 13)).toEqual(["OTHER_CO", "Meals Fund NPC", "Meals Fund", "2010/123456/08", "", "", "0001339050", "930012345"]);
    expect(re.slice(13, 20)).toEqual(["", "", "", "", "", "", ""]); // physical address left empty
    expect(re.slice(20, 25)).toEqual(["PO Box 12", "", "Rosebank", "Johannesburg", "2196"]);
    expect(re.slice(25)).toEqual(["", "0821234567", "sarah@mealsfund.org.za", "N"]);
  });

  it("numbers every body record 1..n and links DE to the RE (406 -> 304) and DR to its DE (506 -> 404)", () => {
    const body = r.lines.filter((l) => l.startsWith("B|")).map(fieldsOf);
    expect(body.map((f) => f[4])).toEqual(["1", "2", "3", "4", "5", "6"]);
    const reUnique = body[0][3];
    const des = body.filter((f) => f[1] === "DE");
    for (const de of des) expect(de[5]).toBe(reUnique);
    const deUniques = new Set(des.map((f) => f[3]));
    for (const dr of body.filter((f) => f[1] === "DR")) expect(deUniques.has(dr[5])).toBe(true);
    // The two gifts of the second donor point at the second DE.
    const drs = body.filter((f) => f[1] === "DR");
    expect(drs[1][5]).toBe(des[1][3]);
    expect(drs[2][5]).toBe(des[1][3]);
  });

  it("writes the donor as SARS asks: names, initials, ID, date of birth from the ID, postal address, phone, email", () => {
    const de = fieldsOf(r.lines[3]);
    expect(de).toEqual([
      "B", "DE", "N", expect.stringMatching(/^DE-11111111-1111-4111-8111-111111111111-2027-key/), "2", `RE-${CHARITY_ID}-2027`,
      "Mokoena", "TP", "Thabo Peter", "", "001", "8001015009087", "", "", "1980-01-01", "", "INDIVIDUAL",
      "", "", "", "", "", "", "",
      "12 Main Road", "Flat 4", "Parkhurst", "Johannesburg", "2193", "", "0821112222", "thabo@example.co.za",
    ]);
  });

  it("writes each donation: receipt number, CASH, date paid in Johannesburg, Rand value", () => {
    const drs = r.lines.filter((l) => l.startsWith("B|DR")).map(fieldsOf);
    expect(drs[0].slice(6)).toEqual([expect.stringMatching(/^MF-2027-/), "CASH", "2026-05-10", "500.00"]);
    expect(drs[1].slice(8)).toEqual(["2026-06-01", "34.57"]);
    expect(drs[2].slice(8)).toEqual(["2027-01-10", "1250.00"]);
    expect(drs[0][3]).toMatch(/^DR-/);
  });

  it("ends with a trailer: body count, empty hash, sum of all Rand values", () => {
    expect(r.lines.at(-1)).toBe("T|6||1784.57");
    expect(r.totals).toEqual({ receipts: 2, donors: 2, donations: 3, totalCents: 178_457 });
  });

  it("ends every record with CR LF, the trailer too, in Latin-1", () => {
    const bytes = it3dBytes(r.lines);
    const text = bytes.toString("latin1");
    expect(text.endsWith("T|6||1784.57\r\n")).toBe(true);
    expect(text.split("\r\n")).toHaveLength(r.lines.length + 1);
    expect(text.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const accented = buildIt3d(input({ receipts: [receipt({ donor: person({ lastName: "Müller-Ëlis" }) })] }));
    const b = it3dBytes(accented.lines);
    expect(b.includes(Buffer.from([0xfc]))).toBe(true); // ü as one Latin-1 byte, not UTF-8's two
    expect(b.toString("latin1")).toContain("Müller-Ëlis");
  });

  it("names the file I3D_1_<tax reference>_<file id>_<CCYYMMDDThhmmss>.psv", () => {
    expect(r.fileName).toBe("I3D_1_0001339050_6a1f3c2e-9b7d-4e1a-8c5f-0d2b4a6e8f10_20270415T093000.psv");
  });

  it("keeps one DE for the same donor on two receipts, with both receipts' gifts under it", () => {
    const a = receipt({ donorKey: "same", donations: [gift("2026-05-10T08:00:00Z", 1_000)] });
    const b = receipt({ donorKey: "same", donations: [gift("2026-07-10T08:00:00Z", 2_000)] });
    const x = buildIt3d(input({ receipts: [a, b] }));
    expect(x.lines.filter((l) => l.startsWith("B|DE"))).toHaveLength(1);
    expect(x.totals).toMatchObject({ receipts: 2, donors: 1, donations: 2 });
  });
});

describe("dates, names and phones", () => {
  it("writes the create date in Johannesburg time, 24-hour clock", () => {
    expect(messageCreateDate(new Date("2026-12-31T22:15:05Z"))).toBe("2027-01-01T00:15:05");
  });
  it("offers two periods", () => {
    expect(it3dPeriodRange(2027, "first_half")).toEqual({ start: "2026-03-01", end: "2026-08-31" });
    expect(it3dPeriodRange(2028, "full_year")).toEqual({ start: "2027-03-01", end: "2028-02-29" });
  });
  it("takes initials from each given name", () => {
    expect(initialsAndNames("  mary   anne ")).toEqual({ initials: "MA", names: "mary anne" });
    expect(initialsAndNames("Émile")).toEqual({ initials: "É", names: "Émile" });
  });
  it("normalises phone numbers to digits starting 0, or 00 abroad", () => {
    expect(sarsPhone("+27 82 123 4567")).toEqual({ digits: "0821234567", cell: true });
    expect(sarsPhone("011 123 4567")).toEqual({ digits: "0111234567", cell: false });
    expect(sarsPhone("+44 20 7946 0958")).toEqual({ digits: "00442079460958", cell: true });
    expect(sarsPhone("12345")).toBe(null);
    expect(sarsPhone(null)).toBe(null);
  });
});

describe("fallbacks SARS asks for", () => {
  it("uses 999999999999999 with no usable cell phone and NO@EMAIL.COM with no email", () => {
    const r = buildIt3d(input({ receipts: [receipt({ donor: person({ phone: null, email: null }) })] }));
    const de = fieldsOf(r.lines[3]);
    expect(de[29]).toBe("");
    expect(de[30]).toBe(NO_PHONE);
    expect(de[31]).toBe(NO_EMAIL);
    expect(r.fileReady).toBe(true);
  });
  it("puts a landline in the telephone field and the cell fallback in the cell field", () => {
    const r = buildIt3d(input({ receipts: [receipt({ donor: person({ phone: "0111234567" }) })] }));
    const de = fieldsOf(r.lines[3]);
    expect([de[29], de[30]]).toEqual(["0111234567", NO_PHONE]);
  });
  it("sends a missing donor postal code as 0000, with a note", () => {
    const r = buildIt3d(input({ receipts: [receipt({ donor: person({ address: { line1: "1 Road", line2: null, suburb: null, city: "Durban", postalCode: null } }) })] }));
    expect(fieldsOf(r.lines[3])[28]).toBe("0000");
    expect(warnings(r)[0]).toMatch(/0000/);
    expect(r.fileReady).toBe(true);
  });
});

describe("which donations go in", () => {
  it("only gifts paid inside the period, by their Johannesburg date", () => {
    const r1 = receipt({ donations: [gift("2026-02-28T21:59:00Z", 100), gift("2026-02-28T22:00:00Z", 200), gift("2026-08-31T21:59:00Z", 300), gift("2026-08-31T22:00:00Z", 400)] });
    const half = buildIt3d(input({ period: "first_half", receipts: [r1] }));
    expect(half.lines.filter((l) => l.startsWith("B|DR")).map((l) => fieldsOf(l)[8])).toEqual(["2026-03-01", "2026-08-31"]);
    expect(half.totals.totalCents).toBe(500);
    expect(fieldsOf(half.lines[1]).slice(3, 5)).toEqual(["2026-03-01", "2026-08-31"]);
    const full = buildIt3d(input({ receipts: [r1] }));
    expect(full.totals.totalCents).toBe(900);
  });
  it("leaves out a receipt with no gift in the period, quietly for the first six months", () => {
    const r = buildIt3d(input({ period: "first_half", receipts: [receipt(), receipt({ donations: [gift("2026-12-01T08:00:00Z", 999)] })] }));
    expect(r.totals).toMatchObject({ receipts: 1, donors: 1, donations: 1 });
    expect(r.problems).toEqual([]);
  });
  it("says so (a note, not a block) when a receipt has no gift in the full tax year", () => {
    const odd = receipt({ receiptNumber: "MF-2027-0099", donations: [gift("2027-03-01T08:00:00Z", 999)] });
    const r = buildIt3d(input({ receipts: [receipt(), odd] }));
    expect(r.totals).toMatchObject({ receipts: 1, donations: 1 });
    expect(r.problems).toEqual([{ severity: "warning", message: "Receipt MF-2027-0099 has no donations in this tax year. Check its tax year.", fix: null, receiptNumber: "MF-2027-0099" }]);
    expect(r.fileReady).toBe(true);
  });
  it("puts the tax year in the donor's unique number, so next year's file never repeats this year's", () => {
    const a = receipt({ donorKey: "same" });
    const y27 = fieldsOf(buildIt3d(input({ receipts: [a] })).lines[3])[3];
    const y28 = fieldsOf(buildIt3d(input({ taxYear: 2028, receipts: [receipt({ donorKey: "same", donations: [gift("2027-05-10T08:00:00Z", 100)] })] })).lines[3])[3];
    expect(y27).toBe(`DE-${CHARITY_ID}-2027-same`);
    expect(y28).toBe(`DE-${CHARITY_ID}-2028-same`);
  });
  it("builds no file when there are no donations (field 604 must be at least 0.01)", () => {
    const r = buildIt3d(input({ receipts: [] }));
    expect(r.nil).toBe(true);
    expect(r.lines).toEqual([]);
    expect(r.fileReady).toBe(false);
  });
});

describe("company and trust donors", () => {
  it("reports a company by its CIPC number as an unlisted company, with a note", () => {
    const r = buildIt3d(input({ receipts: [receipt({ donor: person({ type: "company", firstName: null, lastName: null, idNumber: null, organisationName: "Acme (Pty) Ltd", registrationNumber: "2015 123456 07" }) })] }));
    const de = fieldsOf(r.lines[3]);
    expect([de[6], de[7], de[8], de[10], de[11], de[14], de[16]]).toEqual(["Acme (Pty) Ltd", "", "", "004", "2015/123456/07", "", "PRIVATE_CO"]);
    expect(warnings(r)).toContain("Companies are reported as unlisted companies. If a donor is a listed company or close corporation, change it in the sheet before you submit.");
    expect(r.fileReady).toBe(true);
  });
  it("reports a trust by its trust number", () => {
    const r = buildIt3d(input({ receipts: [receipt({ donor: person({ type: "trust", firstName: null, lastName: null, idNumber: null, organisationName: "Levin Family Trust", registrationNumber: "IT1234/2015" }) })] }));
    const de = fieldsOf(r.lines[3]);
    expect([de[10], de[11], de[16]]).toEqual(["007", "IT1234/2015", "INTERVIVOS_TRUST"]);
  });
  it("blocks a company number not in SARS's format, and a trust with no number", () => {
    const co = buildIt3d(input({ receipts: [receipt({ donor: person({ type: "company", organisationName: "Acme", registrationNumber: "K2015/1234" }) })] }));
    expect(blocking(co)[0]).toMatch(/registration number isn't in SARS's format/);
    const trust = buildIt3d(input({ receipts: [receipt({ donor: person({ type: "trust", organisationName: "T", registrationNumber: null }) })] }));
    expect(blocking(trust)[0]).toMatch(/trust gave no registration number/);
    expect(trust.fileReady).toBe(false);
  });
});

describe("problems", () => {
  const only = (over: Partial<It3dDonor>) => buildIt3d(input({ receipts: [receipt({ donor: person(over) })] }));

  it("lists every missing charity detail, with where to fix it", () => {
    const r = buildIt3d(input({ charity: charity({ taxReference: null, legalForm: null, pboNumber: null, address: { line1: null, line2: null, suburb: null, city: null, postalCode: null }, contactName: "Sarah", contactPhone: null, contactEmail: null }) }));
    expect(r.problems.map((p) => [p.fix, p.message])).toEqual([
      ["sars_details", "Add your charity's income tax reference number."],
      ["sars_details", "Choose your charity's legal form, as SARS has you registered."],
      ["support", "Your charity's PBO (exemption) number is missing. Ask Givezy to add it."],
      ["support", "Your charity's postal address or postal code is missing. Ask Givezy to add it."],
      ["contact", "Add your contact person's first name and surname. SARS asks for both."],
      ["contact", "Add your contact person's phone number (a South African number, for example 011 123 4567)."],
      ["contact", "Add your contact person's email address."],
    ]);
    expect(r.fileReady).toBe(false);
  });

  it("checks the charity's tax reference and registration number", () => {
    expect(blocking(buildIt3d(input({ charity: charity({ taxReference: "0001339051" }) })))[0]).toMatch(/doesn't pass SARS's check/);
    expect(blocking(buildIt3d(input({ charity: charity({ registrationNumber: null }) })))[0]).toMatch(/CIPC company registration number/);
    expect(blocking(buildIt3d(input({ charity: charity({ registrationNumber: "2010/123456/99" }) })))[0]).toMatch(/isn't in SARS's format/);
    const trust = buildIt3d(input({ charity: charity({ legalForm: "INTERVIVOS_TRUST", registrationNumber: "IT9/2001" }) }));
    expect(trust.problems).toEqual([]);
    expect(fieldsOf(trust.lines[1]).slice(10, 12)).toEqual(["007", "IT9/2001"]);
    expect(fieldsOf(trust.lines[2])[8]).toBe("IT9/2001");
    expect(blocking(buildIt3d(input({ charity: charity({ legalForm: "INTERVIVOS_TRUST", registrationNumber: null }) })))[0]).toMatch(/trust registration number/);
  });

  it("blocks a registration number longer than the 15 SARS allows for the reporting entity, never dropping it quietly", () => {
    const trust = buildIt3d(input({ charity: charity({ legalForm: "INTERVIVOS_TRUST", registrationNumber: "IT123456789/2015" }) }));
    expect(blocking(trust)).toEqual([expect.stringMatching(/trust number is 16 characters long/)]);
    const other = buildIt3d(input({ charity: charity({ legalForm: "ASSOC_NOT_FOR_GAIN", registrationNumber: "A".repeat(16) }) }));
    expect(blocking(other)).toContain("Registration number is longer than SARS allows (15 characters). Check it.");
    expect(other.problems.find((p) => p.message.startsWith("Registration number"))?.fix).toBe("sars_details");
  });

  it("gives the file id, Source Identifier and version no fix link, but the contact fields keep theirs", () => {
    const r = buildIt3d(input({ sourceIdentifier: "S".repeat(145), charity: charity({ contactName: "Sarah Jane|Levin" }) }));
    expect(r.problems.find((p) => p.message.startsWith("The Source Identifier"))?.fix).toBe(null);
    expect(r.problems.find((p) => p.message.startsWith("Your contact person's surname"))?.fix).toBe("contact");
  });

  it("uses the Johannesburg year, not the UTC one, for the ID's century and the company number's year", () => {
    const newYear = new Date("2027-12-31T22:30:00Z"); // 00:30 on 01/01/2028 in Johannesburg
    const r = buildIt3d(input({ now: newYear, receipts: [receipt({ donor: person({ type: "company", organisationName: "New Co", registrationNumber: "2028/000001/07" }) })] }));
    expect(blocking(r)).toEqual([]);
    const born = buildIt3d(input({ now: newYear, receipts: [receipt({ donor: person({ idNumber: "2801015009086" }) })] }));
    expect(fieldsOf(born.lines[3])[14]).toBe("2028-01-01");
  });

  it("can't identify an association or other entity as submitting entity: blocks the file, says ask the accountant", () => {
    const r = buildIt3d(input({ charity: charity({ legalForm: "ASSOC_NOT_FOR_GAIN", registrationNumber: null }) }));
    expect(blocking(r)).toEqual(["SARS needs an identification number for the submitting entity. Ask your accountant which number to use."]);
    expect(r.fileReady).toBe(false);
    expect(r.sheet.rows).toHaveLength(1); // the capture sheet is still made
  });

  it("blocks a receipt whose donor gave only an income tax number", () => {
    const r = only({ idNumber: null, taxReference: "0001339050" });
    expect(blocking(r)[0]).toMatch(/gave only an income tax number/);
    expect(r.problems[0]).toMatchObject({ receiptNumber: expect.stringMatching(/^MF-/), donorName: "Thabo Peter Mokoena" });
    expect(r.sheet.rows[0].blocking).toBe(true);
    expect(r.sheet.rows[0].problems[0]).toMatch(/only an income tax number/);
  });

  it("blocks an SA ID failing SARS's check, and shows only its last 4 digits", () => {
    const r = only({ idNumber: "8001015009088" });
    expect(blocking(r)[0]).toMatch(/doesn't pass SARS's check/);
    expect(r.problems[0].idLast4).toBe("9088");
    expect(JSON.stringify(r.problems)).not.toContain("8001015009088");
  });

  it("leaves out a donor tax number that fails Modulus 10, as a note, not a block", () => {
    const r = only({ taxReference: "0001339051" });
    expect(fieldsOf(r.lines[3])[13]).toBe("");
    expect(warnings(r)[0]).toMatch(/left out/);
    expect(r.fileReady).toBe(true);
    expect(fieldsOf(only({ taxReference: "0001339050" }).lines[3])[13]).toBe("0001339050");
  });

  it("blocks a missing address", () => {
    expect(blocking(only({ address: { line1: null, line2: null, suburb: null, city: null, postalCode: null } }))[0]).toMatch(/address is missing/);
  });

  it("leaves out only the receipt of a donor erased before the SARS details were kept, as a warning", () => {
    const gone = receipt({ donor: person({ erased: true, firstName: null, lastName: null, idNumber: null, phone: null, email: null, address: { line1: null, line2: null, suburb: null, city: null, postalCode: null } }) });
    const kept = receipt({ donations: [gift("2026-06-01T08:00:00Z", 25_000)] });
    const r = buildIt3d(input({ receipts: [gone, kept] }));
    expect(blocking(r)).toEqual([]);
    expect(r.problems).toEqual([expect.objectContaining({ severity: "warning", message: ERASED_LEFT_OUT, receiptNumber: gone.receiptNumber })]);
    expect(r.fileReady).toBe(true);
    expect(r.totals).toMatchObject({ receipts: 1, donors: 1, donations: 1, totalCents: 25_000 });
    expect(r.lines.join("\n")).not.toContain(gone.receiptNumber!);
    expect(r.lines.join("\n")).toContain(kept.receiptNumber!);
    // A company or trust erased the same way is left out too.
    expect(erasedWithoutSarsDetails(person({ type: "company", erased: true, organisationName: null, registrationNumber: null }))).toBe(true);
  });

  it("never calls a period with only left-out receipts a null declaration", () => {
    const gone = receipt({ donor: person({ erased: true, firstName: null, lastName: null, idNumber: null, phone: null, email: null, address: { line1: null, line2: null, suburb: null, city: null, postalCode: null } }) });
    const r = buildIt3d(input({ receipts: [gone] }));
    expect(r.nil).toBe(false);
    expect(r.fileReady).toBe(false);
    expect(r.lines).toEqual([]);
  });

  it("reports an erased donor whose SARS details were kept, without their contact details", () => {
    const r = only({ erased: true, phone: null, email: "erased+x@erased.invalid" });
    expect(r.problems).toEqual([]);
    expect(r.fileReady).toBe(true);
    const de = fieldsOf(r.lines[3]);
    expect(de[6]).toBe("Mokoena");
    expect(de[11]).toBe("8001015009087");
    expect(de[24]).toBe("12 Main Road");
    expect(de[30]).toBe(NO_PHONE);
    expect(de[31]).toBe(NO_EMAIL);
  });

  it("blocks a pipe, a leading space, a character outside Latin-1 or a value too long, never changing it", () => {
    expect(blocking(only({ lastName: "Smith|Jones" }))[0]).toBe("The donor's surname has a \"|\" in it, which SARS's file can't hold. Change it to another character.");
    expect(blocking(only({ address: { ...person().address, line2: " Flat 4" } }))[0]).toBe("The donor's address line 2 starts with a space. Remove the space.");
    expect(blocking(only({ lastName: "Nguyễn" }))[0]).toMatch(/character SARS's file can't hold \("ễ"\)/);
    expect(blocking(only({ lastName: "x".repeat(121) }))[0]).toBe("The donor's surname is 121 characters long. SARS takes at most 120. Shorten it.");
    const long = only({ address: { ...person().address, line1: "y".repeat(101) } });
    expect(long.fileReady).toBe(false);
    expect(long.lines[3]).toContain("y".repeat(101)); // never truncated
  });

  it("trims trailing spaces", () => {
    const r = only({ lastName: "Mokoena   " });
    expect(fieldsOf(r.lines[3])[6]).toBe("Mokoena");
    expect(r.problems).toEqual([]);
  });

  it("notes a recorded gift of method Other, which might be goods", () => {
    const r = buildIt3d(input({ receipts: [receipt({ donations: [gift("2026-05-10T08:00:00Z", 1_000, "other")] })] }));
    expect(warnings(r)[0]).toMatch(/IN SPECIE/);
    expect(fieldsOf(r.lines.find((l) => l.startsWith("B|DR"))!)[7]).toBe("CASH");
  });

  it("blocks different ID numbers on one receipt, and a receipt with no number", () => {
    expect(blocking(only({ idNumbersDiffer: true }))[0]).toMatch(/different SA ID numbers/);
    expect(blocking(buildIt3d(input({ receipts: [receipt({ receiptNumber: null })] })))[0]).toMatch(/no receipt number/);
  });
});

describe("the capture sheet's values", () => {
  it("has the charity block and one row per donation in the IT3-01 order", () => {
    const r = buildIt3d(input());
    expect(r.sheet.entity.find(([k]) => k === "Income tax reference number")?.[1]).toBe("0001339050");
    expect(r.sheet.entity.find(([k]) => k === "Total of all donations (R)")?.[1]).toBe("500.00");
    expect(r.sheet.header[0]).toBe("Receipt number");
    expect(r.sheet.rows[0].values.slice(0, 12)).toEqual([
      expect.stringMatching(/^MF-/), "Cash", "500.00", "10/05/2026", "Mokoena", "TP", "Thabo Peter", "001 South African ID number", "8001015009087", "", "01/01/1980", "Individual (INDIVIDUAL)",
    ]);
    expect(r.sheet.rows[0].values).toHaveLength(r.sheet.header.length - 1);
  });
});
