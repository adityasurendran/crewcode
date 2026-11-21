import { Router } from "express";
import { z } from "zod";
import { getProviderSettings, setProviderSettings, clearProviderKey, buildProfile } from "../lib/opencode-profile.js";
import { audit } from "../lib/audit.js";

export const providerRouter = Router();


providerRouter.get("/", async (_req, res) => {
  res.json(await getProviderSettings());
});



providerRouter.post("/", async (req, res) => {
  const parsed = z
    .object({ provider: z.enum(["opencode-go"]), model: z.string().min(1), api_key: z.string().optional() })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json(parsed.error);
  const settings = await setProviderSettings(parsed.data);
  await audit(null, "host", "provider.configured", { provider: settings.provider, model: settings.model, has_key: settings.has_key });
  res.json(settings);
});


providerRouter.delete("/key", async (_req, res) => {
  await clearProviderKey();
  res.json({ ok: true });
});


providerRouter.get("/validate", async (_req, res) => {
  const s = await getProviderSettings();
  const crew = await buildProfile("crew");
  const integrator = await buildProfile("integrator");
  res.json({
    configured: !!s.provider && !!s.model,
    provider: s.provider,
    model: s.model,
    has_key: s.has_key,
    profiles: { crew: crew.path, integrator: integrator.path },
  });
});
