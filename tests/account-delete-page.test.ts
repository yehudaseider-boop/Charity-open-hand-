import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { alreadyAskedSentence, openDeleteRequest } = await import("@/app/account/data/delete/open-request");

describe("delete my account: open request check", () => {
  it("finds an open delete request and ignores other kinds and closed ones", () => {
    expect(openDeleteRequest([])).toBeNull();
    expect(openDeleteRequest(null)).toBeNull();
    expect(
      openDeleteRequest([
        { kind: "correct", status: "open", created_at: "2026-11-01T10:00:00Z" },
        { kind: "delete", status: "done", created_at: "2026-11-02T10:00:00Z" },
        { kind: "delete", status: "declined", created_at: "2026-11-03T10:00:00Z" },
      ]),
    ).toBeNull();
    const row = { kind: "delete", status: "open", created_at: "2026-11-04T10:00:00Z" };
    expect(openDeleteRequest([{ kind: "object", status: "open", created_at: "2026-11-01T10:00:00Z" }, row])).toBe(row);
  });

  it("says when they asked, in dd/mm/yyyy Johannesburg time, and where we reply", () => {
    expect(alreadyAskedSentence("2026-10-06T14:00:00Z")).toBe(
      "You've already asked us to delete your account on 06/10/2026. Our reply will show on your Your information page, and we'll email you once your information is erased.",
    );
    // 23:30 UTC is already the next day in Johannesburg.
    expect(alreadyAskedSentence("2026-10-06T23:30:00Z")).toContain("07/10/2026");
  });
});

describe("delete my account: where it is offered", () => {
  it("the app's account screen opens the in-app deletion screen, not the browser (25/11/2026)", () => {
    const src = readFileSync("apps/mobile/src/app/(tabs)/account.tsx", "utf8");
    expect(src).toMatch(/label: "Delete my account", onPress: \(\) => router\.push\("\/delete-account"\)/);
    expect(src).not.toMatch(/open\("\/account\/data\/delete"\)/);
  });

  it("the app's agreement screen offers it too", () => {
    const src = readFileSync("apps/mobile/src/components/sign-in.tsx", "utf8");
    expect(src).toMatch(/<TextLink label="Delete my account" onPress=\{\(\) => open\("\/account\/data\/delete"\)\} \/>/);
  });

  it("the page asks first and files the existing delete request", () => {
    const form = readFileSync("src/app/account/data/delete/delete-form.tsx", "utf8");
    expect(form).toContain("sendDataRequest");
    expect(form).toContain('name="kind" value="delete"');
    expect(form).toContain("This can't be undone once we've processed it.");
    expect(form).toContain('confirmLabel="Yes, delete my account"');
    const page = readFileSync("src/app/account/data/delete/page.tsx", "utf8");
    expect(page).toContain('requireViewer("/account/data/delete")');
    expect(page).toContain("index: false");
    expect(readFileSync("src/app/account/data/page.tsx", "utf8")).toContain('href="/account/data/delete"');
  });
});
