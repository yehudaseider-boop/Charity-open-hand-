/**
 * The gates on importing a charity's own donor list: owner of an approved charity only, exactly the file that was
 * checked, and the confirmation ticked. Nothing reaches the store otherwise.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let owner = true;
let status = "approved";
const stored: string[] = [];
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`redirect:${to}`); } }));
vi.mock("@/lib/auth", () => ({ requireViewer: async () => ({ userId: "u1", email: "admin@x.co" }) }));
vi.mock("@/lib/charity/queries", () => ({ loadCharityForManager: async () => ({ charity: { id: "c1", name_en: "Meals Fund", status }, priv: null }) }));
vi.mock("@/lib/charity/team", () => ({ isOwner: async () => owner }));
vi.mock("@/lib/charity/charity-actions", () => ({ recordAction: async () => "a1" }));
vi.mock("@/lib/charity/donor-care", () => ({ listTags: async () => [] }));
vi.mock("@/lib/charity/contacts-store", () => ({
  contactEmails: async () => new Set<string>(),
  importContactsFile: async (a: { contacts: unknown[]; fileName: string }) => (stored.push(`import:${a.contacts.length}:${a.fileName}`), { ok: true, importId: "i1", contacts: a.contacts.length }),
  removeContactImport: async (_c: string, importId: string) => (stored.push(`remove:${importId}`), 3),
}));

const { checkContactImport, importContacts, removeContacts } = await import("@/app/charity-admin/[id]/donors/contact-actions");
const { fileFingerprint } = await import("@/lib/charity/recorded-gifts-store");
const { CONTACT_TEMPLATE_HEADINGS } = await import("@/lib/charity/contacts");

const text = `${CONTACT_TEMPLATE_HEADINGS.join(",")}\nSarah,Example,,sarah@example.co.za,0821234567,,,,,,,\n`;
const IMPORT_ID = "0f9a2c71-0b1d-4e5f-9a8b-123456789abc";
const form = (over: Record<string, string> = {}) => {
  const f = new FormData();
  for (const [k, v] of Object.entries({ text, fingerprint: fileFingerprint(text), file_name: "donors.csv", confirm: "on", ...over })) f.set(k, v);
  return f;
};

beforeEach(() => {
  owner = true;
  status = "approved";
  stored.length = 0;
});

describe("importing a charity's own donor list", () => {
  it("an admin who isn't the owner is refused at every step, and nothing reaches the store", async () => {
    owner = false;
    expect(await checkContactImport("c1", { state: "idle" }, form())).toEqual({ state: "refused", message: "Only your charity's owner can import donors. Nothing was imported." });
    expect(await importContacts("c1", { ok: false }, form())).toEqual({ ok: false, message: "Only your charity's owner can import donors. Nothing was imported." });
    expect(await removeContacts("c1", IMPORT_ID, { ok: false }, new FormData())).toEqual({ ok: false, message: "Only your charity's owner can remove imported donors. Nothing was removed." });
    expect(stored).toEqual([]);
  });

  it("a charity that isn't approved yet is refused", async () => {
    status = "pending_review";
    expect(await checkContactImport("c1", { state: "idle" }, form())).toMatchObject({ state: "refused", message: /once Givezy has approved/ });
    expect(await importContacts("c1", { ok: false }, form())).toMatchObject({ ok: false, message: /once Givezy has approved/ });
    expect(stored).toEqual([]);
  });

  it("a file that changed since it was checked is refused", async () => {
    expect(await importContacts("c1", { ok: false }, form({ fingerprint: "0".repeat(32) }))).toEqual({ ok: false, message: "The file changed since it was checked. Nothing was imported. Check it again first." });
    expect(stored).toEqual([]);
  });

  it("the confirmation not ticked gives the field error", async () => {
    const f = form();
    f.delete("confirm");
    expect(await importContacts("c1", { ok: false }, f)).toEqual({ ok: false, fieldErrors: { confirm: "Please confirm, so we know these people gave you their details" } });
    expect(stored).toEqual([]);
  });

  it("the owner of an approved charity, with the checked file and the box ticked, imports", async () => {
    expect(await checkContactImport("c1", { state: "idle" }, form())).toMatchObject({ state: "checked", good: 1, bad: 0, canImport: true });
    await expect(importContacts("c1", { ok: false }, form())).rejects.toThrow(/redirect:.*done=a1/);
    await expect(removeContacts("c1", IMPORT_ID, { ok: false }, new FormData())).rejects.toThrow(/redirect:.*done=a1/);
    expect(stored).toEqual(["import:1:donors.csv", `remove:${IMPORT_ID}`]);
  });
});
