// Adapted from Watermelon UI "discrete-tabs" (MIT), simplified:
// sliding active pill via layoutId. No timers, no shine — just the morph.
"use client";
import { motion } from "motion/react";

export function WmTabs({
  id,
  tabs,
  value,
  onChange,
}: {
  id: string;
  tabs: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 2,
        background: "transparent",
        border: "1.5px solid var(--border-strong)",
        borderRadius: 2,
        padding: 3,
        maxWidth: "100%",
      }}
    >
      {tabs.map((t) => {
        const active = t.id === value;
        return (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            style={{
              position: "relative",
              border: "none",
              background: "transparent",
              padding: "6px 12px",
              borderRadius: 1,
              cursor: "pointer",
              fontWeight: active ? 800 : 700,
              fontSize: 13,
              color: active ? "var(--accent-ink)" : "var(--text-2)",
            }}
          >
            {active && (
              <motion.span
                layoutId={`wm-tab-pill-${id}`}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                style={{ position: "absolute", inset: 0, background: "var(--accent)", borderRadius: 1 }}
              />
            )}
            <span style={{ position: "relative", zIndex: 1 }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
