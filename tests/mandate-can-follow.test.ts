import { describe, expect, it } from "vitest";
import { applicationChecklist, applicationSteps, isComplete } from "@/lib/charity/checklist";

const charity = { name_en: "Meals", legal_name_en: "Meals NPC", npo_number: "123-456 NPO", pbo_number: "930012345", s18a_reference: "930012345", address_line1: "1 Main Rd", city: "Durban", postal_code: "4001" };
const priv = { contact_name: "Thandi", contact_email: "t@example.co.za", bank_set: true };
const papers = ["bank_confirmation", "pbo_approval", "s18a_approval"];

describe("the receipting mandate can follow after submitting (Yehuda, 25/11/2026)", () => {
  it("an s18A charity with every paper but the mandate can submit, and its Documents step is done", () => {
    const items = applicationChecklist({ charity, priv, documentTypes: papers } as never);
    expect(items.find((i) => i.key === "receipting_mandate")).toMatchObject({ done: false, optional: true });
    expect(isComplete(items)).toBe(true);
    expect(applicationSteps(items).find((s) => s.key === "documents")?.done).toBe(true);
  });

  it("the s18A approval letter is still required", () => {
    const items = applicationChecklist({ charity, priv, documentTypes: ["bank_confirmation", "pbo_approval"] } as never);
    expect(isComplete(items)).toBe(false);
  });
});
