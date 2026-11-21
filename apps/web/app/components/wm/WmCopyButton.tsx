// Adapted from Watermelon UI "copy-confirm" (MIT).
// Morphing copy button: per-character label animation, blur-morph icon swap.
"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, Copy } from "lucide-react";

export function WmCopyButton({
  text,
  copyLabel = "Copy",
  copiedLabel = "Copied",
  onCopied,
}: {
  text: string;
  copyLabel?: string;
  copiedLabel?: string;
  onCopied?: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {}
    setCopied(true);
    onCopied?.();
    setTimeout(() => setCopied(false), 1800);
  }

  const label = copied ? copiedLabel : copyLabel;
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      animate={{ backgroundColor: copied ? "var(--success)" : "var(--accent)" }}
      onClick={handleCopy}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        borderRadius: 2,
        padding: "8px 14px",
        color: copied ? "#fff" : "var(--accent-ink)",
        border: "1.5px solid var(--border-strong)",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={copied ? "check" : "copy"}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
          style={{ display: "inline-flex" }}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </motion.span>
      </AnimatePresence>
      <span>{label}</span>
    </motion.button>
  );
}
