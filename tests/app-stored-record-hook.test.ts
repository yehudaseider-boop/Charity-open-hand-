// @vitest-environment jsdom
import { createElement, act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useStoredRecord } from "../apps/mobile/src/lib/use-stored-record";
import type { LoadResult } from "../apps/mobile/src/lib/stored-result";
import { recordsChanged } from "../apps/mobile/src/lib/record-changes";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Snapshot = ReturnType<typeof useStoredRecord<string[]>>;
let root: Root;
let latest: Snapshot;
const disk: Record<string, string[]> = { ann: ["ann-1"], ben: ["ben-1"] };
let failReads = false;
const load = async (owner: string | null): Promise<LoadResult<string[]>> =>
  failReads ? { ok: false, reason: "unreadable" } : { ok: true, value: disk[owner ?? ""] ?? [] };

function Probe({ owner, enabled = true }: { owner: string | null; enabled?: boolean }) {
  const record = useStoredRecord<string[]>({ enabled, owner, load, initial: [] });
  useEffect(() => {
    latest = record;
  });
  return null;
}
const show = (owner: string | null, enabled = true) =>
  act(async () => {
    root.render(createElement(Probe, { owner, enabled }));
  });

beforeEach(() => {
  failReads = false;
  root = createRoot(document.createElement("div"));
});
afterEach(() => act(async () => root.unmount()));

describe("useStoredRecord", () => {
  it("loads the person's record", async () => {
    await show("ann");
    expect(latest.status).toBe("ready");
    expect(latest.value).toEqual(["ann-1"]);
  });

  it("a failed read is a problem, never an empty ready record; retry after recovery loads the old entries", async () => {
    failReads = true;
    await show("ann");
    expect(latest.status).toBe("problem");
    expect(latest.reason).toBe("unreadable");
    expect(latest.value).toEqual([]);
    failReads = false;
    await act(async () => latest.retry());
    expect(latest.status).toBe("ready");
    expect(latest.value).toEqual(["ann-1"]);
  });

  it("switching person never shows the previous person's record or edits", async () => {
    await show("ann");
    await act(async () => latest.setValue(["ann-1", "unsaved"]));
    expect(latest.value).toEqual(["ann-1", "unsaved"]);
    await act(async () => {
      root.render(createElement(Probe, { owner: "ben" }));
    });
    expect(latest.status).toBe("ready");
    expect(latest.value).toEqual(["ben-1"]);
    // Ann's own unsaved entry is still hers when she is back; it never appeared for Ben.
    await show("ann");
    expect(latest.value).toEqual(["ann-1", "unsaved"]);
  });

  it("reads again when another screen saves, so it never shows (or saves over) an older record", async () => {
    await show("ann");
    expect(latest.value).toEqual(["ann-1"]);
    disk.ann = ["ann-1", "goal set on another screen"];
    await act(async () => recordsChanged());
    expect(latest.status).toBe("ready");
    expect(latest.value).toEqual(["ann-1", "goal set on another screen"]);
    disk.ann = ["ann-1"];
  });

  it("is loading, not ready, in the render where the person changes", async () => {
    await show("ann");
    const seen: string[] = [];
    function Spy({ owner }: { owner: string | null }) {
      const r = useStoredRecord<string[]>({ enabled: true, owner, load, initial: [] });
      seen.push(`${owner}:${r.status}:${r.value.join(",")}`);
      return null;
    }
    await act(async () => root.render(createElement(Spy, { owner: "ann" })));
    seen.length = 0;
    await act(async () => root.render(createElement(Spy, { owner: "ben" })));
    expect(seen[0]).toBe("ben:loading:");
    expect(seen.some((s) => s.startsWith("ben:ready:ben-1"))).toBe(true);
    expect(seen.some((s) => s.startsWith("ben:ready:ann-1"))).toBe(false);
  });

  it("when disabled (design preview) it is ready with the initial value and reads nothing", async () => {
    failReads = true;
    await show("ann", false);
    expect(latest.status).toBe("ready");
    expect(latest.value).toEqual([]);
  });
});
