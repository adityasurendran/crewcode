"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useApp } from "../providers";
import { get, post, del } from "../lib/api";
import { Button, Skeleton } from "../components/ui";
import { WmCopyButton } from "../components/wm/WmCopyButton";

function isPublicHost() {
  try {
    const h = window.location.hostname;
    return h !== "localhost" && h !== "127.0.0.1" && h !== "::1";
  } catch {
    return false;
  }
}

export default function Share() {
  const { activeProject, ready, guest, setGuest, refreshProjects, setActiveProject, toast } = useApp();
  const [publicHost, setPublicHost] = useState(false);
  const [tunnel, setTunnel] = useState<any>(null);
  const [shares, setShares] = useState<any[]>([]);
  const [pin, setPin] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [pinExpiry, setPinExpiry] = useState("");
  const [joinPin, setJoinPin] = useState("");
  const [joinErr, setJoinErr] = useState("");
  const [starting, setStarting] = useState(false);
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPublicHost(isPublicHost());
  }, []);

  const load = useCallback(async () => {
    if (!activeProject) return;
    try {
      const [t, s] = await Promise.all([
        get(`/share/tunnel/status`).catch(() => null),
        get<any[]>(`/share/list?project_id=${activeProject}`).catch(() => []),
      ]);
      if (t) setTunnel(t);
      setShares(Array.isArray(s) ? s : []);
    } finally {
      setLoading(false);
    }
  }, [activeProject]);

  useEffect(() => {
    if (publicHost && !guest) {
      setLoading(false);
      return;
    }
    load();
  }, [load, publicHost, guest]);

  
  useEffect(() => {
    if (!pin || tunnel?.ready) return;
    const id = setInterval(async () => {
      const t = await get<any>("/share/tunnel/status").catch(() => null);
      if (t) setTunnel(t);
      if (t?.ready) clearInterval(id);
    }, 2500);
    return () => clearInterval(id);
  }, [pin, tunnel?.ready]);

  async function createShare() {
    if (!activeProject) return toast("Pick a project first", "error");
    setStarting(true);
    try {
      const r = await post<any>("/share", { project_id: activeProject });
      setPin(r.pin);
      setShareUrl(r.share_url || `${r.tunnel_url}/share`);
      setPinExpiry(r.expires_at);
      toast("Sharing is on", "success");
      load();
    } catch (e: any) {
      toast(e?.message ?? "Sharing failed. Is cloudflared installed on this computer?", "error");
    } finally {
      setStarting(false);
    }
  }

  async function stopTunnel() {
    try {
      await post("/share/tunnel/stop", {});
      setTunnel({ ...(tunnel ?? {}), running: false, ready: false, url: null });
      setPin("");
      setShareUrl("");
      toast("Link stopped", "info");
    } catch (e: any) {
      toast(e?.message ?? "Could not stop the link", "error");
    }
  }

  async function join() {
    if (joinPin.trim().length !== 6) return toast("Enter the 6-digit PIN", "error");
    setJoining(true);
    setJoinErr("");
    try {
      const r = await post<any>("/share/join", { pin: joinPin.trim() });
      setGuest(r);
      setJoinPin("");
      if (r.project_id) setActiveProject(r.project_id);
      refreshProjects().catch(() => {});
      toast(`You joined ${r.project_name}`, "success");
      window.location.assign("/");
    } catch (e: any) {
      const message = e?.message ?? "That PIN did not work";
      setJoinErr(message);
      toast(message, "error");
    } finally {
      setJoining(false);
    }
  }

  if (!ready || (loading && !publicHost)) return <Skeleton h={300} r={12} />;

  
  if (publicHost && !guest) {
    return (
      <div className="friend-join">
        <div className="friend-join-card">
          <div className="friend-join-mark">C</div>
          <h1>Join your friend</h1>
          <p className="friend-join-lead">Type the 6-digit PIN they sent you.</p>
          <form
            className="friend-join-form"
            autoComplete="off"
            onSubmit={(e) => {
              e.preventDefault();
              join();
            }}
          >
            <input
              className="friend-pin"
              placeholder="000000"
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              data-bwignore="true"
              maxLength={6}
              value={joinPin}
              onChange={(e) => setJoinPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              aria-label="6-digit project PIN"
              autoFocus
            />
            {joinErr && <p className="friend-join-error">{joinErr}</p>}
            <Button type="submit" variant="primary" loading={joining} disabled={joinPin.length !== 6}>
              Join the project
            </Button>
          </form>
          <p className="friend-join-fine">No account. Nothing to install.</p>
        </div>
      </div>
    );
  }

  const live = !!tunnel?.running;
  const readyLink = !!tunnel?.ready;
  const hostView = !publicHost;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{publicHost && !guest ? "Join a project" : "Share"}</h1>
          <div className="page-sub">
            {publicHost && !guest
              ? "Enter the 6-digit PIN the host sent you."
              : "One computer runs everything. Friends join with a link and a 6-digit PIN."}
          </div>
        </div>
      </div>

      <div className={`share-grid${hostView ? "" : " share-grid-single"}`}>
        {hostView && (
          <section className="share-panel">
            <div className="share-panel-head">
              <h2>Invite your crew</h2>
              <span className={`share-state${readyLink ? " is-live" : live ? " is-warm" : ""}`}>
                <span className="dot" />
                {readyLink ? "Link is live" : live ? "Getting the link ready" : "Link is off"}
              </span>
            </div>
            <p className="share-lead">
              Friends open the link and type the PIN. They get their own helper, and nothing merges without a yes.
            </p>

            {tunnel && !tunnel.installed && (
              <div className="share-warn">
                The sharing tool is not installed on this computer. <Link href="/settings">Fix it in Settings</Link>.
              </div>
            )}

            {!guest && (
              <div className="share-actions">
                <Button variant="primary" onClick={createShare} loading={starting} disabled={!activeProject}>
                  {pin ? "Make a new PIN" : "Start sharing"}
                </Button>
                {live && (
                  <Button onClick={stopTunnel}>Stop the link</Button>
                )}
              </div>
            )}

            {pin && shareUrl && (
              <div className="share-pass">
                <div className="share-pass-main">
                  <div className="share-pass-kicker">PIN for friends</div>
                  <div className="share-pin" aria-label={`Share PIN ${pin}`}>
                    {pin.split("").map((d, i) => (
                      <span key={i}>{d}</span>
                    ))}
                  </div>
                  <div className="share-pass-expiry">Works until {new Date(pinExpiry).toLocaleString()}</div>
                </div>
                <div className="share-pass-stub">
                  <a className="share-link" href={shareUrl} target="_blank" rel="noreferrer">
                    {shareUrl}
                  </a>
                  <WmCopyButton
                    text={`${shareUrl}\nPIN: ${pin}`}
                    copyLabel="Copy link and PIN"
                    copiedLabel="Copied"
                    onCopied={() => toast("Copied link and PIN", "success")}
                  />
                </div>
              </div>
            )}

            {shares.filter((s) => !s.revoked).length > 0 && (
              <div className="share-open">
                <span>Open invites</span>
                {shares
                  .filter((s) => !s.revoked)
                  .map((s) => (
                    <span key={s.id} className="share-open-item">
                      until {new Date(s.expires_at).toLocaleDateString()}
                      <button
                        className="share-stop"
                        onClick={() => del(`/share/${s.id}`).then(load)}
                      >
                        stop
                      </button>
                    </span>
                  ))}
              </div>
            )}
          </section>
        )}

        <section className="share-panel">
          {guest ? (
            <>
              <div className="share-panel-head">
                <h2>You're in</h2>
                <span className="share-state is-live">
                  <span className="dot" />
                  Joined
                </span>
              </div>
              <p className="share-lead">
                You are working in <strong>{guest.project_name}</strong> as a guest. Your helper is your own, and the host
                approves changes.
              </p>
              <div className="share-actions">
                <Button variant="primary" onClick={() => (window.location.href = "/")}>
                  Open Chat
                </Button>
                <Button
                  onClick={() => {
                    setGuest(null);
                    toast("You left the shared project", "info");
                  }}
                >
                  Leave
                </Button>
              </div>
            </>
          ) : (
            <>
              <h2>Have a PIN?</h2>
              <p className="share-lead">Ask the host for the 6-digit PIN, then join the project here.</p>
              <div className="share-join-row">
                <input
                  className="share-pin-input"
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  name="project-pin"
                  maxLength={6}
                  value={joinPin}
                  onChange={(e) => setJoinPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  onKeyDown={(e) => e.key === "Enter" && join()}
                  aria-label="6-digit project PIN"
                />
                <Button variant="primary" onClick={join} loading={joining} disabled={joinPin.length !== 6}>
                  Join
                </Button>
              </div>
              {joinErr && <p className="share-error">{joinErr}</p>}
              <p className="share-fine">Joining opens the project in Chat with your own helper.</p>
            </>
          )}
        </section>
      </div>
    </>
  );
}
