type Msg = {
  id: string;
  role: "user" | "agent";
  content: string;
  created_at: string;
  meta?: Record<string, any>;
};

type CrewMember = {
  owner_id: string;
  role: string;
  experience: string;
  merged: number;
  messages: number;
  tasks: number;
};

const PROJECT_ID = "demo-bloom";
const THREAD_ID = "demo-thread";
const DEMO_OWNER = "Maya";

let seq = 0;
let taskSeq = 0;

function now() {
  return new Date().toISOString();
}

function minutesAgo(n: number) {
  return new Date(Date.now() - n * 60_000).toISOString();
}

const state: {
  messages: Msg[];
  notes: string;
  crew: CrewMember[];
  shares: any[];
  approvalLive: boolean;
  taskStatus: string;
  projectName: string;
  tunnelLive: boolean;
} = {
  projectName: "Bloom Studio",
  messages: [
    {
      id: "demo-welcome",
      role: "agent",
      content:
        "Welcome to the CrewCode demo. This is a sample project called Bloom Studio. Ask for a change, or approve the slip below to see how a merge works.",
      created_at: minutesAgo(9),
    },
    {
      id: "demo-user-1",
      role: "user",
      content: "Make the hero warmer and add a contact form.",
      created_at: minutesAgo(7),
    },
    {
      id: "demo-agent-1",
      role: "agent",
      content:
        "I warmed up the hero palette and added a contact section with name, email, and message fields. The layout still works on mobile. Two files changed: app/page.tsx and app/globals.css.",
      created_at: minutesAgo(6),
    },
    {
      id: "demo-approval-1",
      role: "agent",
      content: "Ready to merge",
      created_at: minutesAgo(5),
      meta: { approval: "demo-task-1" },
    },
  ],
  notes:
    "Launch checklist\n- Hero copy: warmer, less corporate\n- Contact form: name, email, message\n- Mobile check before Friday\n- Ask Leo to review the new section\n",
  crew: [
    { owner_id: "Maya", role: "product", experience: "beginner", merged: 3, messages: 18, tasks: 4 },
    { owner_id: "Leo", role: "frontend", experience: "intermediate", merged: 5, messages: 31, tasks: 7 },
    { owner_id: "Ada", role: "designer", experience: "advanced", merged: 2, messages: 12, tasks: 3 },
  ],
  shares: [],
  approvalLive: true,
  taskStatus: "awaiting_approval",
  tunnelLive: false,
};

function replyFor(text: string): string {
  const t = text.toLowerCase();
  if (/contact|form/.test(t)) {
    return "Added a contact section with name, email, and message fields, plus a small success state after sending. It is ready for your review.";
  }
  if (/blue|color|colour|header|palette/.test(t)) {
    return "Changed the header to a deep blue and adjusted the nav text for contrast. The rest of the palette is untouched.";
  }
  if (/hero|headline|copy/.test(t)) {
    return "Rewrote the hero around one clear promise and shortened the subheading. The new copy is staged in the sample project.";
  }
  if (/mobile|phone|responsive/.test(t)) {
    return "Tightened the mobile spacing, stacked the contact fields, and checked the hero at 390px. Nothing overlaps now.";
  }
  if (/hi|hello|hey/.test(t)) {
    return "Hey! This is the demo helper. Ask for a design change, or approve the slip above to see the merge step.";
  }
  if (/deploy|publish|ship/.test(t)) {
    return "I staged that change. In the real app, merging updates the project's main branch; publishing to a live URL is a separate step you control.";
  }
  const short = text.trim().slice(0, 90);
  return `I staged that in the sample project: "${short}". This demo does not run a real model, but in the app you would get an approval slip before anything merged.`;
}

function addAgentReply(text: string) {
  state.messages.push({
    id: `demo-agent-${++seq}`,
    role: "agent",
    content: replyFor(text),
    created_at: now(),
  });
  if (!state.approvalLive) {
    state.messages.push({
      id: `demo-approval-${++seq}`,
      role: "agent",
      content: "Ready to merge",
      created_at: now(),
      meta: { approval: `demo-task-${++taskSeq + 10}` },
    });
    state.approvalLive = true;
    state.taskStatus = "awaiting_approval";
  } else {
    state.taskStatus = "merged";
  }
}

function passportFor(who: string) {
  const member = state.crew.find((m) => m.owner_id.toLowerCase() === who.toLowerCase()) ?? state.crew[0];
  const contributions =
    member.owner_id === "Maya"
      ? [
          { task_id: "demo-t1", title: "Warm hero palette and copy", mode: "build", files: ["app/page.tsx", "app/globals.css"], status: "merged" },
          { task_id: "demo-t2", title: "Contact form with success state", mode: "build", files: ["app/contact/page.tsx", "app/contact/actions.ts"], status: "merged" },
          { task_id: "demo-t3", title: "Mobile spacing pass", mode: "review", files: [], status: "testing" },
        ]
      : [
          { task_id: "demo-t4", title: "Navigation rebuild", mode: "build", files: ["app/layout.tsx", "app/nav.tsx"], status: "merged" },
          { task_id: "demo-t5", title: "Image loading check", mode: "review", files: [], status: "merged" },
        ];
  return {
    profile: { role: member.role, experience: member.experience },
    stats: {
      merged: member.merged,
      tasks: member.tasks,
      messages: member.messages,
      files: member.owner_id === "Maya" ? 7 : 4,
    },
    skills: [
      { name: "React", evidence: member.merged + 2 },
      { name: "CSS & layout", evidence: member.messages > 20 ? 4 : 3 },
      { name: "Product writing", evidence: 2 },
      { name: "Testing", evidence: 1 },
    ],
    disclaimer: "This is a demo passport. The counts and entries are sample data.",
    contributions,
  };
}

function jsonBody(init: RequestInit): any {
  try {
    return init.body ? JSON.parse(String(init.body)) : {};
  } catch {
    return {};
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function siteOrigin() {
  return typeof window !== "undefined" ? window.location.origin : "https://crewcode-demo.vercel.app";
}

export async function demoApi(path: string, init: RequestInit = {}): Promise<any> {
  const url = new URL(path, "https://demo.crewcode.local");
  const p = url.pathname;
  const method = (init.method ?? "GET").toUpperCase();
  const body = jsonBody(init);

  if (p === "/projects" && method === "GET") {
    return [{ id: PROJECT_ID, name: state.projectName, created_at: minutesAgo(30) }];
  }

  if (p === "/projects" && method === "POST") {
    return { id: PROJECT_ID, name: body.name || state.projectName, created_at: now() };
  }

  if (p.startsWith("/projects/") && method === "DELETE") {
    return { ok: true };
  }

  if (p === "/threads" && method === "GET") {
    return {
      thread: { id: THREAD_ID },
      messages: state.messages,
      latest_task: { id: "demo-task", status: state.taskStatus },
    };
  }

  if (p === "/threads/message" && method === "POST") {
    const text = String(body.message ?? "").trim();
    state.messages.push({ id: `demo-user-${++seq}`, role: "user", content: text, created_at: now() });
    state.taskStatus = "running";
    setTimeout(() => addAgentReply(text), 850);
    return { ok: true };
  }

  if (/^\/tasks\/[^/]+\/(approve|reject)$/.test(p) && method === "POST") {
    const action = p.endsWith("/approve") ? "approve" : "reject";
    const taskId = decodeURIComponent(p.split("/")[2] ?? "");
    state.messages = state.messages.filter((m) => m.meta?.approval !== taskId);
    state.approvalLive = false;
    state.messages.push({
      id: `demo-agent-${++seq}`,
      role: "agent",
      content:
        action === "approve"
          ? "Merged into main. The warmer hero and the contact form are now part of the sample project."
          : "Kept it out. main is unchanged, and you can ask for a different version any time.",
      created_at: now(),
    });
    state.taskStatus = action === "approve" ? "merged" : "rejected";
    await sleep(350);
    return { ok: true, status: state.taskStatus };
  }

  if (p === "/voice/status") {
    return { configured: true, tts: false, stt: false, voices: [] };
  }

  if (p === "/notes" && method === "GET") {
    return { content: state.notes, updated_at: now() };
  }

  if (p === "/notes" && method === "PUT") {
    state.notes = String(body.content ?? "");
    return { ok: true, updated_at: now() };
  }

  if (p === "/crew" && method === "GET") {
    return state.crew;
  }

  if (p === "/crew" && method === "PUT") {
    const member = state.crew.find((m) => m.owner_id === body.owner_id);
    if (member) {
      member.role = body.role || member.role;
      member.experience = body.experience || member.experience;
    }
    return { ok: true };
  }

  if (p === "/crew/leave" && method === "POST") {
    state.crew = state.crew.filter((m) => m.owner_id !== body.owner_id);
    return { ok: true };
  }

  if (p === "/passport" && method === "GET") {
    return passportFor(url.searchParams.get("owner_id") || DEMO_OWNER);
  }

  if (p === "/setup/status") {
    return { tools: [{ name: "node", required: true, installed: true }, { name: "git", required: true, installed: true }] };
  }

  if (p === "/share/tunnel/status") {
    return {
      installed: true,
      running: state.tunnelLive,
      ready: state.tunnelLive,
      url: state.tunnelLive ? siteOrigin() : null,
      target: "demo",
    };
  }

  if (p === "/share/list" && method === "GET") {
    return state.shares.filter((s) => !s.revoked);
  }

  if (p === "/share" && method === "POST") {
    await sleep(650);
    const pin = "246810";
    const expires = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
    const origin = siteOrigin();
    const share = { id: `demo-share-${++seq}`, pin, expires_at: expires, revoked: false };
    state.tunnelLive = true;
    state.shares = [share, ...state.shares.filter((s) => !s.revoked)];
    return { pin, share_url: `${origin}/share?friend=1`, tunnel_url: origin, expires_at: expires };
  }

  if (p === "/share/tunnel/stop" && method === "POST") {
    state.tunnelLive = false;
    state.shares = [];
    return { ok: true };
  }

  if (p === "/share/join" && method === "POST") {
    if (String(body.pin ?? "").length !== 6) throw new Error("Enter the 6-digit PIN");
    return {
      guest_token: "demo-guest",
      project_id: PROJECT_ID,
      project_name: state.projectName,
      expires_at: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
    };
  }

  if (p.startsWith("/share/") && method === "DELETE") {
    const id = decodeURIComponent(p.split("/")[2] ?? "");
    state.shares = state.shares.filter((s) => s.id !== id);
    return { ok: true };
  }

  if (method === "GET") return {};
  return { ok: true };
}
