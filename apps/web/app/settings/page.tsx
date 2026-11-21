"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../providers";
import { get, post, patch, put, del, API } from "../lib/api";
import { Button, Card, Empty, Skeleton, Chip, Field } from "../components/ui";
import { WmCopyButton } from "../components/wm/WmCopyButton";
import { WmProgress } from "../components/wm/WmProgress";

export default function SettingsPage() {
  const { activeProject, projects, ready, owner, toast } = useApp();
  const [tools, setTools] = useState<any[]>([]);
  const [busy, setBusy] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [proj, setProj] = useState<any>(null);
  const [keys, setKeys] = useState<any[]>([]);
  const [newKey, setNewKey] = useState("");
  const [createdKey, setCreatedKey] = useState("");
  const [limits, setLimits] = useState<any>(null);
  const [slack, setSlack] = useState("");
  const [clerk, setClerk] = useState<any>(null);
  const [instances, setInstances] = useState<any[]>([]);
  const [provider, setProvider] = useState<any>(null);
  const [pForm, setPForm] = useState({ provider: "", model: "", api_key: "" });
  const [loading, setLoading] = useState(true);
  const [voice, setVoice] = useState<any>(null);
  const [voiceKey, setVoiceKey] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [savingVoice, setSavingVoice] = useState(false);
  const [voices, setVoices] = useState<any[]>([]);
  const [voiceListErr, setVoiceListErr] = useState("");
  const [testingVoice, setTestingVoice] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, l, c, v] = await Promise.all([
        get("/setup/status").catch(() => null),
        get(`/rate-limits${owner ? `?actor=${owner}` : ""}`).catch(() => null),
        get("/auth/clerk/config").catch(() => null),
        get("/voice/status").catch(() => null),
      ]);
      if (t?.tools) setTools(t.tools);
      setLimits(l);
      setClerk(c);
      if (v) setVoice(v);
      if (v?.configured) {
        setVoiceId(v.voice_id ?? "");
        get<any>("/voice/voices")
          .then((r) => {
            setVoices(r?.voices ?? []);
            setVoiceListErr("");
          })
          .catch((e: any) => setVoiceListErr(e?.message ?? "Could not load your voice library"));
      }
      const inst = await get<any>("/agents/instances").catch(() => null);
      if (inst?.instances) setInstances(inst.instances);
      const prov = await get<any>("/provider").catch(() => null);
      if (prov) {
        setProvider(prov);
        setPForm({ provider: prov.provider ?? "", model: prov.model ?? "", api_key: "" });
      }
      if (activeProject) {
        const [p, k] = await Promise.all([
          get(`/projects/${activeProject}/settings`).catch(() => null),
          get<any[]>(`/api-keys?project_id=${activeProject}`).catch(() => []),
        ]);
        setProj(p);
        setKeys(k);
      }
    } finally {
      setLoading(false);
    }
  }, [activeProject, owner]);

  useEffect(() => {
    load();
  }, [load]);

  async function install(tool: string) {
    setBusy(tool);
    try {
      const r = await post<any>("/setup/install", { tool });
      if (r.ok) {
        toast(`${tool} installed`, "success");
        setLog((l) => [...l, `${tool}: ok (${r.version ?? "done"})`]);
      } else {
        toast(r.command ? `Manual: ${r.command}` : (r.error ?? "failed"), r.command ? "info" : "error");
        setLog((l) => [...l, `${tool}: ${r.error ?? r.command ?? "failed"}`]);
      }
      load();
    } finally {
      setBusy("");
    }
  }

  async function installAll() {
    setBusy("all");
    setLog((l) => [...l, "Installing everything missing…"]);
    try {
      const r = await post<any>("/setup/install-all");
      for (const item of r?.results ?? []) setLog((l) => [...l, `${item.id}: ${item.ok ? `ok (${item.version ?? "done"})` : item.error ?? item.command ?? "skipped"}`]);
      if (r?.tools) setTools(r.tools);
      toast("Install pass complete", "success");
    } finally {
      setBusy("");
    }
  }

  async function startDb() {
    try {
      const r = await post<any>("/setup/db-up");
      toast(r?.ok ? "Postgres + Redis starting" : "Docker failed", r?.ok ? "success" : "error");
    } catch (e: any) {
      toast(e?.message ?? "Docker not available", "error");
    }
  }

  async function saveSetting(field: string, value: string) {
    try {
      await patch(`/projects/${activeProject}/settings`, { [field]: value });
      toast("Saved", "success");
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function makeKey() {
    if (!newKey.trim()) return;
    try {
      const r = await post<any>("/api-keys", { project_id: activeProject, created_by: newKey.trim() });
      setCreatedKey(r.key);
      setNewKey("");
      toast("Key created. Copy it now", "success");
      load();
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function saveSlack() {
    const orgId = projects.find((p) => p.id === activeProject)?.org_id;
    if (!orgId) return toast("Project has no org", "error");
    try {
      await post("/notify-settings", { org_id: orgId, slack_webhook_url: slack });
      toast("Saved", "success");
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function loadVoices() {
    try {
      const r = await get<any>("/voice/voices");
      setVoices(r?.voices ?? []);
      setVoiceListErr("");
    } catch (e: any) {
      setVoiceListErr(e?.message ?? "Could not load your voice library");
    }
  }

  async function saveVoice() {
    setSavingVoice(true);
    try {
      const r = await put<any>("/voice/settings", { api_key: voiceKey.trim(), voice_id: voiceId.trim() || undefined });
      setVoice(r);
      setVoiceId(r.voice_id ?? "");
      setVoiceKey("");
      toast("Voice saved", "success");
      loadVoices();
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    } finally {
      setSavingVoice(false);
    }
  }

  async function chooseVoice(id: string) {
    setVoiceId(id);
    try {
      const r = await put<any>("/voice/settings", { voice_id: id });
      setVoice(r);
      toast("Voice updated", "success");
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function removeVoice() {
    if (!window.confirm("Remove the ElevenLabs key from this computer?")) return;
    try {
      await del("/voice/settings");
      setVoice({ configured: false });
      setVoices([]);
      setVoiceKey("");
      setVoiceId("");
      setVoiceListErr("");
      toast("Voice removed", "success");
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function testVoice() {
    setTestingVoice(true);
    try {
      const res = await fetch(`${API}/voice/tts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Hi! Your helper is ready." }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        return toast(body?.error ?? "Voice test failed", "error");
      }
      const url = URL.createObjectURL(await res.blob());
      const audio = new Audio(url);
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play().catch(() => {});
      toast("Playing a sample", "success");
    } catch {
      toast("Voice test failed", "error");
    } finally {
      setTestingVoice(false);
    }
  }

  async function saveSafety(v: boolean) {
    try {
      await patch(`/projects/${activeProject}/settings`, { require_approval: v });
      setProj((p: any) => ({ ...(p ?? {}), require_approval: v }));
      toast(v ? "Changes now need approval" : "Auto-merge enabled", "success");
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function reportConcern() {
    try {
      await post("/safety/report", { project_id: activeProject, reason: "Reported from settings" });
      toast("Reported — a responsible adult can review it", "success");
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function deleteMyData() {
    if (!window.confirm("Delete your chat history and crew profile in this project? This can't be undone.")) return;
    try {
      await post("/crew/leave", { project_id: activeProject, owner_id: owner });
      toast("Your data was removed", "success");
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  if (!ready) return <Skeleton h={300} r={12} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="page-sub">Is your computer ready? One button fixes it.</div>
        </div>
      </div>

      <Card title="Your helper's brain">
        {provider?.model ? (
          <div className="row" style={{ gap: 10 }}>
            <span className="dot" style={{ background: "var(--success)", width: 9, height: 9 }} />
            <span className="small">
              Connected · <code className="small">{provider.model}</code>
            </span>
            <span className="spacer" />
            <Button size="sm" onClick={() => setProvider(null)}>
              Change
            </Button>
          </div>
        ) : (
          <>
            <div className="small muted" style={{ marginBottom: 12 }}>
              Your helper needs an AI key to work. Enter it once — the whole crew shares it.
            </div>
            <div className="grid g3" style={{ gap: 10, marginBottom: 10 }}>
              <Field label="Backend">
                <div className="small strong" style={{ padding: "9px 0" }}>
                  opencode-go <span className="dim">· the only backend</span>
                </div>
              </Field>
              <Field label="Model">
                <input className="input" placeholder="e.g. opencode-go/mimo-v2.6-pro" value={pForm.model} onChange={(e) => setPForm({ ...pForm, model: e.target.value })} />
              </Field>
              <Field label="API key">
                <input className="input" type="password" placeholder="sk-…" value={pForm.api_key} onChange={(e) => setPForm({ ...pForm, api_key: e.target.value })} />
              </Field>
            </div>
            <Button
              variant="primary"
              onClick={async () => {
                try {
                  const r = await post<any>("/provider", { provider: "opencode-go", model: pForm.model, api_key: pForm.api_key || undefined });
                  setProvider(r);
                  setPForm({ ...pForm, api_key: "" });
                  toast("Your helper is connected", "success");
                } catch (e: any) {
                  toast(e?.message ?? "Failed", "error");
                }
              }}
              disabled={!pForm.model}
            >
              Connect
            </Button>
          </>
        )}
      </Card>

      <Card title="Voice (ElevenLabs)">
        <div className="small muted" style={{ marginBottom: 12 }}>
          Give your helper a voice. It can read replies aloud and turn your speech into text.
        </div>
        {voice?.configured ? (
          <>
            <div className="voice-connected">
              <span className="dot" style={{ background: "var(--success)", width: 9, height: 9 }} />
              <span className="small">Connected</span>
              <span className="tiny dim">{voice.key_masked || "key stored"}</span>
              <span className="spacer" />
              <Button size="sm" loading={testingVoice} onClick={testVoice}>
                Play a sample
              </Button>
              <Button size="sm" variant="ghost" style={{ color: "var(--danger)" }} onClick={removeVoice}>
                Remove key
              </Button>
            </div>
            <div className="voice-picker">
              <Field label="Voice">
                <select className="select" value={voiceId} onChange={(e) => chooseVoice(e.target.value)}>
                  {voices.length === 0 && <option value={voiceId}>{voiceId ? "Saved voice" : "Default voice"}</option>}
                  {voices.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                      {v.category ? ` · ${v.category}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="tiny dim" style={{ margin: "4px 0 0" }}>
                Voices come from your ElevenLabs library. The next reply uses the one you pick.
              </p>
              {voiceListErr && (
                <div style={{ marginTop: 8 }}>
                  <p className="tiny" style={{ color: "var(--danger)", margin: "0 0 6px" }}>{voiceListErr}</p>
                  <div className="voice-manual">
                    <input
                      className="input"
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      placeholder="Voice ID"
                      aria-label="Voice ID"
                    />
                    <Button size="sm" onClick={() => chooseVoice(voiceId.trim())} disabled={!voiceId.trim()}>
                      Use this ID
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div className="grid g2" style={{ gap: 10, marginBottom: 10 }}>
              <Field label="ElevenLabs API key">
                <input
                  className="input"
                  type="password"
                  placeholder="sk_…"
                  value={voiceKey}
                  onChange={(e) => setVoiceKey(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <div className="field">
                <span className="field-label">Need a key?</span>
                <a className="btn" href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noreferrer">
                  Open ElevenLabs
                </a>
              </div>
            </div>
            <Button variant="primary" loading={savingVoice} onClick={saveVoice} disabled={!voiceKey.trim()}>
              Save key
            </Button>
            <p className="tiny dim" style={{ marginTop: 10 }}>
              Stored encrypted on this computer; it never reaches the browser. After saving, pick a voice from your
              ElevenLabs library.
            </p>
          </>
        )}
      </Card>

      <Card title="Safety">
        <div className="row" style={{ gap: 10, marginBottom: 12 }}>
          <label className="row" style={{ gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={!!proj?.require_approval} onChange={(e) => saveSafety(e.target.checked)} />
            <span className="small">Require approval before AI changes merge</span>
          </label>
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <Button size="sm" onClick={reportConcern}>
            Report a concern
          </Button>
          <Button size="sm" variant="danger" onClick={deleteMyData}>
            Delete my data in this project
          </Button>
        </div>
        <p className="tiny dim" style={{ marginTop: 10 }}>
          Projects are private by default. Reports are logged for a responsible adult to review.
        </p>
      </Card>

      <Card title="This computer">
        <div className="small muted" style={{ marginBottom: 12 }}>
          If anything is missing, one button installs it and starts the database. Nothing needs admin rights except Git & Docker.
        </div>
        <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
          <Button
            variant="success"
            loading={busy === "all"}
            onClick={async () => {
              await installAll();
              await startDb();
            }}
          >
            Fix everything
          </Button>
        </div>
        <div className="small" style={{ marginBottom: 8 }}>
          <span className="dim">{tools.filter((t) => t.installed).length} of {tools.length} ready</span>
        </div>
        <div style={{ marginBottom: 12, maxWidth: 320 }}>
          <WmProgress progress={tools.length ? tools.filter((t) => t.installed).length / tools.length : 0} />
        </div>
        <div className="grid" style={{ gap: 6 }}>
          {tools.filter((t) => !t.installed).map((t) => (
            <div key={t.id} className="row" style={{ gap: 10, padding: 10, border: "1px solid var(--border)", borderRadius: 10 }}>
              {t.installed ? <span className="dot" style={{ background: "var(--success)", width: 9, height: 9 }} /> : <span className="dot" style={{ background: "var(--warning)", width: 9, height: 9 }} />}
              <span className="strong">{t.label}</span>
              {t.version && <Chip>{String(t.version).slice(0, 28)}</Chip>}
              {!t.installed && t.hint && <span className="tiny dim">{t.hint}</span>}
              <span className="spacer" />
              {!t.installed && (
                <Button size="sm" loading={busy === t.id} onClick={() => install(t.id)}>
                  {t.auto === false ? "How?" : "Install"}
                </Button>
              )}
            </div>
          ))}
        </div>
        {log.length > 0 && (
          <pre className="scroll mono" style={{ marginTop: 12, background: "#0d1120", color: "#c9d1e0", padding: 12, borderRadius: 8, fontSize: 12, maxHeight: 130 }}>
            {log.slice(-10).join("\n")}
          </pre>
        )}
      </Card>

      <details style={{ marginTop: 16 }}>
        <summary className="card-title" style={{ cursor: "pointer", userSelect: "none", padding: "14px 16px" }}>
          Advanced
        </summary>
        <div style={{ display: "grid", gap: 16, marginTop: 4 }}>
      <div className="grid g2" style={{ marginTop: 16, alignItems: "start" }}>
        <Card title="Agent instances">
          <div className="small muted" style={{ marginBottom: 12 }}>
            Every teammate gets their own persistent OpenCode instance. Task runs attach to it.
          </div>
          {instances.length === 0 ? (
            <Empty title="No instances yet" hint="They spawn on a teammate's first task." />
          ) : (
            <div className="grid" style={{ gap: 6 }}>
              {instances.map((i) => (
                <div key={i.owner_id} className="row" style={{ gap: 10, padding: 10, border: "1px solid var(--border)", borderRadius: 10 }}>
                  <span className="dot" style={{ background: i.alive ? "var(--success)" : "var(--text-3)", width: 9, height: 9 }} />
                  <span className="strong">{i.owner_id}</span>
                  <Chip>:{i.port}</Chip>
                  <span className="tiny dim mono">pid {i.pid ?? "?"}</span>
                  <span className="spacer" />
                  <Button size="sm" onClick={() => post("/agents/instances/stop", { owner_id: i.owner_id }).then(load)}>
                    Stop
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Deploy targets">
          {!activeProject ? (
            <Empty title="No project selected" />
          ) : (
            <div className="grid" style={{ gap: 12 }}>
              {[
                ["railway_service_id", "Railway service ID", "railway_service_id"],
                ["railway_env_id", "Railway environment ID", "railway_env_id"],
                ["fly_app_id", "Fly app ID", "fly_app_id"],
                ["vercel_project_id", "Vercel project ID", "vercel_project_id"],
                ["vercel_team_id", "Vercel team ID (optional)", "vercel_team_id"],
                ["vercel_deploy_hook_url", "Vercel deploy hook URL", "vercel_deploy_hook_url"],
                ["stripe_customer_id", "Stripe customer ID", "stripe_customer_id"],
              ].map(([field, label]) => (
                <Field key={field} label={label}>
                  <input
                    className="input"
                    defaultValue={(proj ?? {})[field] ?? ""}
                    onBlur={(e) => e.target.value !== ((proj ?? {})[field] ?? "") && saveSetting(field, e.target.value)}
                    placeholder="not set"
                  />
                </Field>
              ))}
            </div>
          )}
        </Card>

        <Card title="API keys">
          <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
            <input className="input" placeholder="key label" value={newKey} onChange={(e) => setNewKey(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <Button variant="primary" onClick={makeKey} disabled={!activeProject || !newKey.trim()}>
              Create
            </Button>
          </div>
          {createdKey && (
            <div style={{ background: "var(--warning-soft)", border: "1px solid #f0d9a8", borderRadius: 8, padding: 10, marginBottom: 12 }}>
              <div className="tiny strong">Copy now. Shown once.</div>
              <div className="row" style={{ gap: 8, marginTop: 4 }}>
                <code className="mono small" style={{ wordBreak: "break-all" }}>
                  {createdKey}
                </code>
                <WmCopyButton text={createdKey} copyLabel="Copy" copiedLabel="Copied" />
              </div>
            </div>
          )}
          {keys.length === 0 ? (
            <Empty title="No API keys" hint="Create a key for CI or the CLI." />
          ) : (
            <div className="grid" style={{ gap: 4 }}>
              {keys.map((k) => (
                <div key={k.id} className="row" style={{ gap: 8, padding: "7px 4px", borderBottom: "1px solid var(--border)" }}>
                  <code className="small">{k.prefix}_…</code>
                  <span className="dim small">{k.created_by}</span>
                  <span className="spacer" />
                  <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }} onClick={() => del(`/api-keys/${k.id}`).then(load)}>
                    Revoke
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Notifications">
          <div className="small muted" style={{ marginBottom: 12 }}>Get pinged on Slack when a task merges or blocks.</div>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" placeholder="https://hooks.slack.com/…" value={slack} onChange={(e) => setSlack(e.target.value)} />
            <Button variant="primary" onClick={saveSlack} disabled={!activeProject}>
              Save
            </Button>
          </div>
        </Card>

        <Card title="Observability">
          <div className="small strong" style={{ marginBottom: 8 }}>Rate limits</div>
          {limits?.limits && Object.keys(limits.limits).length > 0 ? (
            <div className="grid" style={{ gap: 6 }}>
              {Object.entries(limits.limits).map(([k, v]: any) => (
                <div key={k} className="row" style={{ gap: 8 }}>
                  <code className="small">{k.replace("crew:rl:", "")}</code>
                  <span className="spacer" />
                  <span className="small dim">
                    {v.count} · resets in {v.ttl_sec}s
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No active limits" hint="Limits appear once you make requests." />
          )}
          <div className="divider" />
          <div className="row" style={{ gap: 8 }}> <span className="small">
              Auth mode: <code>{clerk?.mode ?? "dev"}</code>
              {clerk?.jwks_url ? " · JWKS configured" : " · decode-only"}
            </span>
          </div>
        </Card>
        </div>
      </div>
      </details>
    </>
  );
}
