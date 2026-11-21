"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../providers";
import { get, post, patch } from "../lib/api";
import { Button, StatusBadge, Avatar, Empty, Skeleton, Modal, statusStyle } from "../components/ui";

const COLUMNS = ["queued", "running", "testing", "merged", "blocked"];

export default function Board() {
  const { activeProject, ready, owner, toast } = useApp();
  const router = useRouter();
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [diff, setDiff] = useState<any>(null);
  const [depStatus, setDepStatus] = useState<any>(null);
  const [confirm, setConfirm] = useState<{ task: any } | null>(null);

  const load = useCallback(async () => {
    if (!activeProject) return;
    try {
      const t = await get<any[]>(`/tasks?project_id=${activeProject}`);
      setTasks(t);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function doPreview(id: string) {
    try {
      const r = await post<any>("/previews", { task_id: id });
      toast(r?.url ? `Preview ready: ${r.url}` : "Preview requested", r?.url ? "success" : "info");
    } catch (e: any) {
      toast(e?.message ?? "Preview failed", "error");
    }
  }

  async function showDiff(id: string) {
    try {
      setDiff(await get(`/rollback/diff?task_id=${id}`));
    } catch (e: any) {
      toast(e?.message ?? "No diff available", "error");
    }
  }

  async function showStatus(id: string) {
    try {
      const arts = await get<any[]>(`/artifacts?task_id=${id}&kind=preview&limit=1`);
      if (!arts[0]?.id) return toast("No preview deployed yet", "info");
      setDepStatus(await get(`/deployments/${arts[0].id}/status`));
    } catch (e: any) {
      toast(e?.message ?? "Status unavailable", "error");
    }
  }

  async function setPriority(id: string, p: number) {
    try {
      await patch(`/tasks/${id}/priority`, { priority: p });
      load();
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function doRollback(id: string) {
    try {
      await post("/rollback", { project_id: activeProject, task_id: id, approved_by: owner });
      toast("Rollback complete", "success");
      load();
    } catch (e: any) {
      toast(e?.message ?? "Rollback failed", "error");
    }
  }

  if (!ready) return <Skeleton h={300} r={12} />;
  if (!activeProject)
    return <Empty title="No project selected" hint="Create a project on the Overview page first." />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Board</h1>
          <div className="page-sub">Git stays hidden: every branch shows up here as a task.</div>
        </div>
        <Button onClick={load}>
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="kanban">
          {COLUMNS.map((c) => (
            <div className="col" key={c}>
              <div className="col-head">
                <Skeleton w={70} h={12} />
              </div>
              <Skeleton h={64} r={10} />
            </div>
          ))}
        </div>
      ) : (
        <div className="kanban">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col);
            const s = statusStyle(col);
            return (
              <div className="col" key={col}>
                <div className="col-head">
                  <span className="row" style={{ gap: 7, color: s.color }}>
                    <span className="dot" />
                    {s.label}
                  </span>
                  <span className="col-count">{items.length}</span>
                </div>
                {items.length === 0 && <div className="tiny dim" style={{ padding: "8px 4px" }}>Empty</div>}
                {items.map((t) => (
                  <div className="task-card" key={t.id}>
                    <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
                      <span className="chip">P{t.priority ?? 3}</span>
                      <span className="tiny dim mono">{t.branch?.slice(-14)}</span>
                    </div>
                    <div className="task-obj">{t.objective}</div>
                    <div className="task-meta">
                      <Avatar name={t.owner_id} size={20} />
                      <span>{t.owner_id}</span>
                    </div>
                    <div className="divider" style={{ margin: "10px 0" }} />
                    <div className="row" style={{ gap: 5, flexWrap: "wrap" }}>
                      <button className="btn btn-sm btn-ghost" onClick={() => doPreview(t.id)}>
                        Preview
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => router.push(`/agent?task=${t.id}`)}>
                        Chat
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => showDiff(t.id)}>
                        Diff
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => showStatus(t.id)}>
                        Status
                      </button>
                      <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }} onClick={() => setConfirm({ task: t })}>
                        Revert
                      </button>
                      <select
                        className="select"
                        value={t.priority ?? 3}
                        onChange={(e) => setPriority(t.id, Number(e.target.value))}
                        style={{ width: 54, padding: "3px 6px", fontSize: 11, marginLeft: "auto" }}
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            P{n}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {diff && (
        <Modal title="Rollback diff" onClose={() => setDiff(null)}>
          <div className="small dim" style={{ marginBottom: 8 }}>
            Commit <code>{diff.commit?.slice(0, 8)}</code>
          </div>
          <pre className="scroll mono" style={{ fontSize: 12, background: "var(--surface-2)", padding: 12, borderRadius: 8, maxHeight: 300, whiteSpace: "pre-wrap" }}>
            {diff.stat}
          </pre>
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <Button onClick={() => setDiff(null)}>Close</Button>
          </div>
        </Modal>
      )}

      {depStatus && (
        <Modal title="Deployment status" onClose={() => setDepStatus(null)}>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <span className="chip">{depStatus.provider}</span>
            <StatusBadge status={depStatus.status === "success" || depStatus.status === "live" ? "merged" : "testing"} />
            <span className="strong">{depStatus.status ?? depStatus.error}</span>
          </div>
          {depStatus.url && (
            <a className="link small" href={depStatus.url} target="_blank" rel="noreferrer">
              {depStatus.url}
            </a>
          )}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 14 }}>
            <Button onClick={() => setDepStatus(null)}>Close</Button>
          </div>
        </Modal>
      )}

      {confirm && (
        <Modal title="Confirm rollback" onClose={() => setConfirm(null)}>
          <p className="muted">
            Revert the merge for <strong>{confirm.task.objective}</strong>? This changes <code>main</code> and redeploys the preview.
          </p>
          <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                const id = confirm.task.id;
                setConfirm(null);
                doRollback(id);
              }}
            >
              Roll back
            </Button>
          </div>
        </Modal>
      )}
    </>
  );
}
