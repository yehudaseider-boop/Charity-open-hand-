import { describe, expect, it, vi } from "vitest";
import { allowedAddress, getEmailTransport, isErasedAddress } from "@/lib/email";

describe("addresses left behind by an erasure", () => {
  it("are recognised", () => {
    expect(isErasedAddress("erased+1234@erased.invalid")).toBe(true);
    expect(isErasedAddress("Erased+1@ERASED.invalid ")).toBe(true);
    expect(isErasedAddress("sarah@example.co.za")).toBe(false);
  });

  it("are never sent to, and real addresses still are", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const t = getEmailTransport({ EMAIL_TRANSPORT: "console" });
    expect(await t.send({ to: "erased+1@erased.invalid", subject: "x", text: "y" })).toBe("skipped");
    expect(log).not.toHaveBeenCalled();
    // The console transport logs instead of sending, and says so: nothing is marked as emailed on its word.
    expect(await t.send({ to: "sarah@example.co.za", subject: "x", text: "y" })).toBe("skipped");
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});

describe("EMAIL_ALLOWLIST (test sites)", () => {
  it("lets through listed addresses and domains only; unset lets everything through", () => {
    expect(allowedAddress("sarah@example.co.za", undefined)).toBe(true);
    expect(allowedAddress("sarah@example.co.za", "")).toBe(true);
    const list = "givezy.co.za, Yehuda@Example.com";
    expect(allowedAddress("anyone@givezy.co.za", list)).toBe(true);
    expect(allowedAddress("yehuda@example.com", list)).toBe(true);
    expect(allowedAddress("someone.else@example.com", list)).toBe(false);
    expect(allowedAddress("donor@gmail.com", list)).toBe(false);
  });

  it("skips (and logs) an address that is not on the list", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const t = getEmailTransport({ EMAIL_TRANSPORT: "console", EMAIL_ALLOWLIST: "givezy.co.za" });
    expect(await t.send({ to: "donor@gmail.com", subject: "x", text: "y" })).toBe("skipped");
    expect(log.mock.calls[0]?.[0]).toContain("not on EMAIL_ALLOWLIST");
    log.mockRestore();
  });
});
