import { ringPercent } from "@/lib/challenges/rules";
import { formatRand } from "@/lib/money";

/**
 * How full a group challenge is: one ring with the amount raised and the goal inside. Nothing about
 * who gave. The ring stops at full; the words say when the goal is passed.
 */
export function ChallengeRing({ raisedCents, targetCents, size = 200 }: { raisedCents: number; targetCents: number; size?: number }) {
  const pct = ringPercent(raisedCents, targetCents);
  const r = 86;
  const c = 2 * Math.PI * r;
  const shown = Math.min(100, pct);
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${formatRand(raisedCents)} of ${formatRand(targetCents)}, ${pct}% of the goal`}>
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90" aria-hidden>
        <circle cx="100" cy="100" r={r} fill="none" strokeWidth="18" className="stroke-brand-soft" />
        {shown > 0 ? (
          <circle cx="100" cy="100" r={r} fill="none" strokeWidth="18" strokeLinecap="round" className="stroke-coral"
            strokeDasharray={c} strokeDashoffset={c * (1 - shown / 100)} />
        ) : null}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center" aria-hidden>
        <span className="font-display text-[2.1rem] leading-none text-navy">{formatRand(raisedCents)}</span>
        <span className="mt-1 text-sm text-muted">of {formatRand(targetCents)}</span>
        <span className="mt-1.5 text-sm font-bold text-brand">{pct >= 100 ? "Goal reached" : `${pct}% there`}</span>
      </div>
    </div>
  );
}

/** The thin bar for lists. */
export function ChallengeBar({ raisedCents, targetCents }: { raisedCents: number; targetCents: number }) {
  const pct = Math.min(100, ringPercent(raisedCents, targetCents));
  return (
    <div className="h-2.5 rounded-full bg-brand-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${pct}% of the goal`}>
      <div className="h-2.5 rounded-full bg-coral" style={{ width: `${Math.max(2, pct)}%` }} />
    </div>
  );
}
