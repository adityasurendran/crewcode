"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "../providers";
import { get, post } from "../lib/api";
import { Button, Card, Empty, Skeleton, Chip } from "../components/ui";

export default function Integrations() {
  const { activeProject, ready, toast } = useApp();
  const [conns, setConns] = useState<any[]>([]);
  const [form, setForm] = useState({ provider: "supabase", api_key: "" });
  const [gh, setGh] = useState("");
  const [dbUrl, setDbUrl] = useState("");
  const [dbResult, setDbResult] = useState("");
  const [importing, setImporting] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeProject) return;
    try {
      setConns(await get<any[]>(`/connections?project_id=${activeProject}`).catch(() => []));
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    load();
  }, [load]);

  async function addConn() {
    if (!form.api_key.trim()) return toast("Paste the key first", "error");
    try {
      await post("/connections", { project_id: activeProject, provider: form.provider, api_key: form.api_key.trim() });
      setForm({ ...form, api_key: "" });
      toast("Saved. The key itself is never shown again.", "success");
      load();
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function importDb() {
    if (!dbUrl.trim() || !activeProject) return;
    setImporting(true);
    setDbResult("");
    try {
      const r = await post<any>("/connections/import-db", { project_id: activeProject, database_url: dbUrl.trim() });
      setDbUrl("");
      setDbResult(`${r.tables} tables, ${r.columns} columns from ${r.host}/${r.database}`);
      toast("Database imported — helpers now see its tables", "success");
      load();
    } catch (e: any) {
      toast(e?.message ?? "Import failed", "error");
    } finally {
      setImporting(false);
    }
  }

  async function importGithub() {
    if (!gh.trim()) return;
    try {
      const name = gh.trim().split("/").pop()?.replace(".git", "") || "imported";
      await post("/projects", { name, repo_url: gh.trim() });
      toast("Repo added as a project", "success");
      setGh("");
    } catch (e: any) {
      toast(e?.message ?? "Import failed", "error");
    }
  }

  if (!ready) return <Skeleton h={300} r={12} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Connected services</h1>
          <div className="page-sub">Keys are stored once on this computer. Helpers use them without ever seeing them.</div>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <Card title="Add a service">
          <p className="small muted" style={{ marginTop: 0 }}>
            Paste the key once. Helpers for every teammate can then use the service, and the key itself is never displayed or shared.
          </p>
          <div className="grid" style={{ gap: 10, marginTop: 12 }}>
            <div className="field">
              <label className="field-label">Service</label>
              <select className="select" value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}>
                <option value="supabase">Supabase (database)</option>
                <option value="stripe">Stripe (payments)</option>
                <option value="github">GitHub (repos & PRs)</option>
                <option value="resend">Resend (email)</option>
              </select>
            </div>
            <div className="field">
              <label className="field-label">Key</label>
              <input
                className="input mono"
                type="password"
                placeholder="Paste the key here"
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              />
            </div>
            <div>
              <Button variant="primary" onClick={addConn} disabled={!activeProject}>
                Save key
              </Button>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            {loading ? (
              <Skeleton h={40} />
            ) : conns.length === 0 ? (
              <Empty title="No services connected" hint="Add Stripe to take payments, for example." />
            ) : (
              <div className="grid" style={{ gap: 6 }}>
                {conns.map((c) => (
                  <div key={c.id} className="row" style={{ gap: 10, padding: 10, border: "1px solid var(--border)", borderRadius: 10 }}>
                    <span className="strong" style={{ textTransform: "capitalize" }}>
                      {c.provider}
                    </span>
                    <span className="spacer" />
                    <Chip>key stored</Chip>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card title="Bring existing code">
          <p className="small muted" style={{ marginTop: 0 }}>
            Already have code on GitHub? Add the link and it becomes a project the whole crew can build on.
          </p>
          <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
            <input
              className="input"
              style={{ flex: 1, minWidth: 220 }}
              placeholder="github.com/yourname/yourproject"
              value={gh}
              onChange={(e) => setGh(e.target.value)}
            />
            <Button onClick={importGithub}>Add project</Button>
          </div>
          <p className="small" style={{ marginTop: 14 }}>
            Want friends to join this computer? <Link className="link" href="/share">Open sharing</Link>
          </p>
        </Card>

        <Card title="Bring existing database">
          <p className="small muted" style={{ marginTop: 0 }}>
            Already have a Postgres database (or Supabase)? Paste its address. Helpers will see its tables when they build — the password itself is locked away and never shown.
          </p>
          <div className="row wrap" style={{ gap: 8, marginTop: 12 }}>
            <input
              className="input mono"
              type="password"
              style={{ flex: 1, minWidth: 220 }}
              placeholder="postgres://user:pass@host:5432/dbname"
              value={dbUrl}
              onChange={(e) => setDbUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && importDb()}
            />
            <Button variant="primary" loading={importing} onClick={importDb} disabled={!activeProject || !dbUrl.trim()}>
              Import
            </Button>
          </div>
          {dbResult && (
            <p className="small" style={{ marginTop: 10 }}>
              <span className="dot" style={{ background: "var(--success)", width: 8, height: 8 }} /> {dbResult}
            </p>
          )}
        </Card>
      </div>
    </>
  );
}
