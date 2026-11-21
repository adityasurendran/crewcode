"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "../providers";
import { get, put, post } from "../lib/api";
import { Skeleton } from "../components/ui";

const ROLES = ["developer", "frontend", "backend", "designer", "tester", "product", "lead"];
const LEVELS = ["beginner", "intermediate", "advanced"];

export default function CrewPage() {
  const { activeProject, ready, toast } = useApp();
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeProject) return;
    try {
      setMembers((await get<any[]>(`/crew?project_id=${activeProject}`)) ?? []);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    load();
  }, [load]);

  async function removeData(m: any) {
    if (!window.confirm(`Remove ${m.owner_id}'s chat data from this project?`)) return;
    try {
      await post("/crew/leave", { project_id: activeProject, owner_id: m.owner_id });
      toast("Removed", "success");
      load();
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function save(m: any, role: string, experience: string) {
    try {
      await put("/crew", { project_id: activeProject, owner_id: m.owner_id, role, experience });
      setMembers((prev) => prev.map((x) => (x.owner_id === m.owner_id ? { ...x, role, experience } : x)));
      toast("Saved", "success");
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  if (!ready || loading) return <Skeleton h={300} r={12} />;
  if (!activeProject) {
    return (
      <div className="crew-empty">
        <h1>No project selected</h1>
        <p>Pick a project at the top, or start a new one.</p>
      </div>
    );
  }

  const totalMerged = members.reduce((n, m) => n + (m.merged ?? 0), 0);
  const totalMessages = members.reduce((n, m) => n + (m.messages ?? 0), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Crew</h1>
          <div className="page-sub">The people building this project. Each teammate gets their own helper.</div>
        </div>
        <Link className="btn btn-sm btn-primary" href="/share">
          Invite a friend
        </Link>
      </div>

      {members.length === 0 ? (
        <div className="crew-empty">
          <div className="crew-empty-mark" aria-hidden>C</div>
          <h2>Your crew starts with you</h2>
          <p>Send a message in Chat to bring in your helper, or invite a friend from Share.</p>
          <div className="row" style={{ gap: 8, justifyContent: "center" }}>
            <Link className="btn btn-sm btn-primary" href="/">
              Open Chat
            </Link>
            <Link className="btn btn-sm" href="/share">
              Share the project
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="crew-summary">
            <span>
              {members.length} {members.length === 1 ? "teammate" : "teammates"}
            </span>
            <span className="crew-summary-rule" aria-hidden />
            <span>
              {totalMerged} approved {totalMerged === 1 ? "change" : "changes"}, {totalMessages}{" "}
              {totalMessages === 1 ? "message" : "messages"}
            </span>
          </div>

          <div className="crew-list">
            {members.map((m) => {
              const role = m.role || "developer";
              const level = m.experience || "beginner";
              const initial = (m.owner_id || "?").replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "?";
              return (
                <article className="crew-pass" key={m.owner_id}>
                  <div className="crew-pass-main">
                    <div className={`crew-avatar role-${role}`} aria-hidden>{initial}</div>
                    <div className="crew-who">
                      <h2 className="crew-name">{m.owner_id}</h2>
                      <div className="crew-controls">
                        <label className="crew-field">
                          Role
                          <select
                            className="select"
                            value={role}
                            onChange={(e) => save(m, e.target.value, level)}
                            aria-label={`Role for ${m.owner_id}`}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </label>
                        <label className="crew-field">
                          Experience
                          <select
                            className="select"
                            value={level}
                            onChange={(e) => save(m, role, e.target.value)}
                            aria-label={`Experience for ${m.owner_id}`}
                          >
                            {LEVELS.map((l) => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="crew-stub">
                    <div className="crew-stats">
                      <div>
                        <strong>{m.merged ?? 0}</strong>
                        <span>approved</span>
                      </div>
                      <div>
                        <strong>{m.messages ?? 0}</strong>
                        <span>messages</span>
                      </div>
                      <div>
                        <strong>{m.tasks ?? 0}</strong>
                        <span>tasks</span>
                      </div>
                    </div>
                    <Link className="btn btn-sm" href={`/passport?owner=${encodeURIComponent(m.owner_id)}`}>
                      Open passport
                    </Link>
                    <button className="crew-remove" onClick={() => removeData(m)}>
                      Remove data
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
