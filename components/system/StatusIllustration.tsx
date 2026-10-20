export type StatusVariant = "not-found" | "error" | "forbidden" | "waiting";

const fill = (variable: string, opacity?: number) => ({
  fill: `var(${variable})`,
  fillOpacity: opacity,
});

const LIT = "#f6c445";

export function StatusIllustration({ variant }: { variant: StatusVariant }) {
  const lit = variant === "not-found" || variant === "waiting";
  const windows: [number, number][] = [
    [64, 34], [100, 34], [136, 34],
    [64, 62], [136, 62],
    [64, 90], [136, 90],
  ];
  return (
    <svg viewBox="0 0 220 150" className="h-auto w-44" aria-hidden="true">
      <rect x="30" y="134" width="160" height="4" rx="2" style={fill("--border")} />
      <rect x="52" y="22" width="116" height="112" rx="6" style={fill("--muted-foreground", 0.3)} />
      {windows.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="20" height="18" rx="2" style={fill("--background")} />
      ))}
      <rect
        x="100"
        y="62"
        width="20"
        height="18"
        rx="2"
        className={lit ? "motion-safe:animate-pulse" : undefined}
        style={lit ? { fill: LIT } : fill("--muted-foreground", 0.45)}
      />
      {variant === "error" && (
        <path
          d="M104 66 l12 10 m0 -10 l-12 10"
          stroke="var(--destructive)"
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
        />
      )}
      <rect x="96" y="96" width="28" height="38" rx="3" style={fill("--muted-foreground", 0.75)} />
      {variant === "waiting" && (
        <path d="M96 96 L108 100 L108 134 L96 134 Z" style={fill("--foreground", 0.35)} />
      )}
      {variant === "forbidden" && (
        <g>
          <rect x="104" y="108" width="12" height="10" rx="2" style={{ fill: LIT }} />
          <path
            d="M107 108 v-3 a3 3 0 0 1 6 0 v3"
            fill="none"
            stroke={LIT}
            strokeWidth="2"
          />
        </g>
      )}
    </svg>
  );
}
