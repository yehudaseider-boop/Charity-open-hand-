/** Every dashboard form says what is missing in plain words: never the validation library's own text. */
import { describe, expect, it } from "vitest";
import { addressSchema, bankSchema, contactSchema, organisationSchema, profileSchema } from "@/lib/charity/validation";

const messages = (r: { success: boolean; error?: { issues: { message: string }[] } }) => (r.success ? [] : (r.error?.issues ?? []).map((i) => i.message));

describe("empty dashboard forms", () => {
  it("name every missing field plainly", () => {
    for (const [name, schema] of Object.entries({ organisationSchema, addressSchema, contactSchema, bankSchema, profileSchema })) {
      const r = schema.safeParse({});
      expect(r.success, name).toBe(false);
      const all = messages(r);
      expect(all.length, name).toBeGreaterThan(0);
      for (const m of all) expect(m, `${name}: ${m}`).not.toMatch(/Invalid input|expected string|received undefined|Required/);
    }
  });
  it("the address and bank forms ask for the postal code, account number and branch code by name", () => {
    expect(messages(addressSchema.safeParse({}))).toContain("Enter the postal code");
    const bank = messages(bankSchema.safeParse({}));
    expect(bank).toContain("Enter the account number");
    expect(bank).toContain("Enter the branch code");
  });
});
