

"use client";
import { useState, type ReactNode } from "react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { ChevronDown } from "lucide-react";

export type WmActivityItem = { icon: ReactNode; title: string; desc: string; time: string };

export function WmActivityList({
  icon,
  title,
  subtitle,
  items,
  defaultOpen = true,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
  items: WmActivityItem[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <MotionConfig transition={{ type: "spring", bounce: 0, duration: 0.5 }}>
      <motion.div
        layout
        style={{ overflow: "hidden", borderRadius: 16, border: "2px solid var(--border-strong)", background: "#fff" }}
      >
        <motion.button
          onClick={() => setOpen(!open)}
          style={{
            display: "flex",
            width: "100%",
            alignItems: "center",
            gap: 12,
            padding: "12px 14px",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <motion.div
            animate={{ scale: open ? 0.85 : 1 }}
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "var(--accent-soft)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent-2)",
              flexShrink: 0,
            }}
          >
            {icon}
          </motion.div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
            <AnimatePresence mode="popLayout" initial={false}>
              {!open && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {subtitle}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              background: "var(--surface-2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ChevronDown size={16} />
          </motion.div>
        </motion.button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              style={{ borderTop: "2px solid var(--border)", overflow: "hidden" }}
            >
              <div style={{ padding: "6px 0" }}>
                {items.map((it, i) => (
                  <motion.div
                    layout
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px" }}
                  >
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 10,
                        background: "var(--surface-2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {it.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {it.title}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {it.desc}
                      </div>
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text-3)", flexShrink: 0 }}>{it.time}</span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </MotionConfig>
  );
}
