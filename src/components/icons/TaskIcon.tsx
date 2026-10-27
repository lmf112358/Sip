const P: Record<string, React.ReactNode> = {
  water: (
    <path d="M12 3.2c0 0-6.4 6.6-6.4 10.9a6.4 6.4 0 0 0 12.8 0C18.4 9.8 12 3.2 12 3.2Z" />
  ),
  eyes: (
    <>
      <path d="M2.6 12c3-4.9 15.8-4.9 18.8 0-3 4.9-15.8 4.9-18.8 0Z" />
      <circle cx="12" cy="12" r="2.6" />
    </>
  ),
  kegel: (
    <>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7.2v6.6M12 13.8 8.2 20.4M12 13.8l3.8 6.6M7.6 10.4h8.8" />
    </>
  ),
  break: (
    <>
      <path d="M4.8 8h10.4v7.2a3 3 0 0 1-3 3H7.8a3 3 0 0 1-3-3V8Z" />
      <path d="M15.2 9.2h1.8a2.2 2.2 0 0 1 0 4.4h-1.8M4 20.6h13" />
    </>
  ),
  walk: (
    <>
      <circle cx="13" cy="4.6" r="1.9" />
      <path d="M12.4 8.2 10 13.4l-4 1.8M10 13.4l3 2.8-1 5M13.2 10.6 16.4 12.8" />
    </>
  ),
  stretch: (
    <>
      <path d="M12 4v6.4M8.2 6.2 12 9l3.8-2.8M9.4 20.6 12 13.2l2.6 7.4" />
    </>
  ),
  coffee: (
    <>
      <path d="M5.2 8.4h9.6v6.4a2.8 2.8 0 0 1-2.8 2.8H8a2.8 2.8 0 0 1-2.8-2.8V8.4Z" />
      <path d="M14.8 9.6h1.6a2 2 0 0 1 0 4h-1.6M3.2 20.4h13.6" />
    </>
  ),
  pill: (
    <>
      <path d="M8.4 16.2 16.2 8.4a3.6 3.6 0 0 0-5.1-5.1L3.3 11.1a3.6 3.6 0 0 0 5.1 5.1Z" />
      <path d="M8.4 16.2 16.2 8.4" />
    </>
  ),
  book: (
    <>
      <path d="M4.4 5.2A2.2 2.2 0 0 1 6.6 3h13v16h-13a2.2 2.2 0 0 0-2.2 2.2V5.2Z" />
      <path d="M4.4 21.2V5.2" />
    </>
  ),
  phone: (
    <>
      <rect x="7.2" y="2.8" width="9.6" height="18.4" rx="1.8" />
      <path d="M10.8 18.4h2.4" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M18.7 5.3l-1.6 1.6M6.9 17.1l-1.6 1.6" />
    </>
  ),
  moon: <path d="M20.2 14.6A8.2 8.2 0 1 1 9.4 3.8a6.6 6.6 0 0 0 10.8 10.8Z" />,
  custom: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 8.2v7.6M8.2 12h7.6" />
    </>
  ),
};

export function TaskIcon({
  name,
  size = 20,
  color,
  strokeWidth = 1.8,
  className,
}: {
  name?: string;
  size?: number;
  color?: string;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? "currentColor"}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {P[name ?? "custom"] ?? P.custom}
    </svg>
  );
}

export function NavIcon({ name }: { name: "today" | "tasks" | "stats" | "settings" }) {
  const paths: Record<string, React.ReactNode> = {
    today: (
      <>
        <circle cx="12" cy="12" r="8.2" />
        <path d="M12 7.6V12l3 1.8" />
      </>
    ),
    tasks: (
      <>
        <path d="M4.4 6.6h15.2M4.4 12h15.2M4.4 17.4h9.4" />
      </>
    ),
    stats: (
      <>
        <path d="M4.4 19.6V13M9.6 19.6V7.4M14.8 19.6v-4.8M20 19.6V10" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M12 3.2v2.2M12 18.6v2.2M4.4 12H2.2M21.8 12h-2.2M6.6 6.6 5 5M19 19l-1.6-1.6M17.4 6.6 19 5M5 19l1.6-1.6" />
      </>
    ),
  };
  return (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="1" y="1" width="22" height="22" rx="7" fill="var(--accent)" opacity="0.16" />
      <path
        d="M12 4.6c0 0-4.6 4.7-4.6 7.7a4.6 4.6 0 0 0 9.2 0c0-3-4.6-7.7-4.6-7.7Z"
        fill="var(--accent)"
      />
    </svg>
  );
}
