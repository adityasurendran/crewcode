"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { get, getGuestToken, setGuestToken, IS_DEMO } from "./lib/api";
import "./components/bits/Counter.css";
import "./components/bits/Stepper.css";

type ToastKind = "success" | "error" | "info";
type Toast = { id: number; message: string; kind: ToastKind };

type AppCtx = {
  ready: boolean;
  projects: any[];
  activeProject: string;
  setActiveProject: (id: string) => void;
  refreshProjects: () => Promise<void>;
  owner: string;
  setOwner: (s: string) => void;
  guest: any;
  setGuest: (g: any) => void;
  toast: (message: string, kind?: ToastKind) => void;
};

const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp must be used inside <Providers>");
  return c;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProject, setActiveProjectState] = useState("");
  const [owner, setOwner] = useState(IS_DEMO ? "Maya" : "teammate-1");
  const [guest, setGuestState] = useState<any>(() => {
    try {
      if (typeof window === "undefined") return null;
      const raw = window.localStorage.getItem("crewcode_guest_info");
      return getGuestToken() && raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const activeRef = useRef("");

  const setGuest = useCallback((g: any) => {
    setGuestState(g);
    setGuestToken(g?.guest_token ?? null);
    try {
      if (g) {
        window.localStorage.setItem(
          "crewcode_guest_info",
          JSON.stringify({ project_id: g.project_id, project_name: g.project_name, expires_at: g.expires_at })
        );
      } else {
        window.localStorage.removeItem("crewcode_guest_info");
      }
    } catch {}
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev.slice(-3), { id, message, kind }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const setActiveProject = useCallback((id: string) => {
    activeRef.current = id;
    setActiveProjectState(id);
    if (typeof window !== "undefined") window.localStorage.setItem("crewcode_project", id);
  }, []);

  const refreshProjects = useCallback(async () => {
    try {
      const list = await get<any[]>("/projects");
      setProjects(list);
      const stored = typeof window !== "undefined" ? window.localStorage.getItem("crewcode_project") : null;
      const pick = list.find((p) => p.id === activeRef.current)?.id || list.find((p) => p.id === stored)?.id || list[0]?.id || "";
      if (pick && pick !== activeRef.current) setActiveProject(pick);
      return;
    } catch {
      throw null;
    }
  }, [setActiveProject]);

  useEffect(() => {
    (async () => {
      try {
        await refreshProjects();
      } catch {}
      setReady(true);
    })();
  }, [refreshProjects]);

  useEffect(() => {
    if (guest?.project_id) setActiveProject(guest.project_id);
  }, [guest?.project_id, setActiveProject]);

  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.12 });
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, []);

  return (
    <Ctx.Provider
      value={{
        ready,
        projects,
        activeProject,
        setActiveProject,
        refreshProjects: async () => {
          try {
            await refreshProjects();
          } catch {}
        },
        owner,
        setOwner,
        guest,
        setGuest,
        toast,
      }}
    >
      {children}
      <div className="toasts">
        {toasts.map((t) => {
          const bg = t.kind === "success" ? "var(--success)" : t.kind === "error" ? "var(--danger)" : "#1f2937";
          return (
            <div key={t.id} className="toast" style={{ background: bg }}>
              <span className="dot" style={{ background: "#fff" }} />
              <span>{t.message}</span>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}
