import { describe, expect, it } from "vitest";
import { safeAdminPath, safeNextPath } from "@/lib/safe-path";

describe("safeNextPath", () => {
  it("keeps paths on this site", () => {
    expect(safeNextPath("/charity-admin/abc?x=1")).toBe("/charity-admin/abc?x=1");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\\/evil.example", "evil", "", "/a\nb"])(
    "refuses %j",
    (bad) => expect(safeNextPath(bad)).toBe("/account"),
  );
});

describe("safeAdminPath", () => {
  it("allows only the admin areas", () => {
    expect(safeAdminPath("/admin")).toBe("/admin");
    expect(safeAdminPath("/admin/charities/1")).toBe("/admin/charities/1");
    expect(safeAdminPath("/charity-admin/1/donations")).toBe("/charity-admin/1/donations");
    expect(safeAdminPath("/administrator")).toBe("/charity-admin");
    expect(safeAdminPath("/account")).toBe("/charity-admin");
    expect(safeAdminPath("//evil.example/admin")).toBe("/charity-admin");
  });
});
