/**
 * A much older version's giving target: a first amount and an optional second one, for a month or a
 * year. Only read now (goals-store turns it into goals). The field names are the stored record's own,
 * kept so old records still read. Cents are whole numbers.
 */
export type TargetPeriod = "month" | "year";
export type Target = { period: TargetPeriod; maaserCents: number; chomeshCents: number | null };
