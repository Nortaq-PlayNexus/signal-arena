import type { GameId } from "@/core/engine";

/* ------------------------------------------------------------------ */
/* Identity mark — drawn, not generated: broadcast arcs + arena chevron */
/* ------------------------------------------------------------------ */
export function Mark({ size = 34, className = "" }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden="true">
      <rect x="1.5" y="1.5" width="45" height="45" rx="6" fill="#0d1013" stroke="#2A2F37" strokeWidth="1.5" />
      <path
        d="M14 34c0-9 5.5-14.5 12-14.5 4.6 0 7.6 2.4 7.6 5.7 0 3.2-2.6 5-6.6 5H21"
        fill="none"
        stroke="#FFB020"
        strokeWidth="3.2"
        strokeLinecap="square"
      />
      <path d="M24 12.5v6M24 29.5v6" stroke="#FFB020" strokeWidth="2.4" strokeLinecap="square" />
      <path d="M30.5 22.5c1.9 1.4 3 3.4 3 5.6 0 2.3-1.1 4.3-3 5.7" fill="none" stroke="#B8760C" strokeWidth="2.2" />
      <path d="M35.5 18c3 2.6 4.7 6.1 4.7 10s-1.8 7.5-4.7 10" fill="none" stroke="#B8760C" strokeWidth="1.8" opacity="0.75" />
      <path d="M11 38h26" stroke="#2A2F37" strokeWidth="1.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Four cartridge glyphs — small technical diagrams, one per game       */
/* ------------------------------------------------------------------ */
const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "square" as const };

export function Glyph({ id, size = 34 }: { id: GameId; size?: number }) {
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      {id === "pellet" && (
        <g {...S}>
          <path d="M6 6h28v28H6z" opacity="0.28" />
          <path d="M12 6v6M20 6v4M28 6v6M6 14h6M34 14h-6M6 26h6M34 26h-6M12 34v-6M20 34v-4M28 34v-6" opacity="0.5" />
          <circle cx="14" cy="20" r="2.2" fill="currentColor" stroke="none" />
          <circle cx="20" cy="20" r="2.2" fill="currentColor" stroke="none" />
          <circle cx="26" cy="20" r="2.2" fill="currentColor" stroke="none" />
          <path d="M31.5 14.5a6.2 6.2 0 1 0 0 11l-2.6-5.5z" fill="currentColor" stroke="none" opacity="0.9" />
        </g>
      )}
      {id === "stack" && (
        <g {...S}>
          <path d="M8 32h24" opacity="0.4" />
          <path d="M10 26h6v6h-6zM16 26h6v6h-6zM22 26h6v6h-6zM13 20h6v6h-6zM19 20h6v6h-6z" opacity="0.85" />
          <path d="M11 8h4v4h-4zM15 8h4v4h-4zM19 8h4v4h-4zM23 8h4v4h-4z" opacity="0.55" />
          <path d="M28 12v10" strokeDasharray="2 3" opacity="0.6" />
        </g>
      )}
      {id === "circuit" && (
        <g {...S}>
          <path d="M20 5c7 0 12 3.4 12 8.2 0 3.4-2.6 5.4-6 6.4-3.6 1-6 2.6-6 5.6 0 3.6 3.6 5.8 8 5.8" opacity="0.85" />
          <path d="M20 5c-7 0-12 3.4-12 8.2 0 3.4 2.6 5.4 6 6.4 3.6 1 6 2.6 6 5.6 0 3.6-3.6 5.8-8 5.8" opacity="0.85" />
          <path d="M20 12l4 4-4 4" opacity="0.7" />
          <path d="M14 34h12" opacity="0.4" />
        </g>
      )}
      {id === "brawl" && (
        <g {...S}>
          <path d="M6 30h28" opacity="0.85" />
          <path d="M6 34h28" opacity="0.3" />
          <circle cx="13" cy="15" r="3.2" />
          <path d="M13 18v7M13 21l-4 2M13 21l5 1" />
          <circle cx="28" cy="16" r="3.2" />
          <path d="M28 19v6M28 22l4 1M28 22l-5 2" />
          <path d="M19 12l3-3M19 17h-2M22 20l3 3" opacity="0.6" />
        </g>
      )}
    </svg>
  );
}

export function Silk({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`silk ${className}`}>{children}</div>;
}

export function Screws() {
  return (
    <>
      <div className="screw absolute left-1.5 top-1.5" />
      <div className="screw absolute right-1.5 top-1.5" />
      <div className="screw absolute bottom-1.5 left-1.5" />
      <div className="screw absolute bottom-1.5 right-1.5" />
    </>
  );
}

export function Meter({ value, color = "#FFB020", bars = 10 }: { value: number; color?: string; bars?: number }) {
  const lit = Math.round(value * bars);
  return (
    <div className="flex gap-[2px]">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="h-[7px] w-[3px]"
          style={{
            background: i < lit ? color : "#2A2F37",
            opacity: i < lit ? 1 : 0.65,
            boxShadow: i < lit ? `0 0 5px ${color}66` : "none",
          }}
        />
      ))}
    </div>
  );
}
