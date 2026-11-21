"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../providers";
import { get, put, API } from "../lib/api";



export function Notes() {
  const { activeProject, owner } = useApp();
  const [content, setContent] = useState("");
  const [status, setStatus] = useState("");
  const lastServer = useRef<string>("");
  const typing = useRef(false);
  const saveTimer = useRef<any>(null);

  const load = useCallback(async () => {
    if (!activeProject) return;
    try {
      const r = await get<any>(`/notes?project_id=${activeProject}`);
      setContent(r.content ?? "");
      lastServer.current = r.updated_at ?? "";
    } catch {}
  }, [activeProject]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!activeProject) return;
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${API}/notes/stream?project_id=${activeProject}`);
      es.onmessage = (m) => {
        try {
          const n = JSON.parse(m.data);
          if (n.updated_at && n.updated_at !== lastServer.current) {
            lastServer.current = n.updated_at;
            if (!typing.current) setContent(n.content ?? "");
          }
        } catch {}
      };
    } catch {}
    return () => es?.close();
  }, [activeProject]);

  function onChange(v: string) {
    setContent(v);
    typing.current = true;
    setStatus("saving…");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        await put("/notes", { project_id: activeProject, content: v, updated_by: owner });
        setStatus("saved");
      } catch {
        setStatus("couldn't save");
      } finally {
        typing.current = false;
      }
    }, 600);
  }

  if (!activeProject) return null;

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-head">
        <div className="card-title">Team notes</div>
        <span className="tiny dim">{status || "everyone sees edits live"}</span>
      </div>
      <textarea
        className="input"
        style={{ minHeight: 140, width: "100%", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
        placeholder="Scratchpad for the whole crew — links, decisions, reminders. Everyone sees changes live."
        value={content}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
