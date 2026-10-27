import { useEffect, useState } from "react";
import { I18nProvider, useT } from "@/i18n";
import { useStore } from "@/lib/store";
import { NavIcon } from "@/components/icons/TaskIcon";
import { closeWindow, isMaximized, minimizeWindow, toggleMaximize } from "@/lib/win";
import { TodayPage } from "./pages/Today";
import { TasksPage } from "./pages/Tasks";
import { StatsPage } from "./pages/Stats";
import { SettingsPage } from "./pages/Settings";
import { TaskDetailPage } from "./pages/TaskDetail";
import { ReminderSettingsPage } from "./pages/ReminderSettings";

export type Page = "today" | "tasks" | "stats" | "settings";

const NAV: { key: Page; icon: "today" | "tasks" | "stats" | "settings" }[] = [
  { key: "today", icon: "today" },
  { key: "tasks", icon: "tasks" },
  { key: "stats", icon: "stats" },
  { key: "settings", icon: "settings" },
];

export function AppShell() {
  const { settings } = useStore();
  const [page, setPage] = useState<Page>("today");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [reminderOpen, setReminderOpen] = useState(false);
  const [maxed, setMaxed] = useState(false);

  useEffect(() => {
    isMaximized().then(setMaxed);
  }, []);

  const go = (p: Page) => {
    setDetailId(null);
    setReminderOpen(false);
    setPage(p);
  };

  return (
    <I18nProvider language={settings.language}>
      <Shell
        page={page}
        setPage={go}
        detailId={detailId}
        setDetailId={setDetailId}
        reminderOpen={reminderOpen}
        setReminderOpen={setReminderOpen}
        maxed={maxed}
        setMaxed={setMaxed}
      />
    </I18nProvider>
  );
}

function Shell({
  page,
  setPage,
  detailId,
  setDetailId,
  reminderOpen,
  setReminderOpen,
  maxed,
  setMaxed,
}: {
  page: Page;
  setPage: (p: Page) => void;
  detailId: string | null;
  setDetailId: (v: string | null) => void;
  reminderOpen: boolean;
  setReminderOpen: (v: boolean) => void;
  maxed: boolean;
  setMaxed: (v: boolean) => void;
}) {
  const { t } = useT();

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)" }}>
      <div
        data-tauri-drag-region
        style={{
          height: 42,
          flex: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
          padding: "0 8px",
          cursor: "default",
        }}
      >
        <div style={{ display: "flex", gap: 2 }} className="no-drag">
          <WinBtn label="min" onClick={minimizeWindow}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M2 5h6" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </WinBtn>
          <WinBtn
            label="max"
            onClick={async () => {
              await toggleMaximize();
              setMaxed(await isMaximized());
            }}
          >
            {maxed ? (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="2.6" y="1.6" width="5" height="5" stroke="currentColor" strokeWidth="1.1" />
                <rect x="1.4" y="3.2" width="5" height="5" stroke="currentColor" strokeWidth="1.1" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="1.8" y="1.8" width="6.4" height="6.4" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            )}
          </WinBtn>
          <WinBtn label="close" danger onClick={closeWindow}>
            <svg width="10" height="10" viewBox="0 0 10 10">
              <path d="M2 2l6 6M8 2L2 8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </WinBtn>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <aside
          style={{
            width: 150,
            flex: "none",
            padding: "2px 12px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 3,
          }}
        >
          {NAV.map((n) => {
            const active = page === n.key;
            return (
              <button
                key={n.key}
                className="focus-ring"
                onClick={() => setPage(n.key)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 40,
                  padding: "0 11px",
                  borderRadius: 10,
                  color: active ? "var(--text)" : "var(--text-mute)",
                  background: active ? "var(--surface)" : "transparent",
                  border: `1px solid ${active ? "var(--border)" : "transparent"}`,
                  fontSize: 13.5,
                  fontWeight: active ? 500 : 400,
                  transition: "160ms",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = "var(--text-dim)";
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = "var(--text-mute)";
                }}
              >
                <NavIcon name={n.icon} />
                {t(`nav.${n.key}` as never)}
              </button>
            );
          })}
        </aside>

        <main
          style={{
            flex: 1,
            minWidth: 0,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "0 26px 26px 4px",
          }}
        >
          {detailId ? (
            <TaskDetailPage taskId={detailId} onBack={() => setDetailId(null)} />
          ) : (
            <>
              {page === "today" && (
                <TodayPage onGoTasks={() => setPage("tasks")} onOpenTask={setDetailId} />
              )}
              {page === "tasks" && <TasksPage onOpenTask={setDetailId} />}
              {page === "stats" && <StatsPage />}
              {page === "settings" &&
                (reminderOpen ? (
                  <div style={{ maxWidth: 760, margin: "0 auto" }}>
                    <button
                      onClick={() => setReminderOpen(false)}
                      style={{ fontSize: 12, color: "var(--text-mute)", marginBottom: 10 }}
                    >
                      ‹ {t("task.back")}
                    </button>
                    <ReminderSettingsPage />
                  </div>
                ) : (
                  <SettingsPage onOpenReminder={() => setReminderOpen(true)} />
                ))}
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function WinBtn({
  children,
  onClick,
  label,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  danger?: boolean;
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      style={{
        width: 34,
        height: 26,
        display: "grid",
        placeItems: "center",
        borderRadius: 7,
        color: "var(--text-mute)",
        transition: "140ms",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = danger ? "var(--danger)" : "var(--surface-2)";
        e.currentTarget.style.color = danger ? "#fff" : "var(--text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = "var(--text-mute)";
      }}
    >
      {children}
    </button>
  );
}
