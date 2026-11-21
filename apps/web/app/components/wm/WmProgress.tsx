

"use client";
import { motion } from "motion/react";

export function WmProgress({
  progress,
  tone = "var(--success)",
  count = 22,
}: {
  progress: number | null;
  tone?: string;
  count?: number;
}) {
  const active = progress == null ? count : Math.round(Math.min(1, Math.max(0, progress)) * count);
  return (
    <div style={{ display: "flex", gap: 2 }} aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <motion.span
          key={i}
          animate={progress == null ? { opacity: [0.3, 1, 0.3] } : {}}
          transition={progress == null ? { repeat: Infinity, duration: 1.2, delay: i * 0.03 } : {}}
          style={{
            height: 8,
            flex: 1,
            borderRadius: 2,
            background: i < active ? tone : "var(--border)",
            transition: "background 0.2s",
          }}
        />
      ))}
    </div>
  );
}
