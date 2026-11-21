"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../providers";
import { get, API } from "../lib/api";
import { Empty, Skeleton, timeAgo } from "../components/ui";
import { WmTabs } from "../components/wm/WmTabs";
import { WmActivityList } from "../components/wm/WmActivityList";
import { Activity } from "lucide-react";

function eventTone(type: string) {
  if (type === "error") return "var(--danger)";
  if (type === "merged") return "var(--success)";
  if (type === "preview") return "var(--accent)";
  if (type === "sync" || type === "intent") return "var(--info)";
  if (type === "semantic_patch") return "var(--warning)";
  return "var(--text-3)";
}

export default function ActivityPage() {
  const { activeProject, ready } = useApp();
  const [events, setEvents] = useState<any[]>([]);
  const [filter, setFilter] = useState("");
  const [live, setLive] = useState(true);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeProject) return;
    try {
      const e = await get<any[]>(`/events?project_id=${activeProject}&limit=120`);
      setEvents(e);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!activeProject || !live) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${API}/events/stream?project_id=${activeProject}`);
      es.onmessage = (m) => {
        try {
          const ev = JSON.parse(m.data);
          setEvents((prev) => (prev.some((p) => p.id === ev.id) ? prev : [ev, ...prev].slice(0, 120)));
        } catch {}
      };
    } catch {}
    return () => es?.close();
  }, [activeProject, live]);

  const types = Array.from(new Set(events.map((e) => e.type)));
  const shown = filter ? events.filter((e) => e.type === filter) : events;

  if (!ready) return <Skeleton h={300} r={12} />;
  if (!activeProject) return <Empty title="No project selected" hint="Create a project first." />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Activity</h1>
          <div className="page-sub">Structured events, not raw chat logs. Every agent action is recorded.</div>
        </div>
        <button className="pill" onClick={() => setLive((v) => !v)} style={{ cursor: "pointer", color: live ? "var(--success)" : "var(--text-3)" }}>
          <span className="dot" />
          {live ? "Live" : "Paused"}
        </button>
      </div>

      <div style={{ marginBottom: 14 }}>
        <WmTabs
          id="activity"
          tabs={[{ id: "", label: "All" }, ...types.map((t) => ({ id: t, label: t }))]}
          value={filter}
          onChange={setFilter}
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="card-body">
            <Skeleton h={40} />
          </div>
        ) : shown.length === 0 ? (
          <Empty title="No events yet" hint="Dispatch a task and watch agents report in." />
        ) : (
          <div className="card-body">
            <WmActivityList
              icon={<Activity size={20} />}
              title={`${shown.length} events`}
              subtitle={live ? "Live · newest first" : "Paused"}
              items={shown.slice(0, 30).map((e, i) => ({
                icon: <span className="dot" style={{ background: eventTone(e.type), width: 8, height: 8 }} />,
                title: e.type,
                desc:
                  typeof e.payload?.message === "string"
                    ? e.payload.message
                    : e.payload?.objective ?? JSON.stringify(e.payload).slice(0, 160),
                time: timeAgo(e.created_at),
              }))}
            />
          </div>
        )}
      </div>
    </>
  );
}
