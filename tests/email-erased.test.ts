import { describe, expect, it, vi } from "vitest";
import { getEmailTransport, isErasedAddress } from "@/lib/email";

describe("addresses left behind by an erasure", () => {
  it("are recognised", () => {
    expect(isErasedAddress("erased+1234@erased.invalid")).toBe(true);
    expect(isErasedAddress("Erased+1@ERASED.invalid ")).toBe(true);
    expect(isErasedAddress("sarah@example.co.za")).toBe(false);
  });

  it("are never sent to, and real addresses still are", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const t = getEmailTransport({ EMAIL_TRANSPORT: "console" });
    await t.send({ to: "erased+1@erased.invalid", subject: "x", text: "y" });
    expect(log).not.toHaveBeenCalled();
    await t.send({ to: "sarah@example.co.za", subject: "x", text: "y" });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});
