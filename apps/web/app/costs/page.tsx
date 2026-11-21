"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../providers";
import { get, patch } from "../lib/api";
import { Button, Card, Stat, Empty, Skeleton, money } from "../components/ui";
import { WmBudgetCard } from "../components/wm/WmBudgetCard";

export default function Costs() {
  const { activeProject, ready, toast } = useApp();
  const [billing, setBilling] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [kind, setKind] = useState("");
  const [tier, setTier] = useState("standard");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeProject) return;
    try {
      const [b, h, t, m] = await Promise.all([
        get(`/billing?project_id=${activeProject}`).catch(() => null),
        get(`/cost-history?project_id=${activeProject}&days=30`).catch(() => null),
        get(`/cost-optimizer/tiers`).catch(() => null),
        get(`/cost-optimizer/mapping?project_id=${activeProject}`).catch(() => ({})),
      ]);
      setBilling(b);
      setHistory(h?.points ?? []);
      setTiers(t);
      setMapping(m ?? {});
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveOverride() {
    if (!kind.trim()) return;
    try {
      await patch("/cost-optimizer/mapping", { project_id: activeProject, kind: kind.trim(), tier });
      setKind("");
      toast(`${kind} set to ${tier}`, "success");
      load();
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  function exportCsv() {
    if (!billing?.by_owner) return;
    const rows = [["owner", "tokens", "cost_usd"]];
    Object.entries(billing.by_owner).forEach(([o, v]: any) => rows.push([o, String(v.tokens), v.cost.toFixed(4)]));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "crewcode-costs.csv";
    a.click();
  }

  if (!ready) return <Skeleton h={300} r={12} />;
  if (!activeProject) return <Empty title="No project selected" hint="Create a project first." />;

  const maxTokens = Math.max(1, ...history.map((p) => Number(p.tokens) || 0));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Costs</h1>
          <div className="page-sub">Token spend per teammate, per task, with a built-in model router.</div>
        </div>
        <Button onClick={exportCsv} disabled={!billing}>
          Export CSV
        </Button>
      </div>

      {loading ? (
        <Skeleton h={120} r={12} />
      ) : (
        <>
          <div className="grid g3">
            <Stat label="Total spend" value={money(billing?.total_cost_usd)} />
            <Stat label="Tokens" value={(billing?.total_tokens ?? 0).toLocaleString()} />
            <Stat label="Tasks" value={billing?.tasks ?? 0} />
          </div>

          <div className="grid g2" style={{ marginTop: 16, alignItems: "start" }}>
            {Object.keys(billing?.by_owner ?? {}).length === 0 ? (
              <Card title="Spend by teammate" bodyClass="">
                <Empty title="No spend yet" />
              </Card>
            ) : (
              <WmBudgetCard
                spentLabel={money(billing?.total_cost_usd)}
                breakdown={Object.entries(billing.by_owner)
                  .slice(0, 5)
                  .map(([o, v]: any, i) => ({
                    label: o,
                    amount: Number(v.cost) || 0,
                    color: ["var(--accent-2)", "var(--success)", "var(--info)", "var(--warning)", "var(--accent)"][i % 5],
                  }))}
              />
            )}

            <Card title="Last 30 days">
              {history.length === 0 ? (
                <Empty title="No history yet" hint="Costs appear once tasks run." />
              ) : (
                <div className="row" style={{ alignItems: "flex-end", gap: 4, height: 140 }}>
                  {history.slice(-24).map((p, i) => (
                    <div key={i} className="hist-bar" style={{ height: `${Math.max(3, (Number(p.tokens) / maxTokens) * 130)}px` }} title={`${String(p.day).slice(0, 10)} · ${p.tokens} tok · ${money(p.cost_usd)}`} />
                  ))}
                </div>
              )}
            </Card>
          </div>
        </>
      )}

      <div style={{ marginTop: 16 }}>
        <Card title="Model router">
          <div className="small dim" style={{ marginBottom: 12 }}>
            Cheap chores go to small models, hard merges go to large ones. Override the tier for any task kind.
          </div>
          <div className="grid g4" style={{ gap: 10, marginBottom: 14 }}>
            {tiers?.tiers &&
              Object.entries(tiers.tiers).map(([t, model]: any) => (
                <div key={t} className="card" style={{ padding: 12, boxShadow: "none" }}>
                  <div className="strong" style={{ textTransform: "capitalize" }}>
                    {t}
                  </div>
                  <div className="tiny mono dim">{model}</div>
                  <div className="tiny dim" style={{ marginTop: 4 }}>
                    ${tiers.costs_per_1k?.[t]}/1K tok
                  </div>
                </div>
              ))}
          </div>
          <div className="row wrap" style={{ gap: 8 }}>
            <input className="input" placeholder="task kind (e.g. semantic_patch)" value={kind} onChange={(e) => setKind(e.target.value)} style={{ flex: 1, minWidth: 220 }} />
            <select className="select" value={tier} onChange={(e) => setTier(e.target.value)} style={{ width: 140 }}>
              {["tiny", "cheap", "standard", "heavy", "frontier"].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <Button variant="primary" onClick={saveOverride} disabled={!kind.trim()}>
              Override
            </Button>
          </div>
          {Object.keys(mapping ?? {}).length > 0 && (
            <div className="row wrap" style={{ gap: 6, marginTop: 12 }}>
              {Object.entries(mapping).map(([k, v]) => (
                <span key={k} className="chip">
                  {k} → {v}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
