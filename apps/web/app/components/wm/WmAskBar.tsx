// Adapted from Watermelon UI "contextual-ai-bar" (MIT), simplified:
// one rounded ask-bar with morphing submit arrow — no extra modes.
"use client";
import { motion, AnimatePresence } from "motion/react";
import { Loader2 } from "lucide-react";

export function WmAskBar({
  value,
  onChange,
  onSubmit,
  placeholder = "Ask…",
  loading = false,
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  loading?: boolean;
  autoFocus?: boolean;
}) {
  const spring = { type: "spring", stiffness: 220, damping: 16 } as const;
  const canSend = value.trim().length > 0 && !loading;
  return (
    <motion.div
      layout
      transition={spring}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "var(--surface)",
        border: "1.5px solid var(--border-strong)",
        borderRadius: 2,
        padding: 5,
        paddingLeft: 12,
      }}
    >
      <input
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && canSend) onSubmit();
        }}
        placeholder={placeholder}
        disabled={loading}
        style={{
          flex: 1,
          minWidth: 0,
          border: "none",
          background: "transparent",
          outline: "none",
          fontSize: 15,
        }}
      />
      <motion.button
        whileTap={canSend ? { scale: 0.97 } : undefined}
        transition={spring}
        onClick={() => canSend && onSubmit()}
        disabled={!canSend}
        aria-label="Send"
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          height: 38,
          padding: "0 14px",
          borderRadius: 1,
          border: "1.5px solid var(--border-strong)",
          background: canSend ? "var(--accent)" : "var(--surface-2)",
          color: canSend ? "var(--accent-ink)" : "var(--text-3)",
          fontWeight: 700,
          fontSize: 13,
          cursor: canSend ? "pointer" : "default",
        }}
      >
        <AnimatePresence mode="wait" initial={false}>
          {loading ? (
            <motion.span
              key="loading"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1, rotate: 360 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ rotate: { repeat: Infinity, duration: 1, ease: "linear" } }}
              style={{ display: "inline-flex" }}
            >
              <Loader2 size={17} />
            </motion.span>
          ) : (
            <motion.span
              key="send"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{ display: "inline-flex" }}
            >
              Send
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </motion.div>
  );
}
