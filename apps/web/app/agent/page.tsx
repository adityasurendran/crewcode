"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../providers";
import { get, post } from "../lib/api";
import { Button, StatusBadge, Avatar, Empty, Skeleton, timeAgo } from "../components/ui";
import { WmAskBar } from "../components/wm/WmAskBar";

export default function Agent() {
  const { activeProject, ready, owner, toast, guest } = useApp();
  const [tasks, setTasks] = useState<any[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [detail, setDetail] = useState<any>(null);
  const [convo, setConvo] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadTasks = useCallback(async () => {
    if (!activeProject) return;
    try {
      const list = await get<any[]>(`/tasks?project_id=${activeProject}`);
      setTasks(list);
      if (!selected) {
        const q = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("task") : null;
        const pick = (q && list.find((t) => t.id === q)?.id) || list[0]?.id;
        if (pick) setSelected(pick);
      }
    } catch {}
  }, [activeProject, selected]);

  const loadConversation = useCallback(async () => {
    if (!selected) return;
    try {
      const [d, c] = await Promise.all([
        get(`/tasks/${selected}/detail`).catch(() => null),
        get<any[]>(`/agent/conversation/${selected}`).catch(() => []),
      ]);
      setDetail(d);
      setConvo(c);
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" }));
    } catch {}
  }, [selected]);

  useEffect(() => {
    loadTasks();
    const t = setInterval(loadTasks, 6000);
    return () => clearInterval(t);
  }, [loadTasks]);

  useEffect(() => {
    loadConversation();
    const t = setInterval(loadConversation, 3500);
    return () => clearInterval(t);
  }, [loadConversation]);

  async function send() {
    if (!msg.trim() || !selected) return;
    setSending(true);
    try {
      await post("/agent/chat", { task_id: selected, message: msg.trim(), actor: owner });
      setMsg("");
      toast("Sent to agent", "success");
      loadConversation();
    } catch (e: any) {
      toast(e?.message ?? "Failed to send", "error");
    } finally {
      setSending(false);
    }
  }

  if (!ready) return <Skeleton h={320} r={12} />;
  if (!activeProject) return <Empty title="No project selected" hint="Create a project first." />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>My Agent</h1>
          <div className="page-sub">Describe what you want in plain English. The agent handles the engineering.</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "290px 1fr", gap: 16, alignItems: "start" }}>
        <div className="card">
          <div className="card-head">
            <div className="card-title">Tasks</div>
            <span className="chip">{tasks.length}</span>
          </div>
          <div className="scroll" style={{ maxHeight: 520 }}>
            {tasks.length === 0 && <Empty title="No tasks" hint="Create one from Overview." />}
            {tasks.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "11px 14px",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  background: selected === t.id ? "var(--accent-soft)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <div className="row" style={{ gap: 7, marginBottom: 4 }}>
                  <Avatar name={t.owner_id} size={18} />
                  <span className="tiny dim">{t.owner_id}</span>
                  <span className="spacer" />
                  <StatusBadge status={t.status} />
                </div>
                <div className="small strong" style={{ lineHeight: 1.35 }}>
                  {t.objective}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          {detail?.task ? (
            <>
              <div className="card-head">
                <div className="card-title" style={{ minWidth: 0 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{detail.task.objective}</span>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <StatusBadge status={detail.task.status} />
                </div>
              </div>
              <div ref={scrollRef} className="chat scroll" style={{ height: 380 }}>
                {convo.length === 0 && <div className="empty" style={{ margin: "auto" }}>Start the conversation. Ask for a change.</div>}
                {convo.map((e: any, i: number) => {
                  const isUser = e.type === "user_message";
                  return (
                    <div key={i} className={`msg ${isUser ? "msg-user" : "msg-agent"}`}>
                      {!isUser && (
                        <div className="tiny dim" style={{ marginBottom: 3 }}>
                          {e.type}
                        </div>
                      )}
                      {isUser ? (
                        <div>{e.payload?.message ?? ""}</div>
                      ) : typeof e.payload?.message === "string" ? (
                        e.payload.message
                      ) : typeof e.payload?.objective === "string" ? (
                        e.payload.objective
                      ) : (
                        JSON.stringify(e.payload).slice(0, 180)
                      )}
                      <div className="tiny" style={{ opacity: 0.6, marginTop: 3 }}>
                        {timeAgo(e.created_at)}
                      </div>
                    </div>
                  );
                })}
              </div>
              {!guest && (
                <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
                  <WmAskBar
                    value={msg}
                    onChange={setMsg}
                    onSubmit={send}
                    placeholder="Message your agent. For example: make the button blue."
                    loading={sending}
                  />
                </div>
              )}
            </>
          ) : (
            <Empty title="Pick a task" hint="Select a task on the left to open its agent." />
          )}
        </div>
      </div>
    </>
  );
}
