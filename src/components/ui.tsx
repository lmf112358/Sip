import { useEffect } from "react";

export function Button({
  children,
  onClick,
  variant = "ghost",
  disabled,
  style,
  full,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "ghost" | "danger" | "plain";
  disabled?: boolean;
  style?: React.CSSProperties;
  full?: boolean;
  title?: string;
}) {
  const base: React.CSSProperties = {
    height: 44,
    padding: "0 16px",
    borderRadius: 12,
    fontSize: 14,
    fontWeight: 500,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    width: full ? "100%" : undefined,
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? "not-allowed" : "pointer",
    transition: "180ms cubic-bezier(.2,.8,.2,1)",
    ...style,
  };
  const variants: Record<string, React.CSSProperties> = {
    primary: { background: "var(--accent)", color: "var(--on-task)" },
    ghost: {
      border: "1px solid var(--border-strong)",
      color: "var(--text-dim)",
      background: "transparent",
    },
    danger: {
      border: "1px solid var(--danger)",
      color: "var(--danger)",
      background: "transparent",
    },
    plain: { color: "var(--text-dim)", background: "transparent" },
  };
  return (
    <button
      className="focus-ring"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{ ...base, ...variants[variant] }}
      onMouseEnter={(e) => {
        if (disabled) return;
        if (variant === "ghost") e.currentTarget.style.background = "var(--surface-2)";
        if (variant === "primary") e.currentTarget.style.filter = "brightness(1.06)";
      }}
      onMouseLeave={(e) => {
        if (variant === "ghost") e.currentTarget.style.background = "transparent";
        if (variant === "primary") e.currentTarget.style.filter = "none";
      }}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  style,
  className,
  onClick,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <div className={`card ${className ?? ""}`} style={style} onClick={onClick}>
      {children}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="focus-ring"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={{
        width: 46,
        height: 27,
        borderRadius: 999,
        background: checked ? "var(--accent)" : "var(--surface-3)",
        position: "relative",
        transition: "220ms cubic-bezier(.2,.8,.2,1)",
        opacity: disabled ? 0.4 : 1,
        flex: "none",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3.5,
          left: checked ? 22.5 : 3.5,
          width: 20,
          height: 20,
          borderRadius: 999,
          background: checked ? "#fff" : "var(--text-mute)",
          transition: "220ms cubic-bezier(.2,.8,.2,1)",
        }}
      />
    </button>
  );
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ width: "100%", accentColor: "var(--accent)", cursor: "pointer" }}
    />
  );
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  size = "md",
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 3,
        gap: 2,
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: 11,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            style={{
              padding: size === "sm" ? "5px 10px" : "7px 14px",
              borderRadius: 8,
              fontSize: size === "sm" ? 12 : 13,
              fontWeight: active ? 500 : 400,
              color: active ? "var(--text)" : "var(--text-mute)",
              background: active ? "var(--surface)" : "transparent",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,.12)" : "none",
              transition: "160ms",
              whiteSpace: "nowrap",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  style,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 7, ...style }}>
      <span style={{ fontSize: 12, color: "var(--text-dim)" }}>{label}</span>
      {children}
      {hint ? <span style={{ fontSize: 11.5, color: "var(--text-mute)" }}>{hint}</span> : null}
    </div>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  min,
  max,
  style,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  min?: number;
  max?: number;
  style?: React.CSSProperties;
}) {
  return (
    <input
      className="focus-ring"
      type={type}
      min={min}
      max={max}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        height: 42,
        padding: "0 12px",
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--surface-2)",
        color: "var(--text)",
        fontSize: 14,
        width: "100%",
        outline: "none",
        ...style,
      }}
    />
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 24,
      }}
    >
      <div
        className="rise"
        style={{
          width,
          maxWidth: "100%",
          maxHeight: "86vh",
          display: "flex",
          flexDirection: "column",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 20,
          boxShadow: "var(--shadow)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "18px 22px",
            borderBottom: "1px solid var(--border)",
            fontSize: 16,
            fontWeight: 500,
          }}
        >
          {title}
        </div>
        <div style={{ padding: 22, overflowY: "auto", flex: 1 }}>{children}</div>
        {footer ? (
          <div
            style={{
              padding: "14px 22px",
              borderTop: "1px solid var(--border)",
              display: "flex",
              justifyContent: "flex-end",
              gap: 10,
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Row({
  label,
  desc,
  children,
  last,
}: {
  label: string;
  desc?: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        padding: "14px 0",
        borderBottom: last ? "none" : "1px solid var(--border)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14, color: "var(--text)" }}>{label}</div>
        {desc ? (
          <div style={{ fontSize: 12, color: "var(--text-mute)", marginTop: 2 }}>{desc}</div>
        ) : null}
      </div>
      <div style={{ flex: "none" }}>{children}</div>
    </div>
  );
}

export function Tag({
  children,
  color = "var(--text-dim)",
  bg,
}: {
  children: React.ReactNode;
  color?: string;
  bg?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 6,
        color,
        background: bg ?? "var(--surface-2)",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}
