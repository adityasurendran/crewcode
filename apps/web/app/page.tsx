"use client";
import { useEffect, useState } from "react";
import { useApp } from "./providers";
import { post } from "./lib/api";
import { Button, Skeleton } from "./components/ui";
import { Chat } from "./components/Chat";
import { Notes } from "./components/Notes";

export default function Home() {
  const { ready, projects, setActiveProject, refreshProjects, toast, guest } = useApp();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [forceNew, setForceNew] = useState(false);

  useEffect(() => {
    try {
      if (window.location.search.includes("new=1")) setForceNew(true);
    } catch {}
  }, []);

  async function createProject() {
    setCreating(true);
    try {
      const name = newName.trim() || `Our project ${Math.floor(Math.random() * 900 + 100)}`;
      const p = await post<any>("/projects", { name });
      await refreshProjects();
      setActiveProject(p.id);
      setNewName("");
      setForceNew(false);
      try {
        window.history.replaceState({}, "", "/");
      } catch {}
      toast("Your project is ready", "success");
    } catch (e: any) {
      toast(e?.message ?? "Could not create the project", "error");
    } finally {
      setCreating(false);
    }
  }

  if (!ready) return <Skeleton h={320} r={12} />;

  // Friends get the chat and nothing else.
  if (guest) return <Chat />;

  if (projects.length === 0 || forceNew) {
    return (
      <>
        <div className="page-head">
          <div>
            <h1>Start something together</h1>
            <div className="page-sub">Give it a name, then just tell your helper what you want.</div>
          </div>
        </div>
        <div className="card" style={{ maxWidth: 520 }}>
          <div className="card-body" style={{ display: "grid", gap: 12 }}>
            <input
              className="input input-lg"
              placeholder="What should we call it?"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createProject()}
              autoFocus
            />
            <div>
              <Button variant="primary" loading={creating} onClick={createProject}>
                Create project
              </Button>
              {forceNew && projects.length > 0 && (
                <button
                  className="btn btn-ghost"
                  style={{ marginLeft: 8 }}
                  onClick={() => {
                    setForceNew(false);
                    try {
                      window.history.replaceState({}, "", "/");
                    } catch {}
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Chat</h1>
          <div className="page-sub">Say what you want in plain words. Your helper builds it and everyone stays in sync.</div>
        </div>
      </div>
      <Chat />
      <Notes />
    </>
  );
}
