/** notifyCharity says whether the email went, so a page never says "emailed" when nothing did (review 23/11/2026). */
import { describe, expect, it, vi } from "vitest";

let outcome: "sent" | "skipped" | Error = "sent";
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<object>()),
  getEmailTransport: () => ({
    name: "test",
    send: async () => {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  }),
}));

const { notifyCharity } = await import("@/lib/charity/emails");
const message = { to: "office@meals.test", subject: "Hello", text: "Hello" };

describe("notifyCharity", () => {
  it("is true only when the email went", async () => {
    outcome = "sent";
    expect(await notifyCharity(message)).toBe(true);
    outcome = "skipped";
    expect(await notifyCharity(message)).toBe(false);
    outcome = new Error("down");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await notifyCharity(message)).toBe(false);
    err.mockRestore();
    expect(await notifyCharity(null)).toBe(false);
    expect(await notifyCharity({ ...message, to: "" })).toBe(false);
  });
});
