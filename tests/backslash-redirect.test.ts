import { describe, expect, it } from "vitest";
import { backslashRedirect } from "@/lib/canonical-host";

const u = (s: string) => new URL(s, "https://test.givezy.co.za");

// A stray backslash crashed the hosting with an error page (17/11/2026); the visitor now lands on the page they meant.
describe("backslashRedirect", () => {
  it("moves an address with a stray backslash to the clean address", () => {
    expect(backslashRedirect(u("/charities%5C"), "GET")).toBe("/charities");
    expect(backslashRedirect(u("/charities%5c?q=food"), "GET")).toBe("/charities?q=food");
    expect(backslashRedirect(u("/demo%5Cdashboard"), "HEAD")).toBe("/demo/dashboard");
    expect(backslashRedirect(u("/%5C"), "GET")).toBe("/");
  });
  it("leaves clean addresses, forms and the API alone", () => {
    expect(backslashRedirect(u("/charities"), "GET")).toBeNull();
    expect(backslashRedirect(u("/charities%5C"), "POST")).toBeNull();
    expect(backslashRedirect(u("/api/app%5Cready"), "GET")).toBeNull();
  });
});
