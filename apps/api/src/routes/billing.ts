import { Router } from "express";
import { z } from "zod";
import { projectBilling } from "../lib/billing.js";

export const billingRouter = Router();

// GET /billing?project_id= — totals + per-owner + per-task costs
billingRouter.get("/", async (req, res) => {
  const parsed = z.object({ project_id: z.string().uuid() }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: "project_id required" });
  res.json(await projectBilling(parsed.data.project_id));
});
