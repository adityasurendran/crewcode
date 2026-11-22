"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "../providers";
import { get, del, IS_DEMO } from "../lib/api";

const NAV_SIMPLE = [
  { href: "/", label: "Chat" },
  { href: "/crew", label: "Crew" },
  { href: "/passport", label: "Passport" },
  { href: "/share", label: "Share" },
];


const NAV_MORE = [
  { href: "/board", label: "Board" },
  { href: "/activity", label: "Activity" },
  { href: "/costs", label: "Costs" },
  { href: "/team", label: "Team" },
  { href: "/integrations", label: "Integrations" },
  { href: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { projects, activeProject, setActiveProject, owner, setOwner, guest, setGuest, refreshProjects } = useApp();
  const [setupOk, setSetupOk] = useState<boolean | null>(null);
  const [publicHost, setPublicHost] = useState(false);

  useEffect(() => {
    if (IS_DEMO) return;
    try {
      const h = window.location.hostname;
      setPublicHost(h !== "localhost" && h !== "127.0.0.1" && h !== "::1");
    } catch {}
  }, []);

  useEffect(() => {
    if (!IS_DEMO) return;
    const demoPages = ["/", "/crew", "/passport", "/share"];
    const allowed = demoPages.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
    if (!allowed) router.replace("/");
  }, [pathname, router]);

  useEffect(() => {
    if (!publicHost || IS_DEMO) return;
    if (!guest && pathname !== "/share") {
      router.replace("/share");
      return;
    }
    if (guest && /^\/(settings|board|activity|costs|team|integrations)(\/|$)/.test(pathname)) {
      router.replace("/");
    }
  }, [publicHost, guest, pathname, router]);

  useEffect(() => {
    get<any>("/setup/status")
      .then((s) => setSetupOk((s?.tools ?? []).filter((t: any) => t.required && !t.installed).length === 0))
      .catch(() => setSetupOk(null));
  }, [pathname]);

  if (publicHost && !guest) {
    return <div className="friend-app friend-app-join">{children}</div>;
  }

  if ((publicHost || IS_DEMO) && guest) {
    return (
      <div className="friend-app">
        <header className="friend-head">
          <div className="friend-brand">
            <span className="brand-mark">C</span>
            <span>CrewCode</span>
            {IS_DEMO && <span className="demo-chip">Demo</span>}
          </div>
          <div className="friend-project">{guest.project_name}</div>
          <button
            className="friend-leave"
            onClick={() => {
              setGuest(null);
              router.replace("/share");
            }}
          >
            Leave
          </button>
        </header>
        <main className="friend-main">{children}</main>
      </div>
    );
  }

  const demoStrip = IS_DEMO ? (
    <div className="demo-strip" role="note">
      <span className="demo-strip-tag">Demo</span>
      <span>Sample project · simulated helper · no real code is built</span>
    </div>
  ) : null;

  return (
    <>
      {demoStrip}
      <div className={IS_DEMO ? "app demo-app" : "app"}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <div className="brand-name">CrewCode</div>
            <div className="brand-sub">{IS_DEMO ? "interactive demo" : "a shared making space"}</div>
          </div>
        </div>

        {((publicHost && !guest) ? NAV_SIMPLE.filter((n) => n.href === "/share") : NAV_SIMPLE).map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href} className={`nav-item${active ? " active" : ""}`}>
              {label}
            </Link>
          );
        })}

        {!guest && !publicHost && !IS_DEMO && (
          <details style={{ marginTop: 8 }}>
            <summary className="nav-label" style={{ cursor: "pointer", userSelect: "none", listStyle: "none" }}>
              More
            </summary>
            <div style={{ marginTop: 2 }}>
              {NAV_MORE.map(({ href, label }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link key={href} href={href} className={`nav-item${active ? " active" : ""}`}>
                    {label}
                  </Link>
                );
              })}
            </div>
          </details>
        )}

        {!(publicHost && !guest) && (
          <div className="sidebar-foot">
            {guest ? (
              <div style={{ color: "var(--accent-2)", fontWeight: 600 }}>Guest · {guest.project_name}</div>
            ) : (
              <div className="row" style={{ gap: 7 }}>
                <span
                  className="dot"
                  style={{ background: setupOk === false ? "#f59e0b" : setupOk ? "#22c55e" : "#6b7280" }}
                />
                {IS_DEMO ? "Demo data" : setupOk === false ? "Setup incomplete" : setupOk ? "All systems ready" : "Checking…"}
              </div>
            )}
          </div>
        )}
      </aside>

      <div className="main">
        <header className="topbar">
          {(!publicHost || guest) && (
            <div style={{ position: "relative" }}>
              <select
                className="select"
                value={activeProject}
                onChange={(e) => setActiveProject(e.target.value)}
                style={{ minWidth: 190, fontWeight: 600 }}
                disabled={!!guest}
              >
                {projects.length === 0 && <option value="">No projects</option>}
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!guest && !publicHost && !IS_DEMO && (
            <button
              className="btn btn-sm"
              style={{ marginLeft: 8 }}
              onClick={() => {
                window.location.href = "/?new=1";
              }}
              title="Create a new project"
            >
              + New
            </button>
          )}

          {!guest && !publicHost && !IS_DEMO && activeProject && (
            <button
              className="btn btn-sm btn-ghost"
              style={{ marginLeft: 6, color: "var(--danger)" }}
              title="Delete this project"
              onClick={async () => {
                if (!window.confirm("Delete this project and all its chats and notes? This can't be undone.")) return;
                try {
                  await del(`/projects/${activeProject}`);
                  await refreshProjects();
                  window.location.href = "/";
                } catch {}
              }}
            >
              Delete
            </button>
          )}

          <div className="spacer" />

          {(!publicHost || guest) && (
            <div className="row" style={{ gap: 8 }}>
              <span className="tiny dim">Your name</span>
              <input
                className="input"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                style={{ width: 130, padding: "7px 10px" }}
                placeholder="your name"
              />
              <span className="avatar" title={owner} style={{ width: 30, height: 30, fontSize: 13 }}>
                {(owner || "?").slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}
        </header>

        <div className="content">{children}</div>

        <footer className="site-footer">
          <div className="site-footer-word">CrewCode</div>
          <div className="site-footer-links">
            {publicHost || IS_DEMO ? (
              <>
                <Link href="/">Chat</Link>
                <Link href="/crew">Crew</Link>
                <Link href="/passport">Passport</Link>
                <Link href="/share">Share</Link>
              </>
            ) : (
              <>
                <Link href="/board">Board</Link>
                <Link href="/share">Share</Link>
                <Link href="/costs">Costs</Link>
                <Link href="/settings">Settings</Link>
              </>
            )}
          </div>
          <div className="site-footer-fine">Everyone builds. CrewCode integrates. © 2026</div>
        </footer>
      </div>
      </div>
    </>
  );
}
