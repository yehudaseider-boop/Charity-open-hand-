/**
 * Flat, faceless people for the marketing pages, drawn in Givezy colours (decoration only, hidden from screen
 * readers). Each one moves a little: a wave, hearts rising from a phone, a gentle step. All motion stops for
 * people who ask their device to reduce motion (see .wave, .rise and .bob in globals.css).
 */

type Look = { skin: string; hair: string; top: string; legs: string };

const looks: Record<"a" | "b" | "c", Look> = {
  a: { skin: "#f2c9a5", hair: "#0e1b3d", top: "var(--brand)", legs: "#0e1b3d" },
  b: { skin: "#8d5a3b", hair: "#0e1b3d", top: "var(--coral)", legs: "#4a5878" },
  c: { skin: "#d9a07a", hair: "#5b3a24", top: "var(--honey)", legs: "#1749b5" },
};

function Heart({ x, y, fill, delay }: { x: number; y: number; fill: string; delay: string }) {
  // The position sits on the group; the animation moves the heart inside it (a CSS transform would replace an SVG one).
  return (
    <g transform={`translate(${x} ${y}) scale(1.7)`}>
      <path
        className="rise"
        style={{ animationDelay: delay, transformBox: "fill-box", transformOrigin: "center" }}
        d="M0 3.5C0 1.5 1.5 0 3.3 0 4.4 0 5.3.6 6 1.4 6.7.6 7.6 0 8.7 0 10.5 0 12 1.5 12 3.5 12 7.5 6 11 6 11S0 7.5 0 3.5z"
        fill={fill}
      />
    </g>
  );
}

/** A person holding a phone and waving, with hearts rising from the phone. */
export function GiverWithPhone({ look = "a", className = "" }: { look?: "a" | "b" | "c"; className?: string }) {
  const l = looks[look];
  return (
    <svg aria-hidden viewBox="0 0 200 300" className={className}>
      <ellipse cx="100" cy="290" rx="55" ry="7" fill="var(--brand-soft)" />
      {/* legs and shoes */}
      <rect x="78" y="190" width="18" height="92" rx="9" fill={l.legs} />
      <rect x="104" y="190" width="18" height="92" rx="9" fill={l.legs} />
      <ellipse cx="84" cy="284" rx="14" ry="6" fill="#0e1b3d" />
      <ellipse cx="116" cy="284" rx="14" ry="6" fill="#0e1b3d" />
      {/* waving arm (behind the body), turns at the shoulder */}
      <g className="wave" style={{ transformBox: "view-box", transformOrigin: "128px 122px" }}>
        <path d="M128 122 L156 82" stroke={l.top} strokeWidth="16" strokeLinecap="round" />
        <circle cx="158" cy="76" r="9" fill={l.skin} />
      </g>
      {/* body */}
      <path d="M70 128c0-14 12-24 30-24s30 10 30 24v70H70z" fill={l.top} />
      {/* neck and head */}
      <rect x="93" y="90" width="14" height="18" rx="6" fill={l.skin} />
      <circle cx="100" cy="74" r="22" fill={l.skin} />
      <path d="M78 72c0-15 10-24 22-24s23 8 23 22c-7-6-17-9-27-8-7 1-13 5-18 10z" fill={l.hair} />
      {/* arm holding the phone */}
      <path d="M74 130 L66 168 L92 160" stroke={l.top} strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <circle cx="94" cy="160" r="8" fill={l.skin} />
      <rect x="88" y="134" width="22" height="36" rx="5" fill="#0e1b3d" />
      <rect x="91" y="138" width="16" height="26" rx="3" fill="var(--honey-soft)" />
      <path transform="translate(94 146) scale(0.85)" d="M0 3.5C0 1.5 1.5 0 3.3 0 4.4 0 5.3.6 6 1.4 6.7.6 7.6 0 8.7 0 10.5 0 12 1.5 12 3.5 12 7.5 6 11 6 11S0 7.5 0 3.5z" fill="var(--coral)" />
      {/* hearts rising from the phone */}
      <Heart x={40} y={118} fill="var(--coral)" delay="0s" />
      <Heart x={22} y={132} fill="var(--honey)" delay="1.2s" />
      <Heart x={50} y={140} fill="var(--brand)" delay="2.4s" />
    </svg>
  );
}

/** A person carrying a food parcel box, stepping gently. */
export function PersonWithBox({ look = "b", className = "" }: { look?: "a" | "b" | "c"; className?: string }) {
  const l = looks[look];
  return (
    <svg aria-hidden viewBox="0 0 200 300" className={className}>
      <ellipse cx="100" cy="290" rx="55" ry="7" fill="var(--brand-soft)" />
      <g className="bob">
        <rect x="78" y="190" width="18" height="92" rx="9" fill={l.legs} />
        <rect x="104" y="190" width="18" height="92" rx="9" fill={l.legs} />
        <ellipse cx="84" cy="284" rx="14" ry="6" fill="#0e1b3d" />
        <ellipse cx="116" cy="284" rx="14" ry="6" fill="#0e1b3d" />
        <path d="M70 128c0-14 12-24 30-24s30 10 30 24v70H70z" fill={l.top} />
        <rect x="93" y="90" width="14" height="18" rx="6" fill={l.skin} />
        <circle cx="100" cy="74" r="22" fill={l.skin} />
        <path d="M77 76c-2-18 9-29 23-29 15 0 25 11 22 28-5-9-13-14-22-14s-17 5-23 15z" fill={l.hair} />
        <circle cx="100" cy="46" r="9" fill={l.hair} />
        {/* the box, held in front with both hands */}
        <rect x="62" y="132" width="76" height="56" rx="6" fill="var(--peach)" stroke="#d9621c" strokeWidth="2" />
        <path d="M62 148h76" stroke="#d9621c" strokeWidth="2" />
        <path transform="translate(91 158) scale(1.5)" d="M0 3.5C0 1.5 1.5 0 3.3 0 4.4 0 5.3.6 6 1.4 6.7.6 7.6 0 8.7 0 10.5 0 12 1.5 12 3.5 12 7.5 6 11 6 11S0 7.5 0 3.5z" fill="var(--brand)" />
        <circle cx="62" cy="168" r="8" fill={l.skin} />
        <circle cx="138" cy="168" r="8" fill={l.skin} />
      </g>
    </svg>
  );
}

/** A person with a clipboard (a charity volunteer), ticking things off. */
export function Volunteer({ look = "c", className = "" }: { look?: "a" | "b" | "c"; className?: string }) {
  const l = looks[look];
  return (
    <svg aria-hidden viewBox="0 0 200 300" className={className}>
      <ellipse cx="100" cy="290" rx="55" ry="7" fill="var(--brand-soft)" />
      <rect x="78" y="190" width="18" height="92" rx="9" fill={l.legs} />
      <rect x="104" y="190" width="18" height="92" rx="9" fill={l.legs} />
      <ellipse cx="84" cy="284" rx="14" ry="6" fill="#0e1b3d" />
      <ellipse cx="116" cy="284" rx="14" ry="6" fill="#0e1b3d" />
      <path d="M70 128c0-14 12-24 30-24s30 10 30 24v70H70z" fill={l.top} />
      <rect x="93" y="90" width="14" height="18" rx="6" fill={l.skin} />
      <circle cx="100" cy="74" r="22" fill={l.skin} />
      <path d="M78 80c-3-20 8-32 22-32 16 0 26 12 22 32l-4-12c-6-6-30-6-36 0z" fill={l.hair} />
      {/* clipboard */}
      <rect x="66" y="128" width="46" height="60" rx="5" fill="#ffffff" stroke="#0e1b3d" strokeWidth="2.5" />
      <rect x="80" y="123" width="18" height="9" rx="3" fill="#0e1b3d" />
      <path d="M73 146l4 4 7-7M73 162l4 4 7-7M73 178l4 4 7-7" stroke="var(--sage)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M90 147h15M90 163h15M90 179h11" stroke="var(--honey)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="70" cy="170" r="8" fill={l.skin} />
      {/* writing hand, moving the pen */}
      <g className="wave" style={{ transformBox: "view-box", transformOrigin: "128px 128px", animationDuration: "1.8s" }}>
        <path d="M128 128 L120 166" stroke={l.top} strokeWidth="16" strokeLinecap="round" />
        <circle cx="118" cy="170" r="8" fill={l.skin} />
        <path d="M112 176l-8 8" stroke="var(--brand)" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}
