

"use client";
import { motion } from "motion/react";

export function WmBudgetCard({
  spentLabel,
  breakdown,
}: {
  spentLabel: string;
  breakdown: { label: string; amount: number; color: string }[];
}) {
  const total = breakdown.reduce((n, b) => n + b.amount, 0) || 1;
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.19, 1, 0.22, 1] }}
      style={{
        border: "2px solid var(--border-strong)",
        borderRadius: 16,
        background: "#fff",
        padding: 20,
        boxShadow: "4px 4px 0 var(--border-strong)",
      }}
    >
      <div className="small dim">Total spend</div>
      <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>{spentLabel}</div>
      <div style={{ display: "flex", height: 10, gap: 3, margin: "14px 0 6px", borderRadius: 99, overflow: "hidden", background: "var(--surface-2)" }}>
        {breakdown.map((b, i) => (
          <motion.div
            key={b.label}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.8, delay: 0.3 + i * 0.1, ease: [0.19, 1, 0.22, 1] }}
            style={{ flex: b.amount, background: b.color, transformOrigin: "left" }}
          />
        ))}
      </div>
      {breakdown.map((b) => {
        const pct = Math.round((b.amount / total) * 100);
        return (
          <div key={b.label} style={{ marginTop: 10 }}>
            <div className="row" style={{ justifyContent: "space-between", fontSize: 12 }}>
              <span>
                <span className="dot" style={{ background: b.color, width: 8, height: 8 }} /> {b.label}
              </span>
              <span className="dim">{pct}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 99, background: "var(--surface-2)", marginTop: 4 }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7 }}
                style={{ height: "100%", borderRadius: 99, background: b.color }}
              />
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}
