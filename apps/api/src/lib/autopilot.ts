








import { query } from "./db.js";
import { existsSync, rmSync } from "node:fs";



const STUCK_MIN = 10;
const MAX_REQUEUES = 3;
const MAX_RESCUES = 2;
const FRESH_HRS = 24;
const JANITOR_HRS = 1;

export type PlanInput = {
  status: string;
  rescues: number;
  requeues: number;
  lastEventAgeMin: number;
  ageHrs: number;
  workdirExists: boolean;
  overBudget: boolean;
  hasPreview: boolean;
  
  
  lastCleanupFailAgeHrs: number | null;
};

export type PlanAction = "requeue" | "rescue" | "preview" | "cleanup";


export function planAction(s: PlanInput): PlanAction[] {
  const out: PlanAction[] = [];
  const terminal = s.status === "merged" || s.status === "blocked";
  if (s.ageHrs <= FRESH_HRS) {
    if (s.status === "merged" && !s.hasPreview) out.push("preview");
    if ((s.status === "running" || s.status === "testing") && s.lastEventAgeMin > STUCK_MIN && s.requeues < MAX_REQUEUES)
      out.push("requeue");
    if (s.status === "blocked" && !s.overBudget && s.workdirExists && s.rescues < MAX_RESCUES) out.push("rescue");
  }
  
  
  
  const cleanupReady = s.lastCleanupFailAgeHrs == null || s.lastCleanupFailAgeHrs > 6;
  if (terminal && s.ageHrs > JANITOR_HRS && s.workdirExists && cleanupReady && out.length === 0) out.push("cleanup");
  return out;
}

async function sweep() {
  const { redis, QUEUES } = await import("./queue.js");
  const { checkBudget } = await import("./budgets.js");
  const rows = await query<any>(
    `select t.id, t.status, t.created_at,
      (select count(*) from events e where e.task_id=t.id and e.type='autopilot_rescue')::int as rescues,
      (select count(*) from events e where e.task_id=t.id and e.type='autopilot_requeue')::int as requeues,
      (select max(e.created_at) from events e where e.task_id=t.id) as last_event_at,
      exists(select 1 from artifacts a where a.task_id=t.id and a.kind='preview') as has_preview,
      (select e.payload from events e where e.task_id=t.id and e.type='error' order by e.created_at desc limit 1) as last_error,
      (select max(e.created_at) from events e where e.task_id=t.id and e.type='autopilot_cleanup_failed') as last_cleanup_fail_at
    from tasks t
    where t.status in ('running','testing','blocked','merged')
    order by t.created_at desc limit 200`
  );
  const now = Date.now();
  const counts = { requeue: 0, rescue: 0, preview: 0, cleanup: 0, skip: 0 };
  for (const t of rows) {
    try {
      const workdir = `.crew/worktrees/${t.id}`;
      const lastEventAgeMin = t.last_event_at ? (now - new Date(t.last_event_at).getTime()) / 60000 : 1e9;
      let overBudget = /budget/i.test(JSON.stringify(t.last_error ?? ""));
      try {
        overBudget = overBudget || !(await checkBudget(t.id)).ok;
      } catch {}
      const actions = planAction({
        status: t.status,
        rescues: Number(t.rescues ?? 0),
        requeues: Number(t.requeues ?? 0),
        lastEventAgeMin,
        ageHrs: (now - new Date(t.created_at).getTime()) / 3600000,
        workdirExists: existsSync(workdir),
        overBudget,
        hasPreview: !!t.has_preview,
        lastCleanupFailAgeHrs: t.last_cleanup_fail_at
          ? (now - new Date(t.last_cleanup_fail_at).getTime()) / 3600000
          : null,
      });
      if (!actions.length) {
        counts.skip++;
        continue;
      }
      for (const a of actions) {
        if (a === "requeue" || a === "rescue") {
          await redis.rpush(QUEUES.mergeQueue, JSON.stringify({ taskId: t.id, retry: 0 }));
          await query(`insert into events (task_id, type, payload) values ($1,$2,$3)`, [
            t.id,
            a === "rescue" ? "autopilot_rescue" : "autopilot_requeue",
            JSON.stringify({ reason: a === "rescue" ? "blocked — retrying integration" : `silent >${STUCK_MIN}m` }),
          ]);
          counts[a]++;
        } else if (a === "preview") {
          try {
            const { deployPreview } = await import("./previews.js");
            await deployPreview(t.id, workdir);
            counts.preview++;
          } catch (e: any) {
            console.error(`[autopilot] preview failed for ${t.id}:`, String(e?.message ?? e).slice(0, 200));
          }
        } else if (a === "cleanup") {
          try {
            rmSync(workdir, { recursive: true, force: true });
            counts.cleanup++;
          } catch (e: any) {
            console.error(`[autopilot] cleanup failed for ${t.id} (retry in 6h):`, String(e?.message ?? e).slice(0, 200));
            await query(`insert into events (task_id, type, payload) values ($1,'autopilot_cleanup_failed',$2)`, [
              t.id,
              JSON.stringify({ message: String(e?.message ?? e).slice(0, 300) }),
            ]).catch(() => {});
          }
        }
      }
    } catch (e: any) {
      console.error(`[autopilot] task ${t.id} failed:`, String(e?.message ?? e).slice(0, 200));
    }
  }
  const total = counts.requeue + counts.rescue + counts.preview + counts.cleanup;
  if (total > 0)
    console.log(
      `[autopilot] sweep: ${counts.requeue} requeued, ${counts.rescue} rescued, ${counts.preview} previews, ${counts.cleanup} cleaned`
    );
}

export function startAutopilot() {
  if (process.env.AUTOPILOT === "0") {
    console.log("[autopilot] disabled (AUTOPILOT=0)");
    return;
  }
  console.log("[autopilot] on — stuck work retried, previews made, worktrees cleaned (AUTOPILOT=0 to disable)");
  setTimeout(() => sweep().catch((e) => console.error("[autopilot] sweep failed:", String(e?.message ?? e).slice(0, 300))), 15000);
  setInterval(() => sweep().catch((e) => console.error("[autopilot] sweep failed:", String(e?.message ?? e).slice(0, 300))), 60000);
}
