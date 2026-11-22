"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useApp } from "../providers";
import { get, post, API, getGuestToken, IS_DEMO } from "../lib/api";
import { WmAskBar } from "./wm/WmAskBar";
import { WmTabs } from "./wm/WmTabs";
import { Skeleton } from "./ui";

type Mode = "build" | "learn" | "review";

const PLACEHOLDER: Record<Mode, string> = {
  build: "What should we build?",
  learn: "What should I explain?",
  review: "What should I check?",
};

const MODE_HELP: Record<Mode, string> = {
  build: "Build: your helper makes the change and checks it.",
  learn: "Learn: explains how it works. Nothing is changed.",
  review: "Review: checks for bugs and suggests fixes. Nothing is changed.",
};



export function Chat() {
  const { activeProject, owner, ready, toast, guest } = useApp();
  const [threadId, setThreadId] = useState("");
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("build");
  const [sending, setSending] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [status, setStatus] = useState("");
  const [voiceCfg, setVoiceCfg] = useState<any>(null);
  const [speak, setSpeak] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const scroller = useRef<HTMLDivElement>(null);
  const recRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pendingAudio = useRef<{ url: string; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!activeProject) return;
    try {
      const r = await get<any>(`/threads?project_id=${activeProject}&owner_id=${encodeURIComponent(owner)}`);
      setThreadId(r.thread?.id ?? "");
      setMessages(r.messages ?? []);
      const st = r.latest_task?.status;
      if (st === "awaiting_approval") setStatus("Waiting for approval…");
      else if (st === "queued" || st === "running" || st === "testing") setStatus("Working…");
      else setStatus("");
    } catch {
    } finally {
      setLoading(false);
    }
  }, [activeProject, owner]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    get<any>("/voice/status").then(setVoiceCfg).catch(() => setVoiceCfg({ configured: false }));
  }, []);

  useEffect(() => {
    try {
      setSpeak(localStorage.getItem("crewcode_speak") === "1");
    } catch {}
    const a = new Audio();
    a.preload = "auto";
    audioRef.current = a;
  }, []);

  
  useEffect(() => {
    if (!guest || !voiceCfg?.configured) return;
    try {
      if (localStorage.getItem("crewcode_speak") === null) {
        setSpeak(true);
        localStorage.setItem("crewcode_speak", "1");
      }
    } catch {}
  }, [guest, voiceCfg?.configured]);

  const SILENT =
    "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

  function primeAudio() {
    const a = audioRef.current ?? new Audio();
    audioRef.current = a;
    try {
      a.onended = null;
      a.src = SILENT;
      a.play()
        .then(() => {
          a.pause();
          setAudioBlocked(false);
        })
        .catch(() => {});
    } catch {}
  }

  async function playPending() {
    const p = pendingAudio.current;
    if (!p) {
      primeAudio();
      return;
    }
    const a = audioRef.current ?? new Audio();
    audioRef.current = a;
    try {
      a.onended = () => {
        URL.revokeObjectURL(p.url);
        setSpeaking(false);
      };
      a.onplay = () => setSpeaking(true);
      a.src = p.url;
      await a.play();
      pendingAudio.current = null;
      setAudioBlocked(false);
    } catch {
      setSpeaking(false);
      setAudioBlocked(true);
    }
  }

  function plainSpeech(text: string) {
    return String(text ?? "")
      .replace(/```[\s\S]*?```/g, " code block ")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/[*_`#>]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 900);
  }

  async function speakText(text: string) {
    if (IS_DEMO) return;
    const clean = plainSpeech(text);
    if (!clean) return;
    try {
      const token = getGuestToken();
      const res = await fetch(`${API}/voice/tts`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { "x-guest-token": token } : {}) },
        body: JSON.stringify({ text: clean }),
      });
      if (!res.ok) {
        toast("Voice could not play that reply", "error");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = audioRef.current ?? new Audio();
      audioRef.current = a;
      a.pause();
      a.onended = () => {
        URL.revokeObjectURL(url);
        setSpeaking(false);
      };
      a.onplay = () => setSpeaking(true);
      a.src = url;
      try {
        await a.play();
        pendingAudio.current = null;
        setAudioBlocked(false);
      } catch (e: any) {
        setSpeaking(false);
        if (pendingAudio.current?.url) URL.revokeObjectURL(pendingAudio.current.url);
        pendingAudio.current = { url, text: clean };
        setAudioBlocked(true);
      }
    } catch {}
  }

  
  useEffect(() => {
    if (!threadId || IS_DEMO) return;
    let es: EventSource | null = null;
    try {
      const guestToken = getGuestToken();
      es = new EventSource(`${API}/threads/${threadId}/stream${guestToken ? `?guest_token=${encodeURIComponent(guestToken)}` : ""}`);
      es.onmessage = (m) => {
        try {
          const msg = JSON.parse(m.data);
          if (msg.role === "agent") {
            setStreaming("");
            setStatus("");
            if (speak) speakText(msg.content);
          }
          setMessages((prev) => (prev.some((p) => p.id === msg.id) ? prev : [...prev, msg]));
        } catch {}
      };
      es.addEventListener("delta", (e: any) => {
        try {
          setStreaming(JSON.parse(e.data).text ?? "");
        } catch {}
      });
      es.addEventListener("status", (e: any) => {
        try {
          const s = JSON.parse(e.data).stage as string;
          if (s === "thinking" || s === "working") setStatus("Thinking…");
          else if (s === "checking") setStatus("Checking & merging…");
          else if (s === "review") setStatus("Waiting for approval…");
          else if (s === "done") {
            setStatus("Done");
            setTimeout(() => setStatus(""), 4000);
          } else if (s === "error") setStatus("Needs attention");
        } catch {}
      });
    } catch {}
    return () => es?.close();
  }, [threadId, speak]);

  
  
  useEffect(() => {
    if (!status || !activeProject || !threadId || !owner) return;
    let stop = false;
    let timer: any = null;
    const tick = async () => {
      try {
        const r = await get<any>(`/threads?project_id=${activeProject}&owner_id=${encodeURIComponent(owner)}`);
        const list = Array.isArray(r?.messages) ? r.messages : [];
        if (!stop && list.length) {
          setMessages(list);
          const last = list[list.length - 1];
          if (last?.role === "agent") {
            setStreaming("");
            setStatus("");
          }
        }
        const tstatus = r?.latest_task?.status;
        if (tstatus === "merged" || tstatus === "blocked") {
          setStreaming("");
          setStatus("");
        } else if (tstatus === "awaiting_approval") {
          setStatus("Waiting for approval…");
        }
      } catch {}
      if (!stop) timer = setTimeout(tick, 2500);
    };
    timer = setTimeout(tick, 1200);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [status, activeProject, threadId, owner]);

  useEffect(() => {
    requestAnimationFrame(() => scroller.current?.scrollTo({ top: 1e9, behavior: "smooth" }));
  }, [messages.length]);

  async function send() {
    const text = input.trim();
    if (!text || !activeProject) return;
    if (speak) primeAudio();
    setSending(true);
    setInput("");
    setStreaming("");
    setStatus("Thinking…");
    setMessages((p) => [...p, { id: `local-${Date.now()}`, role: "user", content: text, created_at: new Date().toISOString() }]);
    try {
      await post("/threads/message", { project_id: activeProject, owner_id: owner, message: text, mode });
    } catch (e: any) {
      toast(e?.message ?? "Could not send that", "error");
    } finally {
      setSending(false);
    }
  }

  async function decide(taskId: string, action: "approve" | "reject") {
    try {
      await post(`/tasks/${taskId}/${action}`, {});
      toast(action === "approve" ? "Approved — merging" : "Rejected — nothing merged", "success");
      setMessages((prev) =>
        prev.map((m) => (m?.meta?.approval === taskId ? { ...m, meta: { ...m.meta, approval: null } } : m))
      );
      if (IS_DEMO) setTimeout(load, 900);
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function toggleMic() {    if (recording) {
      recRef.current?.stop();
      return;
    }
    if (!voiceCfg?.stt) {
      toast("Voice input needs an ElevenLabs key on the server", "info");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const b64 = await new Promise<string>((resolve) => {
          const fr = new FileReader();
          fr.onloadend = () => resolve(String(fr.result).split(",")[1] ?? "");
          fr.readAsDataURL(blob);
        });
        try {
          const r = await post<any>("/voice/stt", { audio_base64: b64, mime: blob.type });
          if (r?.text) setInput((v) => (v ? v + " " : "") + r.text);
        } catch (e: any) {
          toast(e?.message ?? "Could not transcribe", "error");
        }
        setRecording(false);
      };
      recRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      toast("Microphone unavailable", "error");
    }
  }

  if (!ready || loading) return <Skeleton h={420} r={12} />;
  if (!activeProject) return null;

  const lastIsUser = messages.length > 0 && messages[messages.length - 1].role === "user";

  return (
    <div className="card" style={{ display: "flex", flexDirection: "column", height: guest ? "calc(100dvh - 100px)" : "min(70vh, 720px)", padding: 0, overflow: "hidden" }}>
      <div ref={scroller} className="chat scroll" style={{ flex: 1, padding: 16 }}>
        {messages.length === 0 && (
          <div className="empty" style={{ margin: "auto", textAlign: "center", maxWidth: 380 }}>
            <div className="strong" style={{ fontFamily: "var(--display)", fontSize: 19, letterSpacing: "-0.01em" }}>
              {guest ? "What should we make?" : "What are we making?"}
            </div>
            <div className="small muted" style={{ marginTop: 6 }}>
              {guest
                ? "Type what you want. Your helper makes it."
                : "Ask in your own words. Your helper builds it, then you decide whether it goes in."}
            </div>
          </div>
        )}
        {messages.map((m) => {
          const isUser = m.role === "user";
          if (m?.meta?.approval) {
            return (
              <div key={m.id} className="signoff" role="group" aria-label="Approval needed">
                <div className="signoff-title">Ready to merge</div>
                <div className="signoff-copy">Your helper finished. Approve to add it to the project, or keep it out.</div>
                <div className="signoff-actions">
                  <button className="btn btn-sm btn-success" onClick={() => decide(m.meta.approval, "approve")}>
                    Approve &amp; merge
                  </button>
                  <button className="btn btn-sm" onClick={() => decide(m.meta.approval, "reject")}>
                    Keep it out
                  </button>
                </div>
              </div>
            );
          }
          return (
            <div key={m.id} className={`msg ${isUser ? "msg-user" : "msg-agent"}`}>
              {!isUser && <div className="tiny dim" style={{ marginBottom: 3 }}>helper</div>}
              <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
            </div>
          );
        })}
        {streaming ? (
          <div className="msg msg-agent">
            <div className="tiny dim" style={{ marginBottom: 3 }}>{status || "helper"}</div>
            <div style={{ whiteSpace: "pre-wrap" }}>
              {streaming}
              <span style={{ opacity: 0.5 }}> ▍</span>
            </div>
          </div>
        ) : status || lastIsUser ? (
          <div className="msg msg-agent">
            <span className="tiny dim">{status || "Working…"}</span>
          </div>
        ) : null}
      </div>
      <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
        {speak && audioBlocked && (
          <button className="audio-unlock" onClick={playPending}>
            Tap to hear the reply
          </button>
        )}
        {(!guest || voiceCfg?.configured) && (
          <div className="row wrap" style={{ gap: 8, marginBottom: 8, alignItems: "center" }}>
            {!guest && (
              <WmTabs
                id="mode"
                tabs={[
                  { id: "build", label: "Build" },
                  { id: "learn", label: "Learn" },
                  { id: "review", label: "Review" },
                ]}
                value={mode}
                onChange={(m) => setMode(m as Mode)}
              />
            )}
            <span className="spacer" />
            {voiceCfg?.tts && (
              <button
                className="pill"
                onClick={() => {
                  const next = !speak;
                  if (!next) {
                    audioRef.current?.pause();
                    setSpeaking(false);
                    if (pendingAudio.current?.url) URL.revokeObjectURL(pendingAudio.current.url);
                    pendingAudio.current = null;
                    setAudioBlocked(false);
                  } else {
                    primeAudio();
                    setTimeout(playPending, 150);
                  }
                  setSpeak(next);
                  try {
                    localStorage.setItem("crewcode_speak", next ? "1" : "0");
                  } catch {}
                }}
                aria-pressed={speak}
                style={{ cursor: "pointer", background: speak ? "var(--accent-soft)" : undefined, borderColor: speak ? "var(--accent)" : undefined }}
                title={speak ? "Stop reading replies aloud" : "Read replies aloud"}
              >
                {speaking
                  ? "Speaking…"
                  : speak
                    ? guest
                      ? "Hearing replies"
                      : "Reading aloud"
                    : guest
                      ? "Hear replies"
                      : "Read aloud"}
              </button>
            )}
            {voiceCfg?.stt && (
              <button className="pill" onClick={toggleMic} style={{ cursor: "pointer", color: recording ? "var(--danger)" : undefined }} title="Talk instead of typing">
                {recording ? "Stop listening" : "Talk"}
              </button>
            )}
            {!guest && voiceCfg && !voiceCfg.configured && (
              <Link className="voice-link" href="/settings">
                Add a voice
              </Link>
            )}
          </div>
        )}
        <WmAskBar
          value={input}
          onChange={setInput}
          onSubmit={send}
          loading={sending}
          placeholder={guest ? "What should we make?" : PLACEHOLDER[mode]}
        />
        {!guest && <div className="tiny dim" style={{ marginTop: 8 }}>{MODE_HELP[mode]}</div>}
      </div>
    </div>
  );
}
