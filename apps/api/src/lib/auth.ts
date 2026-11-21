



import type { Request, Response, NextFunction } from "express";
import { createHash, randomBytes } from "node:crypto";
import { query } from "./db.js";

export function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export async function createProjectKey(projectId: string, createdBy: string) {
  const prefix = "ck_" + randomBytes(4).toString("hex");
  const secret = prefix + "_" + randomBytes(24).toString("hex");
  await query(`insert into project_api_keys (project_id, prefix, hash, created_by) values ($1,$2,$3,$4)`, [
    projectId,
    prefix,
    hashKey(secret),
    createdBy,
  ]);
  return { key: secret, prefix };
}

export async function verifyProjectKey(key: string): Promise<string | null> {
  const prefix = key.split("_").slice(0, 2).join("_");
  const rows = await query<any>(`select project_id, hash from project_api_keys where prefix=$1`, [prefix]).catch(() => []);
  const h = hashKey(key);
  const hit = rows.find((r) => r.hash === h);
  return hit ? hit.project_id : null;
}



export function decodeJwt(token: string): { sub?: string; org_id?: string; project_id?: string; exp?: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const j = JSON.parse(payload);
    if (j.exp && j.exp * 1000 < Date.now()) return null; 
    return j;
  } catch {
    return null;
  }
}



const GUEST_RULES: Array<[string, RegExp]> = [
  ["GET", /^\/projects$/],
  ["GET", /^\/threads(?:\/.*)?$/],
  ["POST", /^\/threads(?:\/.*)?$/],
  ["GET", /^\/notes$/],
  ["PUT", /^\/notes$/],
  ["GET", /^\/crew$/],
  ["PUT", /^\/crew$/],
  ["GET", /^\/passport(?:\/.*)?$/],
  ["GET", /^\/voice\/status$/],
  ["POST", /^\/voice\/(?:tts|stt)$/],
  ["GET", /^\/tasks(?:\/.*)?$/],
  ["POST", /^\/tasks\/[^/]+\/(?:approve|reject)$/],
  ["GET", /^\/events$/],
];

function guestAllowed(method: string, path: string) {
  return GUEST_RULES.some(([m, re]) => m === method && re.test(path));
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  
  const apiKey = (req.headers["x-api-key"] as string) ?? "";
  if (apiKey) {
    const pid = await verifyProjectKey(apiKey);
    if (pid) {
      (req as any).actor = `key:${pid}`;
      (req as any).projectId = pid;
      return next();
    }
    return res.status(401).json({ error: "invalid api key" });
  }

  
  const auth = (req.headers.authorization as string) ?? "";
  if (auth.startsWith("Bearer ")) {
    const claims = decodeJwt(auth.slice(7));
    if (claims?.sub) {
      (req as any).actor = claims.sub;
      (req as any).orgId = claims.org_id ?? null;
      (req as any).projectId = claims.project_id ?? null;
      return next();
    }
    return res.status(401).json({ error: "invalid or expired token" });
  }

  
  
  const guestToken =
    (req.headers["x-guest-token"] as string) ??
    (typeof req.query.guest_token === "string" ? req.query.guest_token : "") ??
    "";
  if (guestToken) {
    try {
      const { verifyGuestToken } = await import("./share.js");
      const g = await verifyGuestToken(guestToken);
      if (g) {
        const path = String(req.path || "");
        if (!guestAllowed(req.method, path)) {
          return res.status(403).json({ error: "that part of CrewCode is not available to guests" });
        }
        const target =
          (typeof req.query.project_id === "string" ? req.query.project_id : "") ||
          (typeof req.body?.project_id === "string" ? req.body.project_id : "");
        if (target && target !== g.project_id) {
          return res.status(403).json({ error: "this project is not shared with you" });
        }
        
        const tm = path.match(/^\/threads\/([0-9a-fA-F-]{20,})(?:\/|$)/);
        if (tm) {
          const row = (await query<any>(`select project_id from threads where id=$1`, [tm[1]]).catch(() => []))[0];
          if (!row || row.project_id !== g.project_id) {
            return res.status(403).json({ error: "this chat is not shared with you" });
          }
        }
        const km = path.match(/^\/tasks\/([0-9a-fA-F-]{20,})(?:\/|$)/);
        if (km) {
          const row = (await query<any>(`select project_id from tasks where id=$1`, [km[1]]).catch(() => []))[0];
          if (!row || row.project_id !== g.project_id) {
            return res.status(403).json({ error: "this change is not shared with you" });
          }
        }
        if (path === "/projects" && target && target !== g.project_id) {
          return res.status(403).json({ error: "project not shared" });
        }
        (req as any).actor = `guest:${g.share_id.slice(0, 8)}`;
        (req as any).projectId = g.project_id;
        (req as any).guest = true;
        (req as any).guestId = g.guest_id ?? g.share_id.slice(0, 8);
        return next();
      }
      return res.status(401).json({ error: "invalid or expired guest token — re-join with the PIN" });
    } catch {
      return res.status(401).json({ error: "guest verification failed" });
    }
  }

  
  
  const viaCloudflare = !!(req.headers["cf-ray"] || req.headers["cf-connecting-ip"]);
  if (viaCloudflare) {
    return res.status(401).json({ error: "enter the project PIN to join", join: "/share" });
  }
  if (process.env.ALLOW_ANON !== "false") {
    (req as any).actor = (req.headers["x-actor"] as string) ?? "anon-dev";
    return next();
  }
  return res.status(401).json({ error: "x-api-key or Authorization Bearer required" });
}
