"use client";
import { useEffect, useState } from "react";
import { useApp } from "../providers";
import { get, IS_DEMO } from "../lib/api";
import { Empty, Skeleton } from "../components/ui";

export default function PassportPage() {
  const { activeProject, owner, ready, toast } = useApp();
  const [who, setWho] = useState("");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search).get("owner");
      setWho(q || owner);
    } catch {
      setWho(owner);
    }
  }, [owner]);

  useEffect(() => {
    if (!activeProject || !who) return;
    setLoading(true);
    get<any>(`/passport?project_id=${activeProject}&owner_id=${encodeURIComponent(who)}`)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [activeProject, who]);

  if (!ready || loading) return <Skeleton h={300} r={12} />;
  if (!activeProject) return <Empty title="No project selected" />;
  if (!data) return <Empty title="No passport yet" hint="Chat with your helper first." />;

  const maxEv = Math.max(1, ...data.skills.map((s: any) => s.evidence));
  const badges: string[] = [];
  if (data.stats.merged >= 1) badges.push("First merge");
  if (data.stats.merged >= 5) badges.push("5 merges");
  if (data.stats.messages >= 5) badges.push("Collaborator");
  if (data.skills.length >= 4) badges.push("Multi-skill");
  const initial = (who || "?").replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "?";
  const stampLabel: Record<string, string> = { merged: "merged", blocked: "stopped", testing: "checking", running: "working" };

  function share() {
    try {
      navigator.clipboard?.writeText(`${window.location.origin}/passport?owner=${encodeURIComponent(who)}`);
      toast("Passport link copied", "success");
    } catch {
      toast("Could not copy the link", "error");
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Creator Passport</h1>
          <div className="page-sub">A record of what you actually shipped in this project.</div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          {!IS_DEMO && (
            <a
              className="btn btn-sm"
              href={`/api/passport/export?project_id=${activeProject}&owner_id=${encodeURIComponent(who)}`}
              target="_blank"
              rel="noreferrer"
            >
              Export
            </a>
          )}
          <button className="btn btn-sm" onClick={share}>
            Share
          </button>
        </div>
      </div>

      <section className="passport" aria-label={`Creator passport for ${who}`}>
        <div className="passport-cover">
          <div className="passport-cover-text">
            <div className="passport-series">CrewCode · project work</div>
            <div className="passport-name">{who}</div>
            <div className="passport-role">
              <span style={{ textTransform: "capitalize" }}>{data.profile.role}</span>
              <span className="passport-sep">/</span>
              <span>{data.profile.experience}</span>
            </div>
          </div>
          <div className="passport-stamp" aria-hidden>
            <span className="passport-stamp-line">crew</span>
            <span className="passport-stamp-mark">verified</span>
            <span className="passport-stamp-line">this project</span>
          </div>
        </div>

        <div className="passport-identity">
          <div className="passport-photo" aria-hidden>{initial}</div>
          <dl className="passport-facts">
            <div>
              <dt>Approved changes</dt>
              <dd>{data.stats.merged}<span className="passport-of">/{data.stats.tasks}</span></dd>
            </div>
            <div>
              <dt>Messages</dt>
              <dd>{data.stats.messages}</dd>
            </div>
            <div>
              <dt>{data.stats.files === 1 ? "File touched" : "Files touched"}</dt>
              <dd>{data.stats.files}</dd>
            </div>
          </dl>
          {badges.length > 0 && (
            <div className="passport-visas" aria-label="Badges earned">
              {badges.map((b, i) => (
                <span key={b} className="passport-visa" style={{ transform: `rotate(${i % 2 === 0 ? -3 : 2}deg)` }}>
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="passport-spread">
          <div className="passport-page">
            <h2 className="passport-page-title">Skills, with evidence</h2>
            <div className="ledger">
              {data.skills.length === 0 && <div className="passport-quiet">No skills marked yet.</div>}
              {data.skills.map((s: any) => (
                <div className="ledger-row" key={s.name}>
                  <span>{s.name}</span>
                  <span className="ledger-evidence">
                    <span className="evidence-bar" aria-hidden>
                      <i style={{ width: `${Math.round((s.evidence / maxEv) * 100)}%` }} />
                    </span>
                    <span className="ledger-count">{s.evidence}</span>
                  </span>
                </div>
              ))}
            </div>
            <p className="passport-note">{data.disclaimer}</p>
          </div>

          <div className="passport-page">
            <h2 className="passport-page-title">Entries</h2>
            {data.contributions.length === 0 ? (
              <div className="passport-quiet">No entries yet. Your first approved change gets stamped here.</div>
            ) : (
              <div className="entries">
                {data.contributions.map((c: any) => (
                  <article className="entry" key={c.task_id}>
                    <span className={`entry-stamp entry-${c.status}`}>{stampLabel[c.status] ?? c.status}</span>
                    <div>
                      <div className="entry-title">{c.title}</div>
                      <div className="entry-meta">
                        {c.mode}
                        {c.files.length ? ` · ${c.files.length} ${c.files.length === 1 ? "file" : "files"}` : ""}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
