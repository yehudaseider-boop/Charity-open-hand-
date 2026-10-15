/**
 * Dedications: a donor may give "in honour of" or "in memory of" someone. Only the kind and the
 * person's name are stored; an optional note to the charity is the donation's existing message.
 * The donor and the charity see it; it is never printed on an s18A receipt, and it is wiped when
 * the donor asks for their information to be erased (approved by Yehuda, 15/10/2026).
 * Dependency-free so the phone app can share it.
 */
export type DedicationKind = "honour" | "memory";
export type Dedication = { kind: DedicationKind; name: string };

export const DEDICATION_NAME_MAX = 80;

/** Trims, joins runs of spaces and drops control characters, so the name prints cleanly. */
export function cleanDedicationName(raw: string | null | undefined): string {
  return (raw ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * From the form: no kind (or "none") means no dedication. A kind needs a name of 1 to 80 characters.
 * Returns the dedication, null for none, or an error to show beside the name field.
 */
export function parseDedication(kind: string | null | undefined, name: string | null | undefined): Dedication | null | { error: string } {
  if (!kind || kind === "none") return null;
  if (kind !== "honour" && kind !== "memory") return { error: "Choose in honour of or in memory of" };
  const clean = cleanDedicationName(name);
  if (!clean) return { error: "Enter the name of the person" };
  if (clean.length > DEDICATION_NAME_MAX) return { error: `Keep the name to ${DEDICATION_NAME_MAX} characters` };
  return { kind, name: clean };
}

/** Both stored columns, or neither, as a dedication to show. */
export function dedicationFrom(kind: string | null | undefined, name: string | null | undefined): Dedication | null {
  const clean = cleanDedicationName(name);
  return (kind === "honour" || kind === "memory") && clean ? { kind, name: clean } : null;
}

/** "In honour of Rivka Levin" / "In memory of Chaim Cohen". */
export function dedicationLine(d: Dedication): string {
  return `${d.kind === "honour" ? "In honour of" : "In memory of"} ${d.name}`;
}
