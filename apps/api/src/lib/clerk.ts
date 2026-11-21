// Clerk/Auth.js JWKS verify — real RS256 verification without @clerk/nextjs peer dep.
// Phase 1: decode-only when CLERK_JWT_VERIFIER != 'clerk' (dev).
// Phase 2: full RS256 JWKS verify when CLERK_JWKS_URL set — fetch keys, verify signature.
import { createPublicKey, createVerify, X509Certificate } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

type JwksKey = { kid: string; kty: string; n?: string; e?: string; x5c?: string[]; alg?: string };

let cachedKeys: { keys: JwksKey[]; fetchedAt: number } | null = null;

async function fetchJwks(): Promise<JwksKey[]> {
  const url = process.env.CLERK_JWKS_URL;
  if (!url) return [];
  const now = Date.now();
  if (cachedKeys && now - cachedKeys.fetchedAt < 3600_000) return cachedKeys.keys;
  const res = await fetch(url);
  if (!res.ok) return cachedKeys?.keys ?? [];
  const j: any = await res.json();
  cachedKeys = { keys: j.keys ?? [], fetchedAt: now };
  return cachedKeys.keys;
}

function base64urlToBuffer(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

function derToPublicKeyJwk(key: JwksKey): any {
  // Prefer x5c (cert PEM) — simplest cross-runtime path.
  if (key.x5c?.[0]) {
    const cert = new X509Certificate(Buffer.from(`-----BEGIN CERTIFICATE-----\n${key.x5c[0]}\n-----END CERTIFICATE-----`));
    return cert.publicKey;
  }
  if (key.kty === "RSA" && key.n && key.e) {
    return createPublicKey({
      key: { kty: "RSA", n: key.n, e: key.e },
      format: "jwk",
    });
  }
  return null;
}

export async function verifyClerkJwt(token: string): Promise<{ sub?: string; org_id?: string; project_id?: string } | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [hB64, pB64, sigB64] = parts;

  // Decode header/payload first (always).
  let header: any, payload: any;
  try {
    header = JSON.parse(base64urlToBuffer(hB64).toString("utf8"));
    payload = JSON.parse(base64urlToBuffer(pB64).toString("utf8"));
  } catch {
    return null;
  }
  if (payload.exp && payload.exp * 1000 < Date.now()) return null;

  // Dev fast-path: no JWKS configured → decode-only (still validates exp).
  const jwksUrl = process.env.CLERK_JWKS_URL;
  const verifierMode = process.env.CLERK_JWT_VERIFIER;
  if (!jwksUrl || verifierMode !== "clerk") {
    return { sub: payload.sub, org_id: payload.org_id, project_id: payload.project_id };
  }

  // Full RS256 verify against JWKS.
  try {
    const keys = await fetchJwks();
    const kid = header.kid;
    const key = keys.find((k) => k.kid === kid) ?? keys[0];
    if (!key) return null;
    const pub = derToPublicKeyJwk(key);
    if (!pub) return null;
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${hB64}.${pB64}`);
    const ok = verifier.verify(pub, base64urlToBuffer(sigB64));
    if (!ok) return null;
    return { sub: payload.sub, org_id: payload.org_id, project_id: payload.project_id };
  } catch {
    return null;
  }
}

export async function clerkAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  const auth = (req.headers.authorization as string) ?? "";
  if (!auth.startsWith("Bearer ")) return next();
  const claims = await verifyClerkJwt(auth.slice(7));
  if (claims?.sub) {
    (req as any).actor = claims.sub;
    (req as any).orgId = claims.org_id ?? null;
    (req as any).projectId = claims.project_id ?? null;
    return next();
  }
  return res.status(401).json({ error: "clerk token invalid" });
}
