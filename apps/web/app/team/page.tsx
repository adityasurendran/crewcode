"use client";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../providers";
import { get, post, del } from "../lib/api";
import { Button, Card, Empty, Skeleton, Avatar, Chip } from "../components/ui";

export default function Team() {
  const { ready, toast, owner } = useApp();
  const [orgs, setOrgs] = useState<any[]>([]);
  const [selected, setSelected] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("member");
  const [loading, setLoading] = useState(true);

  const loadOrgs = useCallback(async () => {
    try {
      const o = await get<any[]>("/orgs");
      setOrgs(o);
      if (!selected) setSelected(o[0]?.id ?? "");
    } catch {
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const loadMembers = useCallback(async () => {
    if (!selected) return;
    try {
      setMembers(await get<any[]>(`/orgs/${selected}/members`));
    } catch {}
  }, [selected]);

  useEffect(() => {
    loadOrgs();
  }, [loadOrgs]);
  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function createOrg() {
    if (!name.trim() || !email.trim()) return toast("Enter a name and owner email", "error");
    try {
      await post("/orgs", { name: name.trim(), owner_email: email.trim() });
      setName("");
      setEmail("");
      toast("Org created", "success");
      loadOrgs();
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function addMember() {
    if (!selected || !memberEmail.trim()) return;
    try {
      await post(`/orgs/${selected}/members`, { email: memberEmail.trim(), role: memberRole });
      setMemberEmail("");
      toast("Member added", "success");
      loadMembers();
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  async function removeMember(email: string) {
    try {
      await del(`/orgs/${selected}/members/${email}`);
      toast("Member removed", "success");
      loadMembers();
    } catch (e: any) {
      toast(e?.message ?? "Failed", "error");
    }
  }

  if (!ready) return <Skeleton h={300} r={12} />;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Team</h1>
          <div className="page-sub">Organizations group projects and control who can build.</div>
        </div>
      </div>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <Card title="Organizations">
          <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
            <input className="input" placeholder="Org name" value={name} onChange={(e) => setName(e.target.value)} style={{ flex: 1, minWidth: 130 }} />
            <input className="input" placeholder="Owner email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ flex: 1, minWidth: 150 }} />
            <Button variant="primary" onClick={createOrg}>
              Create
            </Button>
          </div>
          {loading ? (
            <Skeleton h={40} />
          ) : orgs.length === 0 ? (
            <Empty title="No organizations" hint="Create one to group your team's projects." />
          ) : (
            <div className="grid" style={{ gap: 8 }}>
              {orgs.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setSelected(o.id)}
                  className="row"
                  style={{
                    gap: 10,
                    padding: 11,
                    borderRadius: 10,
                    border: `1px solid ${selected === o.id ? "var(--accent)" : "var(--border)"}`,
                    background: selected === o.id ? "var(--accent-soft)" : "var(--surface)",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <div className="strong">{o.name}</div>
                    <div className="tiny dim mono">{o.id?.slice(0, 12)}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card title={selected ? "Members" : "Select an organization"}>
          {!selected ? (
            <Empty title="No org selected" hint="Pick an organization on the left." />
          ) : (
            <>
              <div className="row wrap" style={{ gap: 8, marginBottom: 12 }}>
                <input className="input" placeholder="teammate@email.com" value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
                <select className="select" value={memberRole} onChange={(e) => setMemberRole(e.target.value)} style={{ width: 110 }}>
                  <option value="member">member</option>
                  <option value="viewer">viewer</option>
                  <option value="owner">owner</option>
                </select>
                <Button onClick={addMember}>
                  Add
                </Button>
              </div>
              {members.length === 0 ? (
                <Empty title="No members" hint="Add teammates by email." />
              ) : (
                <div className="grid" style={{ gap: 6 }}>
                  {members.map((m) => (
                    <div key={m.email} className="row" style={{ gap: 10, padding: "8px 4px", borderBottom: "1px solid var(--border)" }}>
                      <Avatar name={m.email} size={26} />
                      <div style={{ minWidth: 0 }}>
                        <div className="strong small">{m.email}</div>
                      </div>
                      <span className="spacer" />
                      <Chip>{m.role}</Chip>
                      <button className="btn btn-sm btn-ghost" style={{ color: "var(--danger)" }} title="Remove" onClick={() => removeMember(m.email)}>
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </>
  );
}
