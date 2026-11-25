import { describe, expect, it } from "vitest";
import { givePrecheck } from "@/lib/donations/donor-details";
import { saIdProblem } from "@/lib/sa-id";

const ok = { donor_type: "individual", first_name: "Thandi", last_name: "Mokoena", email: "thandi@example.co.za", agreement: "on" };
const opts = { receiptsAvailable: true, singleTick: true };

describe("give form check before sending (25/11/2026)", () => {
  it("lets a complete form through", () => {
    expect(givePrecheck(ok, opts)).toEqual({});
  });

  it("names every empty field at once, in the server's words", () => {
    const e = givePrecheck({ donor_type: "individual" }, opts);
    expect(e).toMatchObject({
      first_name: "Enter your first name",
      last_name: "Enter your surname",
      email: "Enter a valid email address",
    });
    expect(e.agreement).toBeTruthy();
  });

  it("treats spaces as empty and refuses an email without an @ or a dot", () => {
    expect(givePrecheck({ ...ok, first_name: "   " }, opts).first_name).toBe("Enter your first name");
    expect(givePrecheck({ ...ok, email: "thandi.example.co.za" }, opts).email).toBe("Enter a valid email address");
    expect(givePrecheck({ ...ok, email: "thandi@example" }, opts).email).toBe("Enter a valid email address");
  });

  it("checks the SA ID number and address when the s18A details are added now", () => {
    const e = givePrecheck({ ...ok, wants_18a: "on", s18a_when: "now", id_number: "8013015009087" }, opts);
    expect(e.id_number).toBe(saIdProblem("8013015009087"));
    expect(e.address_line1).toBeTruthy();
    expect(e.city).toBeTruthy();
  });

  it("leaves the s18A details to the server with a saved ID, and when they come after paying", () => {
    expect(givePrecheck({ ...ok, wants_18a: "on", s18a_when: "now", use_saved_id: "on" }, opts)).toEqual({});
    expect(givePrecheck({ ...ok, wants_18a: "on", s18a_when: "later" }, opts)).toEqual({});
  });

  it("asks for both ticks when there are two", () => {
    const { agreement: _a, ...twoTicks } = ok;
    void _a;
    const e = givePrecheck(twoTicks, { receiptsAvailable: false, singleTick: false });
    expect(Object.keys(e).sort()).toEqual(["age_confirmed", "popia_consent"]);
  });
});
