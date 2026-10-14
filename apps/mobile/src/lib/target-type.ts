/** A donor's maaser (and optional chomesh) target for a month or a giving year. Cents are whole numbers. */
export type TargetPeriod = "month" | "year";
export type Target = { period: TargetPeriod; maaserCents: number; chomeshCents: number | null };
