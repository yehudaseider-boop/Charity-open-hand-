import { useEffect, useState } from "react";
import type { LoadResult } from "./stored-result";

/**
 * Loads one personal record from this phone for the person using it.
 *
 * - `loading`  not read yet, or the person just changed (never shows the previous person's record)
 * - `ready`    read; `value` is the record (edits made with `setValue` replace it)
 * - `problem`  could not be read or is invalid; `value` stays `initial`, so callers must not save over it
 *
 * When `enabled` is false (design preview) there is nothing to read: the record is `initial` and `ready`.
 */
export function useStoredRecord<T>({
  enabled,
  owner,
  load,
  initial,
}: {
  enabled: boolean;
  owner: string | null;
  load: (owner: string | null) => Promise<LoadResult<T>>;
  initial: T;
}) {
  const [attempt, setAttempt] = useState(0);
  const key = enabled ? `${attempt}|${owner === null ? "device" : `user:${owner}`}` : "preview";
  const [loaded, setLoaded] = useState<{ key: string; result: LoadResult<T> } | null>(null);
  const [edit, setEdit] = useState<{ key: string; value: T } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let live = true;
    load(owner).then((result) => {
      if (live) setLoaded({ key, result });
    });
    return () => {
      live = false;
    };
  }, [enabled, owner, key, load]);

  const result = loaded?.key === key ? loaded.result : null;
  const status = !enabled ? "ready" : result === null ? "loading" : result.ok ? "ready" : "problem";
  const base = result?.ok ? result.value : initial;
  return {
    status: status as "loading" | "ready" | "problem",
    reason: result && !result.ok ? result.reason : null,
    value: edit?.key === key ? edit.value : base,
    setValue: (value: T) => setEdit({ key, value }),
    retry: () => setAttempt((n) => n + 1),
  };
}
