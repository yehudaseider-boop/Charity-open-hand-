import { art, type ArtName } from "@/components/illustration-art";

/**
 * A people illustration in the Givezy palette (decoration only, hidden from screen readers). It floats gently,
 * with hearts or sparkles rising beside it; all motion stops for people who ask for reduced motion.
 */
export function Illustration({
  name,
  className = "",
  float = "bob-slow",
  sparkle = "hearts",
}: {
  name: ArtName;
  className?: string;
  float?: "bob" | "bob-slow" | "none";
  sparkle?: "hearts" | "stars" | "none";
}) {
  return (
    <div aria-hidden className={`pointer-events-none ${/\babsolute\b/.test(className) ? "" : "relative"} ${className}`}>
      <div className={float === "none" ? "" : float} dangerouslySetInnerHTML={{ __html: art[name] }} />
      {sparkle === "hearts" ? (
        <>
          <Heart className="left-[12%] top-[30%] text-coral" delay="0s" />
          <Heart className="left-[22%] top-[44%] text-brand" delay="1.3s" size={14} />
          <Heart className="right-[14%] top-[24%] text-honey" delay="2.4s" />
        </>
      ) : null}
      {sparkle === "stars" ? (
        <>
          <Star className="left-[8%] top-[18%] text-coral" delay="0s" />
          <Star className="right-[10%] top-[10%] text-brand" delay="0.9s" />
          <Star className="right-[22%] top-[40%] text-honey" delay="1.8s" />
        </>
      ) : null}
    </div>
  );
}

function Heart({ className, delay, size = 18 }: { className: string; delay: string; size?: number }) {
  return (
    <svg viewBox="0 0 12 11" width={size} height={size} className={`rise absolute ${className}`} style={{ animationDelay: delay }}>
      <path d="M0 3.5C0 1.5 1.5 0 3.3 0 4.4 0 5.3.6 6 1.4 6.7.6 7.6 0 8.7 0 10.5 0 12 1.5 12 3.5 12 7.5 6 11 6 11S0 7.5 0 3.5z" fill="currentColor" />
    </svg>
  );
}

function Star({ className, delay }: { className: string; delay: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" className={`twinkle absolute ${className}`} style={{ animationDelay: delay }}>
      <path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z" fill="currentColor" />
    </svg>
  );
}
