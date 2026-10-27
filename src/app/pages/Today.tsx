import { useMemo, useState } from "react";
import { useT } from "@/i18n";
import type { MsgKey } from "@/i18n/zh";
import { useStore } from "@/lib/store";
import { fmtClock, fmtDate, greeting } from "@/lib/format";
import { taskColor } from "@/lib/tokens";
import { actionLabel, progressText, taskLabel } from "@/lib/labels";
import { Ring } from "@/components/charts";
import { TaskCard, statusText } from "@/components/TaskCard";
import { TaskIcon } from "@/components/icons/TaskIcon";
import { Button, Card, Tag } from "@/components/ui";
import type { RecordRow } from "@/lib/types";

export function TodayPage({
  onGoTasks,
  onOpenTask,
}: {
  onGoTasks: () => void;
  onOpenTask: (id: string) => void;
}) {
  const {
    snapshot,
    settings,
    log,
    snooze,
    startSession,
    endSession,
    extendSession,
    setPaused,
    playChime,
    preview,
    deleteRecord,
  } = useStore();
  const { t, lang } = useT();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [press, setPress] = useState(false);
  const [showAllRecords, setShowAllRecords] = useState(false);

  const tasks = snapshot?.tasks ?? [];
  const enabled = tasks.filter((x) => x.enabled);
  const next = tasks.find((x) => x.id === snapshot?.nextTaskId) ?? enabled[0] ?? null;
  const selected = tasks.find((x) => x.id === selectedId) ?? next;
  const session = snapshot?.session ?? null;

  const overview = snapshot?.today ?? [];
  const totals = useMemo(() => {
    const count = overview.reduce((a, b) => a + b.count, 0);
    const skips = overview.reduce((a, b) => a + b.skips, 0);
    return {
      count,
      skips,
      skipRate: count + skips > 0 ? Math.round((skips / (count + skips)) * 100) : 0,
    };
  }, [overview]);

  const hour = new Date().getHours();
  const hello = t(`greet.${greeting(hour)}` as MsgKey);
  const userName = settings.userName?.trim();
  const water = overview.find((x) => x.type === "water");

  const records = snapshot?.records ?? [];
  const shownRecords = showAllRecords ? records : records.slice(0, 6);

  const elapsedMin = useMemo(() => {
    if (!session) return 0;
    const [h, m] = session.startedAt.split(":").map(Number);
    const start = new Date();
    start.setHours(h, m, 0, 0);
    return Math.max(0, Math.round((Date.now() - start.getTime()) / 60000));
  }, [session]);

  const doLog = async (action: string, value?: number) => {
    if (!selected) return;
    playChime();
    await log(selected.id, action, value);
  };

  const meetingMinutes = () => {
    const now = new Date();
    const tmr = new Date(now);
    tmr.setDate(tmr.getDate() + 1);
    tmr.setHours(9, 0, 0, 0);
    return Math.max(1, Math.round((tmr.getTime() - now.getTime()) / 60000));
  };

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      {/* 顶部 */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 21, fontWeight: 500, letterSpacing: "-0.01em" }}>
            {userName ? `${hello}，${userName}` : hello}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-mute)", marginTop: 3 }}>
            {fmtDate(lang)}
            {snapshot && totals.count > 0 ? ` · ${t("today.count", { n: totals.count })}` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {!session && (
            <Button variant="ghost" onClick={() => startSession("focus", 30)}>
              {t("focus.start", { n: 30 })}
            </Button>
          )}
          {/* 会议常驻开关：点一下开，再点一下关 */}
          <button
            className="focus-ring"
            onClick={() => (session ? endSession() : startSession("meeting", 0))}
            title={t("meeting.onceOn")}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              height: 38,
              padding: "0 15px",
              borderRadius: 10,
              fontSize: 13,
              fontWeight: session ? 500 : 400,
              color: session ? "#fff" : "var(--text-dim)",
              background: session
                ? "var(--danger)"
                : "color-mix(in srgb, var(--danger) 12%, transparent)",
              border: `1px solid ${session ? "transparent" : "color-mix(in srgb, var(--danger) 34%, transparent)"}`,
              transition: "160ms",
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: 999,
                background: session ? "#fff" : "var(--danger)",
                boxShadow: session ? "0 0 0 3px rgba(255,255,255,.25)" : "none",
              }}
            />
            {session ? t("meeting.end") : t("meeting.start")}
          </button>
        </div>
      </div>

      {/* 会议横幅 */}
      {session ? (
        <div
          className="rise"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 14,
            padding: "11px 16px",
            marginBottom: 12,
            borderRadius: 14,
            border: "1px solid color-mix(in srgb, var(--danger) 38%, transparent)",
            background: "color-mix(in srgb, var(--danger) 9%, transparent)",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 500 }}>
              {session.kind === "meeting" ? t("meeting.in") : t("focus.in")}
              {elapsedMin > 0 ? ` · ${t("meeting.since", { t: t("unit.min", { n: elapsedMin }) })}` : ""}
              {session.remainingSec >= 0 ? ` · ${t("meeting.remain", { time: fmtClock(session.remainingSec) })}` : ""}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-mute)", marginTop: 2 }}>
              {t("meeting.blockAll")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flex: "none" }}>
            {session.remainingSec >= 0 && (
              <Button variant="ghost" onClick={() => extendSession(15)}>
                {t("meeting.extend", { n: 15 })}
              </Button>
            )}
            <Button variant="primary" onClick={endSession} style={{ background: "var(--danger)", color: "#fff" }}>
              {t("meeting.end")}
            </Button>
          </div>
        </div>
      ) : null}

      {/* 安静时段 */}
      {!session && snapshot?.quietNow ? (
        <div
          style={{
            padding: "10px 14px",
            marginBottom: 12,
            borderRadius: 12,
            background: "var(--surface-2)",
            fontSize: 12.5,
            color: "var(--text-dim)",
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <span>{t("today.quietHint")}</span>
          {snapshot.quietEnd ? (
            <span style={{ color: "var(--text-mute)" }}>{t("today.quietEnd", { t: snapshot.quietEnd })}</span>
          ) : null}
        </div>
      ) : null}

      {!session && !snapshot?.quietNow && snapshot?.softLandingSec ? (
        <div
          style={{
            padding: "10px 14px",
            marginBottom: 12,
            borderRadius: 12,
            background: "var(--surface-2)",
            fontSize: 12.5,
            color: "var(--text-dim)",
          }}
        >
          {t("meeting.softLanding", { n: snapshot.softLandingSec })}
        </div>
      ) : null}

      {tasks.length === 0 ? (
        <Card style={{ padding: 40, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 14 }}>{t("today.empty")}</div>
          <Button variant="primary" onClick={onGoTasks}>
            {t("task.addFirst")}
          </Button>
        </Card>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1.55fr 1fr", gap: 12 }}>
            {/* 主卡 */}
            <Card style={{ padding: "16px 20px" }}>
              {selected ? (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                    <span
                      style={{
                        width: 5,
                        height: 5,
                        borderRadius: 999,
                        background: taskColor(selected.type),
                      }}
                    />
                    <span style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.04em" }}>
                      {t("today.next")} · {taskLabel(selected, t)}
                    </span>
                    {selected.status !== "running" && (
                      <Tag color={taskColor(selected.type)}>{statusText(selected.status, t)}</Tag>
                    )}
                    <button
                      onClick={() => onOpenTask(selected.id)}
                      style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--text-mute)" }}
                    >
                      {t("task.detail")} ›
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 12 }}>
                    <Ring ratio={selected.goalRatio} size={120} stroke={9} color={taskColor(selected.type)}>
                      <span className="num" style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em" }}>
                        {selected.status === "running"
                          ? fmtClock(selected.remainingSec)
                          : selected.status === "done"
                            ? "✓"
                            : "--:--"}
                      </span>
                      <span style={{ fontSize: 10.5, color: "var(--text-mute)" }}>
                        {selected.status === "running" ? t("today.remaining") : statusText(selected.status, t)}
                      </span>
                    </Ring>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      {/* 记录 + 计时并排 */}
                      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
                        <div>
                          <div style={{ fontSize: 10.5, color: "var(--text-mute)" }}>{t("today.records")}</div>
                          <div className="num" style={{ fontSize: 15, marginTop: 2 }}>
                            {t("today.count", { n: selected.countToday })}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 10.5, color: "var(--text-mute)" }}>{t("today.next")}</div>
                          <div className="num" style={{ fontSize: 15, marginTop: 2 }}>
                            {selected.nextDue ?? "--:--"}
                          </div>
                        </div>
                      </div>
                      <div className="num" style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 8 }}>
                        {progressText(selected, t)}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 3 }}>
                        {t("unit.min", { n: selected.intervalMin })}
                      </div>
                    </div>
                  </div>

                  <button
                    className="focus-ring"
                    onMouseDown={() => setPress(true)}
                    onMouseUp={() => setPress(false)}
                    onMouseLeave={() => setPress(false)}
                    onClick={() => doLog("complete")}
                    style={{
                      width: "100%",
                      height: 68,
                      marginTop: 14,
                      borderRadius: 16,
                      background: taskColor(selected.type),
                      color: "var(--on-task)",
                      fontSize: 17.5,
                      fontWeight: 500,
                      transform: press ? "scale(.985)" : "none",
                      transition: "160ms cubic-bezier(.2,.8,.2,1)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 10,
                      padding: "0 16px",
                      whiteSpace: "normal",
                      textAlign: "center",
                      lineHeight: 1.3,
                    }}
                  >
                    <TaskIcon name={selected.icon} size={21} color="var(--on-task)" strokeWidth={2} />
                    {actionLabel(selected, t)}
                  </button>

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "center",
                      gap: 20,
                      marginTop: 11,
                      flexWrap: "wrap",
                    }}
                  >
                    <LinkBtn onClick={() => doLog("skip")}>{t("today.skip")}</LinkBtn>
                    {selected.snoozeMin > 0 && (
                      <LinkBtn onClick={() => snooze(selected.id, selected.snoozeMin)}>
                        {t("today.snooze", { n: selected.snoozeMin })}
                      </LinkBtn>
                    )}
                    <LinkBtn onClick={() => preview(selected.type)}>{t("today.preview")}</LinkBtn>
                  </div>
                </>
              ) : (
                <div style={{ color: "var(--text-mute)", fontSize: 13 }}>{t("today.empty")}</div>
              )}
            </Card>

            {/* 今日记录 */}
            <Card style={{ padding: "16px 18px", display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)", letterSpacing: "0.04em" }}>
                  {t("today.records").toUpperCase()}
                </span>
                <span className="num" style={{ fontSize: 11, color: "var(--text-mute)" }}>
                  {records.length}
                </span>
              </div>

              {records.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-mute)", padding: "14px 0" }}>
                  {t("today.recordsEmpty")}
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, overflow: "hidden" }}>
                  {shownRecords.map((r) => (
                    <RecordLine key={r.id} row={r} onDelete={() => deleteRecord(r.id)} />
                  ))}
                </div>
              )}

              {records.length > 6 && (
                <button
                  onClick={() => setShowAllRecords((v) => !v)}
                  style={{ marginTop: 8, fontSize: 11.5, color: "var(--accent)", alignSelf: "flex-start" }}
                >
                  {showAllRecords ? t("today.collapse") : t("today.expand", { n: records.length })}
                </button>
              )}

              <div style={{ flex: 1 }} />
              <div style={{ height: 1, background: "var(--border)", margin: "10px 0 8px" }} />
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5 }}>
                <span style={{ color: "var(--text-mute)" }}>{t("today.skipRate")}</span>
                <span className="num" style={{ color: "var(--text-dim)" }}>
                  {totals.skipRate}%
                </span>
              </div>
              {water && water.goal > 0 ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ height: 4, borderRadius: 4, background: "var(--border)" }}>
                    <div
                      style={{
                        width: `${Math.min(100, (water.value / water.goal) * 100)}%`,
                        height: "100%",
                        borderRadius: 4,
                        background: "var(--water)",
                        transition: "width 400ms cubic-bezier(.2,.8,.2,1)",
                      }}
                    />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 5 }}>
                    {Math.round(water.value)} / {Math.round(water.goal)} ml
                  </div>
                </div>
              ) : null}

              {snapshot?.paused && !session ? (
                <div
                  style={{
                    marginTop: 10,
                    padding: "8px 10px",
                    borderRadius: 9,
                    background: "var(--surface-2)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 11.5, color: "var(--text-dim)" }}>{t("today.pausedTitle")}</span>
                  <button onClick={() => setPaused(false)} style={{ fontSize: 11.5, color: "var(--accent)" }}>
                    {t("today.resume")}
                  </button>
                </div>
              ) : null}
            </Card>
          </div>

          {/* 全部任务 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "16px 0 9px" }}>
            <span style={{ fontSize: 11, color: "var(--text-mute)", letterSpacing: "0.05em" }}>
              {t("today.allTasks").toUpperCase()}
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span style={{ fontSize: 10.5, color: "var(--text-mute)" }}>{t("task.clickHint")}</span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
              gap: 9,
            }}
          >
            {tasks.map((x) => (
              <TaskCard
                key={x.id}
                task={x}
                selected={x.id === selected?.id}
                onClick={() => setSelectedId(x.id)}
                onOpen={() => onOpenTask(x.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function RecordLine({ row, onDelete }: { row: RecordRow; onDelete: () => void }) {
  const { t } = useT();
  const color = taskColor(row.taskType);
  const name = row.taskName?.startsWith("task.") ? t(row.taskName as MsgKey) : row.taskName || t(`task.${row.taskType}` as MsgKey);
  const actionKey = `record.${row.action}` as MsgKey;
  const detail =
    row.action === "complete"
      ? row.taskType === "water"
        ? `${Math.round(row.value)} ml`
        : row.taskType === "break"
          ? t("unit.min", { n: Math.round(row.value / 60) })
          : ""
      : t(actionKey);
  const ok = row.action === "complete";

  return (
    <div
      className="rec-row"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "5px 4px",
        borderRadius: 7,
      }}
    >
      <span className="num" style={{ fontSize: 11, color: "var(--text-mute)", flex: "none", width: 34 }}>
        {row.ts}
      </span>
      <span style={{ color, display: "flex", flex: "none" }}>
        <TaskIcon name={row.taskType} size={13} />
      </span>
      <span
        style={{
          fontSize: 12,
          color: "var(--text-dim)",
          flex: 1,
          minWidth: 0,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {name}
      </span>
      <span
        className="num"
        style={{ fontSize: 11, color: ok ? "var(--text-dim)" : "var(--text-mute)", flex: "none" }}
      >
        {ok ? detail || "✓" : detail}
      </span>
      <button
        className="rec-del"
        title={t("record.delete")}
        onClick={onDelete}
        style={{ fontSize: 11, color: "var(--text-mute)", flex: "none", opacity: 0 }}
      >
        ✕
      </button>
    </div>
  );
}

function LinkBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ fontSize: 11.5, color: "var(--text-mute)", transition: "140ms" }}
      onMouseEnter={(e) => {
        e.currentTarget.style.color = "var(--text)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = "var(--text-mute)";
      }}
    >
      {children}
    </button>
  );
}
