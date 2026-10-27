import { useState } from "react";
import { useT } from "@/i18n";
import { useStore } from "@/lib/store";
import { api } from "@/lib/api";
import type { Task } from "@/lib/types";
import { TaskRow } from "@/components/TaskCard";
import { TaskForm, blankTask } from "@/components/TaskForm";
import { Button, Card, Modal } from "@/components/ui";

export function TasksPage({ onOpenTask }: { onOpenTask: (id: string) => void }) {
  const { snapshot, setSnapshot } = useStore();
  const { t } = useT();
  const [creating, setCreating] = useState(false);

  const tasks = snapshot?.tasks ?? [];

  const move = async (id: string, dir: -1 | 1) => {
    const ids = tasks.map((x) => x.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await api.reorderTasks(ids);
    const s = await api.snapshot();
    setSnapshot(s);
  };

  return (
    <div style={{ maxWidth: 900, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 21, fontWeight: 500 }}>{t("nav.tasks")}</div>
          <div style={{ fontSize: 11.5, color: "var(--text-mute)", marginTop: 3 }}>
            {t("task.clickHint")}
          </div>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + {t("task.new")}
        </Button>
      </div>

      {tasks.length === 0 ? (
        <Card style={{ padding: 40, textAlign: "center", color: "var(--text-mute)", fontSize: 13 }}>
          {t("task.empty")}
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {tasks.map((task, i) => (
            <TaskRow
              key={task.id}
              task={task}
              index={i}
              total={tasks.length}
              onOpen={() => onOpenTask(task.id)}
              onToggle={async (v) => {
                const s = await api.setTaskEnabled(task.id, v);
                setSnapshot(s);
              }}
              onMove={(d) => move(task.id, d)}
            />
          ))}
        </div>
      )}

      <NewTaskModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(s, id) => {
          setSnapshot(s);
          setCreating(false);
          if (id) onOpenTask(id);
        }}
      />
    </div>
  );
}

function NewTaskModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: (s: import("@/lib/types").Snapshot, id: string) => void;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<Task>(blankTask());
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const close = () => {
    setDraft(blankTask());
    onClose();
  };

  const set = (patch: Partial<Task>) => setDraft({ ...draft, ...patch });

  const save = async () => {
    setSaving(true);
    try {
      const payload: Task = {
        ...draft,
        id: draft.id || newId(),
        name: draft.name?.trim() ?? "",
        intervalMin: Math.max(1, Number(draft.intervalMin) || 1),
      };
      const s = await api.saveTask(payload);
      setDraft(blankTask());
      onSaved(s, payload.id);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title={t("task.new")}
      width={600}
      footer={
        <>
          <Button onClick={close}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <TaskForm draft={draft} set={set} />
    </Modal>
  );
}

function newId() {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return `t-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
