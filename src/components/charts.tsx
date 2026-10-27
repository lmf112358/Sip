export function Ring({
  ratio,
  size = 128,
  stroke = 9,
  color = "var(--accent)",
  track = "var(--border)",
  children,
}: {
  ratio: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  children?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, ratio || 0));
  return (
    <div style={{ position: "relative", width: size, height: size, flex: "none" }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${v * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 420ms cubic-bezier(.2,.8,.2,1)" }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 1,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function Bars({
  items,
  color = "var(--water)",
  height = 148,
  every = 1,
}: {
  items: { label: string; value: number }[];
  color?: string;
  height?: number;
  every?: number;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const inner = height - 26;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height }}>
      {items.map((it, i) => (
        <div
          key={`${it.label}-${i}`}
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 6,
            minWidth: 0,
          }}
        >
          <div
            title={`${it.label} · ${Math.round(it.value)}`}
            style={{
              width: "100%",
              height: Math.max(3, (it.value / max) * inner),
              background: color,
              borderRadius: 5,
              opacity: it.value > 0 ? 0.92 : 0.14,
              transition: "height 260ms cubic-bezier(.2,.8,.2,1)",
            }}
          />
          <span
            style={{
              fontSize: 10.5,
              color: "var(--text-mute)",
              whiteSpace: "nowrap",
              overflow: "hidden",
            }}
          >
            {i % every === 0 ? it.label : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

export function HourBars({ data, color = "var(--accent)" }: { data: number[]; color?: string }) {
  const max = Math.max(1, ...data);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 92 }}>
      {data.map((v, h) => (
        <div
          key={h}
          title={`${h}:00 · ${v}`}
          style={{
            flex: 1,
            height: Math.max(3, (v / max) * 84),
            background: color,
            borderRadius: 4,
            opacity: v > 0 ? 0.85 : 0.12,
          }}
        />
      ))}
    </div>
  );
}

export function MiniBar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div
      style={{
        height: 4,
        borderRadius: 4,
        background: "var(--border)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(1, ratio)) * 100}%`,
          height: "100%",
          background: color,
          borderRadius: 4,
          transition: "width 400ms cubic-bezier(.2,.8,.2,1)",
        }}
      />
    </div>
  );
}
