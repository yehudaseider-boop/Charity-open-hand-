import { describe, expect, it } from "vitest";
import { resolveNext } from "@/lib/current-path";

describe("where to come back to after sign-in or the second step", () => {
  it("keeps the deeper page and its filters when the request is inside the area given", () => {
    expect(resolveNext("/charity-admin/c1", "/charity-admin/c1/donations?status=refunded")).toBe("/charity-admin/c1/donations?status=refunded");
    expect(resolveNext("/admin", "/admin/charities/c1")).toBe("/admin/charities/c1");
    expect(resolveNext("/charity-admin", "/charity-admin/c1/application?step=3")).toBe("/charity-admin/c1/application?step=3");
    expect(resolveNext("/account", "/account?denied=charity")).toBe("/account?denied=charity");
  });
  it("keeps what was given when the request is somewhere else", () => {
    expect(resolveNext("/account", "/charity-admin/c1")).toBe("/account");
    expect(resolveNext("/charity-admin/c1", "/charity-admin/c10")).toBe("/charity-admin/c1");
    expect(resolveNext("/admin", null)).toBe("/admin");
  });
  it("never follows an off-site or malformed path", () => {
    expect(resolveNext("/account", "//evil.example")).toBe("/account");
    expect(resolveNext("/account", "https://evil.example/account")).toBe("/account");
    expect(resolveNext("//evil.example", "/account")).toBe("/account");
  });
});
