/**
 * What the owner sees after "Check the file" on the donor import, for the optional phone number and address
 * (CRM build plan step 8): how many rows carry them, a plain warning that an ID or tax number column isn't kept,
 * and that only the checked details (never an ID number) reach the store.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const stored: unknown[] = [];
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "admin@x.co" }) }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: "c1", name_en: "Meals Fund", status: "approved" }, priv: null }) }));
vi.mock("@/lib/charity/team", () => ({ isOwner: async () => true }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async (...a: unknown[]) => (stored.push({ action: a }), "a1") }));
vi.mock("@/lib/charity/donor-care", () => ({ listTags: async () => [] }));
vi.mock("@/lib/charity/contacts-store", () => ({
  contactEmails: async () => new Set<string>(),
  importContactsFile: async (a: { contacts: unknown[] }) => (stored.push({ contacts: a.contacts }), { ok: true, importId: "i1", contacts: a.contacts.length }),
  removeContactImport: async () => 0,
}));

const { checkContactImport, importContacts } = await import("@/app/charity-admin/[id]/donors/contact-actions");
const { fileFingerprint } = await import("@/lib/charity/recorded-gifts-store");

const form = (text: string) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ text, fingerprint: fileFingerprint(text), file_name: "donors.csv", confirm: "on" })) f.set(k, v);
  return f;
};

beforeEach(() => {
  stored.length = 0;
});

describe("checking a donor file with phone numbers and addresses", () => {
  it("says how many rows have a phone number and an address", async () => {
    const p = await checkContactImport("c1", { state: "idle" }, form("First name,Phone,Address,City\nAnna,082 123 4567,5 Example Road,Durban\nBen,,,\n"));
    expect(p).toMatchObject({ state: "checked", good: 2, bad: 0, withPhone: 1, withAddress: 1, canImport: true, warnings: [] });
  });

  it("lists a malformed phone number and postal code by row, and nothing can be imported", async () => {
    const p = await checkContactImport("c1", { state: "idle" }, form("First name,Phone,Postal code\nAnna,821234567,157\nBen,0821234567,2192\n"));
    expect(p).toMatchObject({ state: "checked", good: 1, bad: 1, canImport: false });
    if (p.state !== "checked") return;
    expect(p.problems).toHaveLength(1);
    expect(p.problems[0].line).toBe(2);
    expect(p.problems[0].messages.join(" ")).toContain("0821234567");
    expect(p.problems[0].messages.join(" ")).toContain("0157");
    await expect(importContacts("c1", { ok: false }, form("First name,Phone,Postal code\nAnna,821234567,157\nBen,0821234567,2192\n"))).resolves.toMatchObject({ ok: false, message: expect.stringContaining("nothing was imported") });
    expect(stored).toEqual([]);
  });

  it("an ID or tax number column is warned about, and its numbers never reach the store or the action record", async () => {
    const text = "First name,Surname,ID number,Tax number,Phone,City\nAnna,Example,8001015009087,0001339050,0821234567,Durban\n";
    const p = await checkContactImport("c1", { state: "idle" }, form(text));
    expect(p.state).toBe("checked");
    if (p.state !== "checked") return;
    expect(p.canImport).toBe(true);
    expect(p.warnings).toEqual([
      "The ID and tax number columns aren't imported or kept. Givezy only needs an ID or tax number for an s18A receipt, and the donor gives it with their gift. You can leave those columns out of the file.",
    ]);
    expect(JSON.stringify(p)).not.toMatch(/8001015009087|0001339050/);
    await expect(importContacts("c1", { ok: false }, form(text))).rejects.toThrow(/redirect:.*donors\?done=a1/);
    expect(JSON.stringify(stored)).not.toMatch(/8001015009087|0001339050/);
    expect(stored[0]).toEqual({ contacts: [expect.objectContaining({ firstName: "Anna", lastName: "Example", phone: "0821234567", city: "Durban" })] });
    // Undo removes the whole import, so the phone number and address go with it.
    expect(stored[1]).toEqual({ action: ["c1", "u1", "contacts_imported", { contacts: 1, file: "donors.csv" }, { type: "remove_contacts", importId: "i1" }] });
  });

  it("one such column is named", async () => {
    const p = await checkContactImport("c1", { state: "idle" }, form("First name,ID Number\nAnna,8001015009087\n"));
    expect(p.state === "checked" && p.warnings[0]).toMatch(/^The column "ID Number" isn't imported or kept\./);
  });
});
