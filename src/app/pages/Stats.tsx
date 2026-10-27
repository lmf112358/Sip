import { useEffect, useMemo, useState } from "react";
import { useT } from "@/i18n";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import type { StatsPayload, TaskType } from "@/lib/types";
import { Bars, HourBars, MiniBar, Ring } from "@/components/charts";
import { Button, Card, Segmented } from "@/components/ui";
import { fmtDayShort, fmtClock } from "@/lib/format";
import { taskColor } from "@/lib/tokens";
import { taskLabel } from "@/lib/labels";

type Metric = "ml" | "times";

export function StatsPage() {
  const { t, lang } = useT();
  const { snapshot } = useStore();
  const [days, setDays] = useState(7);
  const [metric, setMetric] = useState<Metric>("times");
  const [data, setData] = useState<StatsPayload | null>(null);

  useEffect(() => {
    api.stats(days).then(setData).catch(() => undefined);
  }, [days, snapshot?.today]);

  const items = useMemo(() => {
    if (!data) return [];
    return data.days.map((d) => {
      const values = Object.entries(d.byType) as [TaskType, { value: number; times: number }][];
      const v =
        metric === "ml"
          ? (d.byType.water?.value ?? 0)
          : values.reduce((a, [, x]) => a + (x?.times ?? 0), 0);
      return { label: fmtDayShort(lang, d.day), value: v };
    });
  }, [data, metric, lang]);

  const total = items.reduce((a, b) => a + b.value, 0);
  const empty = total === 0;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 21, fontWeight: 500 }}>{t("stats.title")}</div>
        <Button
          variant="ghost"
          onClick={async () => {
            const path = await api.exportCsv();
            alert(t("stats.exported", { path }));
          }}
        >
          {t("stats.export")}
        </Button>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <Segmented
          value={days}
          onChange={(v) => setDays(v)}
          options={[
            { value: 7, label: t("stats.week") },
            { value: 30, label: t("stats.month") },
          ]}
        />
        <Segmented
          value={metric}
          onChange={(v) => setMetric(v)}
          options={[
            { value: "times", label: t("stats.weekTotal") },
            { value: "ml", label: "ml" },
          ]}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 12 }}>
        <Metric label={t("stats.streak")} value={`${data?.streak ?? 0}`} unit={t("stats.days")} />
        <Metric label={t("stats.weekTotal")} value={`${data?.weekTotal ?? 0}`} unit={t("unit.times", { n: "" }).trim()} />
        <Metric label={t("stats.skipRate")} value={`${Math.round(data?.skipRate ?? 0)}`} unit="%" />
        <Metric
          label={t("stats.meeting")}
          value={`${Math.round((data?.meetingMinutes ?? 0) / 60)}`}
          unit="h"
        />
      </div>

      <Card style={{ padding: "18px 20px", marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <span style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
            {metric === "ml" ? "ml" : t("stats.weekTotal")}
          </span>
          <span className="num" style={{ fontSize: 12.5 }}>
            {Math.round(total).toLocaleString()}
          </span>
        </div>
        {empty ? (
          <div style={{ height: 148, display: "grid", placeItems: "center", fontSize: 12.5, color: "var(--text-mute)" }}>
            {t("stats.noData")}
          </div>
        ) : (
          <Bars items={items} color={metric === "ml" ? "var(--water)" : "var(--accent)"} every={days > 14 ? 5 : 1} />
        )}
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Card style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>
            {t("stats.hourly")}
          </div>
          <HourBars data={data?.hourly ?? new Array(24).fill(0)} />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: 10.5,
              color: "var(--text-mute)",
              marginTop: 6,
            }}
          >
            <span>0</span>
            <span>6</span>
            <span>12</span>
            <span>18</span>
            <span>24</span>
          </div>
        </Card>

        <Card style={{ padding: "18px 20px" }}>
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 12 }}>
            {t("stats.today")}
          </div>
          {(snapshot?.tasks ?? []).map((task) => (
            <div
              key={task.id}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "7px 0" }}
            >
              <Ring ratio={task.goalRatio} size={30} stroke={3.5} color={taskColor(task.type)} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--text)",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {taskLabel(task, t)}
                </div>
                <div className="num" style={{ fontSize: 11, color: "var(--text-mute)", marginTop: 2 }}>
                  {task.type === "water"
                    ? `${Math.round(task.doneToday)} / ${Math.round(task.goal)} ml`
                    : `${task.countToday} / ${Math.round(task.goal || 0)}`}
                </div>
              </div>
              <span className="num" style={{ fontSize: 11, color: "var(--text-mute)" }}>
                {fmtClock(task.remainingSec)}
              </span>
            </div>
          ))}
          {!snapshot?.tasks?.length && (
            <div style={{ fontSize: 12.5, color: "var(--text-mute)" }}>{t("stats.noData")}</div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "13px 15px",
      }}
    >
      <div style={{ fontSize: 11.5, color: "var(--text-mute)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
        <span className="num" style={{ fontSize: 24, fontWeight: 500, letterSpacing: "-0.02em" }}>
          {value}
        </span>
        <span style={{ fontSize: 11, color: "var(--text-mute)" }}>{unit}</span>
      </div>
    </div>
  );
}
