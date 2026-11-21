import { Router } from "express";
import { verifyClerkJwt } from "../lib/clerk.js";
import { z } from "zod";

export const clerkTestRouter = Router();

// POST /auth/clerk/test {token} — verify a JWT against configured JWKS (live test)
clerkTestRouter.post("/test", async (req, res) => {
  const parsed = z.object({ token: z.string().min(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const claims = await verifyClerkJwt(parsed.data.token);
  if (!claims?.sub) return res.status(401).json({ ok: false, error: "invalid token" });
  res.json({ ok: true, claims });
});

// GET /auth/clerk/config — current JWKS config status
clerkTestRouter.get("/config", (_req, res) => {
  res.json({
    verifier: process.env.CLERK_JWT_VERIFIER ?? "dev",
    jwks_url: process.env.CLERK_JWKS_URL ?? null,
    mode: process.env.CLERK_JWKS_URL ? "rs256_jwks" : "decode_only",
  });
});
