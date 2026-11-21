"use client";
import React from "react";


export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

export const STATUS: Record<string, { color: string; soft: string; label: string }> = {
  queued: { color: "#475569", soft: "#eef2f7", label: "Queued" },
  running: { color: "#2563eb", soft: "#e9f0fe", label: "Running" },
  testing: { color: "#b45309", soft: "#fdf3e3", label: "Testing" },
  merged: { color: "#16a34a", soft: "#e8f7ee", label: "Merged" },
  blocked: { color: "#dc2626", soft: "#fdeaea", label: "Blocked" },
};

export function statusStyle(s: string) {
  return STATUS[s] ?? { color: "#475569", soft: "#eef2f7", label: s };
}

function flatTone(seed: string) {
  const palette = ["#ff385c", "#008489", "#222222", "#460479", "#b45309", "#016368", "#6a6a6a", "#92174d"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}


type BtnVariant = "default" | "primary" | "success" | "danger" | "ghost";
type BtnProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({ variant = "default", size = "md", loading, children, className, ...rest }: BtnProps) {
  return (
    <button
      className={cx("btn", variant === "primary" && "btn-primary", variant === "success" && "btn-success", variant === "danger" && "btn-danger", variant === "ghost" && "btn-ghost", size === "sm" && "btn-sm", className)}
      disabled={rest.disabled || loading}
      {...rest}
    >
      {loading && <span className="css-spinner" aria-hidden />}
      {children}
    </button>
  );
}


export function StatusBadge({ status }: { status: string }) {
  const s = statusStyle(status);
  return (
    <span className="badge" style={{ background: s.soft, color: s.color }}>
      <span className="dot" />
      {s.label}
    </span>
  );
}

export function Badge({ children, color = "#475569", bg = "#eef2f7" }: { children: React.ReactNode; color?: string; bg?: string }) {
  return (
    <span className="badge" style={{ background: bg, color }}>
      {children}
    </span>
  );
}

export function Chip({ children, icon }: { children: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <span className="chip">
      {icon}
      {children}
    </span>
  );
}


export function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  const initial = (name || "?").replace(/[^a-zA-Z0-9]/g, "").slice(0, 1).toUpperCase() || "?";
  return (
    <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.46, background: flatTone(name || "?") }}>
      {initial}
    </span>
  );
}


export function Card({ title, action, children, className, bodyClass, hover }: { title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string; hover?: boolean }) {
  return (
    <div className={cx("card", hover && "card-hover", className)}>
      {title && (
        <div className="card-head">
          <div className="card-title">{title}</div>
          {action}
        </div>
      )}
      <div className={cx("card-body", bodyClass)}>{children}</div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="card stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}


export function Empty({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="empty">
      <div style={{ fontWeight: 600, color: "var(--text-2)", marginBottom: 3 }}>{title}</div>
      {hint && <div className="small dim">{hint}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}


export function Skeleton({ w = "100%", h = 14, r = 6 }: { w?: string | number; h?: number; r?: number }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r }} />;
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} h={34} r={8} />
      ))}
    </div>
  );
}


export function Field({ label, hint, children }: { label?: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="field">
      {label && <label className="field-label">{label}</label>}
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}


export function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginBottom: 12 }}>{title}</h2>
        {children}
      </div>
    </div>
  );
}


export function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function money(n: number | undefined | null): string {
  return `$${(Number(n) || 0).toFixed(4)}`;
}


export function Sticker({ tone = "pink", angle = -6, children }: { tone?: "pink" | "blue" | "white" | "yellow"; angle?: number; children: React.ReactNode }) {
  return (
    <span className={`sticker sticker-${tone}`} style={{ ["--r" as any]: `${angle}deg` }}>
      {children}
    </span>
  );
}

export function Ticker({ items }: { items: string[] }) {
  if (!items.length) return null;
  const row = items.map((t, i) => <span key={i}>{t} ·</span>);
  return (
    <div className="ticker">
      <div className="ticker-track">
        {row}
        {row}
      </div>
    </div>
  );
}

export function WaveEdge({ fill = "#14142b" }: { fill?: string }) {
  return (
    <svg className="wave-edge" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden>
      <path d="M0,36 C240,64 480,8 720,30 C960,52 1200,12 1440,34 L1440,60 L0,60 Z" fill={fill} />
    </svg>
  );
}
