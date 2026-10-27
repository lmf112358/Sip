import { useT } from "@/i18n";
import type { TaskView } from "@/lib/types";
import { fmtClock } from "@/lib/format";
import { taskColor } from "@/lib/tokens";
import { taskLabel } from "@/lib/labels";
import { TaskIcon } from "./icons/TaskIcon";
import { MiniBar } from "./charts";
import { Tag } from "./ui";

export function statusText(status: TaskView["status"], t: ReturnType<typeof useT>["t"]) {
  switch (status) {
    case "running":
      return t("status.running");
    case "paused":
      return t("status.paused");
    case "done":
      return t("status.done");
    case "inactive":
      return t("status.inactive");
    case "meeting":
      return t("status.meeting");
    default:
      return "";
  }
}

export function TaskCard({
  task,
  selected,
  onClick,
  onOpen,
}: {
  task: TaskView;
  selected?: boolean;
  onClick?: () => void;
  onOpen?: () => void;
}) {
  const { t } = useT();
  const color = taskColor(task.type);
  const dim = task.status === "inactive" || task.status === "done" || task.status === "meeting";

  return (
    <div
      role="button"
      tabIndex={0}
      className="focus-ring"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick?.();
      }}
      style={{
        textAlign: "left",
        padding: "11px 12px",
        borderRadius: 14,
        border: `1px solid ${selected ? color : "var(--border)"}`,
        background: selected ? "var(--surface-2)" : "var(--surface)",
        display: "flex",
        flexDirection: "column",
        gap: 7,
        minWidth: 0,
        transition: "180ms",
        opacity: dim ? 0.62 : 1,
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
        <span style={{ color, display: "flex", flex: "none" }}>
          <TaskIcon name={task.icon} size={16} />
        </span>
        <span
          style={{
            fontSize: 12.5,
            color: "var(--text-dim)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            flex: 1,
            minWidth: 0,
          }}
        >
          {taskLabel(task, t)}
        </span>
        {onOpen ? (
          <button
            title={t("task.detail")}
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            style={{ fontSize: 11, color: "var(--text-mute)", flex: "none", padding: "0 2px" }}
          >
            ›
          </button>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span
          className="num"
          style={{
            fontSize: task.status === "running" ? 20 : 14,
            fontWeight: 500,
            color: task.status === "running" ? "var(--text)" : "var(--text-mute)",
            letterSpacing: "-0.01em",
          }}
        >
          {task.status === "running" ? fmtClock(task.remainingSec) : statusText(task.status, t)}
        </span>
      </div>
      {/* 记录 + 计时并排 */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 6, minWidth: 0 }}>
        <span className="num" style={{ fontSize: 10.5, color: "var(--text-mute)" }}>
          {t("today.count", { n: task.countToday })}
        </span>
        <span className="num" style={{ fontSize: 10.5, color: "var(--text-mute)" }}>
          {task.nextDue ?? ""}
        </span>
      </div>
      <MiniBar ratio={task.goalRatio} color={color} />
    </div>
  );
}

export function TaskRow({
  task,
  index,
  total,
  onOpen,
  onToggle,
  onMove,
}: {
  task: TaskView;
  index: number;
  total: number;
  onOpen: () => void;
  onToggle: (v: boolean) => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useT();
  const color = taskColor(task.type);
  return (
    <div
      className="card task-row"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
      }}
      style={{
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        opacity: task.enabled ? 1 : 0.6,
        cursor: "pointer",
      }}
    >
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          background: `color-mix(in srgb, ${color} 15%, transparent)`,
          color,
          flex: "none",
        }}
      >
        <TaskIcon name={task.icon} size={20} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 14.5, fontWeight: 500 }}>{taskLabel(task, t)}</span>
          <Tag color={color} bg={`color-mix(in srgb, ${color} 13%, transparent)`}>
            {t("unit.min", { n: task.intervalMin })}
          </Tag>
          <Tag>{task.remindOverride ? styleName(task.remindStyle, t) : t("task.followDefault")}</Tag>
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--text-mute)",
            marginTop: 3,
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <span>
            {task.activeStart}–{task.activeEnd}
          </span>
          <span>{task.weekdays.map((d) => t(`weekday.${d}` as never)).join(" ")}</span>
          <span className="num">{t("today.count", { n: task.countToday })}</span>
          <span className="num">{task.nextDue ?? "--:--"}</span>
        </div>
      </div>

      <div
        style={{ display: "flex", alignItems: "center", gap: 4, flex: "none" }}
        onClick={(e) => e.stopPropagation()}
      >
        <IconBtn label={t("task.moveUp")} disabled={index === 0} onClick={() => onMove(-1)}>
          ↑
        </IconBtn>
        <IconBtn label={t("task.moveDown")} disabled={index === total - 1} onClick={() => onMove(1)}>
          ↓
        </IconBtn>
        <div style={{ width: 6 }} />
        <SwitchSmall checked={task.enabled} onChange={onToggle} />
      </div>
    </div>
  );
}

function styleName(style: string, t: ReturnType<typeof useT>["t"]) {
  if (style === "fullscreen") return t("task.style.fullscreen");
  if (style === "toast") return t("task.style.toast");
  return t("task.style.system");
}

function IconBtn({
  children,
  onClick,
  label,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      className="focus-ring"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 30,
        height: 30,
        borderRadius: 8,
        display: "grid",
        placeItems: "center",
        color: danger ? "var(--danger)" : "var(--text-mute)",
        opacity: disabled ? 0.28 : 1,
        fontSize: 13,
        transition: "140ms",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "var(--surface-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

function SwitchSmall({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className="focus-ring"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        background: checked ? "var(--accent)" : "var(--surface-3)",
        position: "relative",
        transition: "200ms",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 19 : 3,
          width: 16,
          height: 16,
          borderRadius: 999,
          background: checked ? "#fff" : "var(--text-mute)",
          transition: "200ms",
        }}
      />
    </button>
  );
}
