import express from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { tasksRouter } from "./routes/tasks.js";
import { projectsRouter } from "./routes/projects.js";
import { capsRouter } from "./lib/capabilities.js";
import { githubRouter } from "./routes/github.js";
import { previewsRouter } from "./routes/previews.js";
import { connectionsRouter } from "./routes/connections.js";
import { authRouter } from "./routes/auth.js";
import { billingRouter } from "./routes/billing.js";
import { stripeRouter } from "./routes/stripe-webhook.js";
import { eventsRouter } from "./routes/events.js";
import { rollbackRouter } from "./routes/rollback.js";
import { orgsRouter } from "./routes/orgs.js";
import { auditRouter } from "./routes/audit.js";
import { taskDetailRouter } from "./routes/task-detail.js";
import { agentRouter } from "./routes/agent.js";
import { meteringRouter } from "./routes/metering.js";
import { rollbackDiffRouter } from "./routes/rollback-diff.js";
import { orgMembersRouter } from "./routes/org-members.js";
import { templatesRouter } from "./routes/templates.js";
import { auditFilterRouter } from "./routes/audit-filter.js";
import { notifySettingsRouter } from "./routes/notify-settings.js";
import { orgBillingRouter } from "./routes/org-billing.js";
import { artifactsRouter } from "./routes/artifacts.js";
import { stripeMetersRouter } from "./routes/stripe-meters.js";
import { userBillingRouter } from "./routes/user-billing.js";
import { apiKeysRouter } from "./routes/api-keys.js";
import { deploymentsRouter } from "./routes/deployments.js";
import { projectsSettingsRouter } from "./routes/project-settings.js";
import { rateLimitRouter } from "./routes/rate-limits.js";
import { taskPriorityRouter } from "./routes/task-priority.js";
import { deploymentStatusRouter } from "./routes/deployment-status.js";
import { costExportRouter } from "./routes/cost-export.js";
import { clerkAuthMiddleware } from "./lib/clerk.js";
import { usageEventsRouter } from "./routes/usage-events.js";
import { taskEventsStreamRouter } from "./routes/task-events-stream.js";
import { costOptimizerRouter } from "./routes/cost-optimizer.js";
import { githubWebhookRouter } from "./routes/github-webhook.js";
import { clerkTestRouter } from "./routes/clerk-test.js";
import { semanticRouteRouter } from "./routes/semantic-route.js";
import { agentActivityRouter } from "./routes/agent-activity.js";
import { costHistoryRouter } from "./routes/cost-history.js";
import { systemHealthRouter } from "./routes/system-health.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { taskRetryRouter } from "./routes/task-retry.js";
import { orgDashboardRouter } from "./routes/org-dashboard.js";
import { shareRouter } from "./routes/share.js";
import { joinHandler } from "./routes/share.js";
import { setupRouter } from "./routes/setup.js";
import { threadsRouter } from "./routes/threads.js";
import { notesRouter } from "./routes/notes.js";
import { crewRouter } from "./routes/crew.js";
import { passportRouter } from "./routes/passport.js";
import { voiceRouter } from "./routes/voice.js";
import { approvalsRouter } from "./routes/approvals.js";
import { safetyRouter } from "./routes/safety.js";
import { agentsRouter } from "./routes/agents.js";
import { providerRouter } from "./routes/provider.js";
import { requireAuth } from "./lib/auth.js";
import { rateLimit } from "./lib/ratelimit.js";





export function createApp() {
  const app = express();
  app.use(cors());

  const api = express.Router();

  
  api.use("/stripe", stripeRouter);
  api.use(express.json({ limit: "1mb" }));

  
  api.use((req, _res, next) => {
    if (req.query && typeof req.query === "object") {
      for (const k of Object.keys(req.query)) {
        if ((req.query as any)[k] === "") delete (req.query as any)[k];
      }
    }
    next();
  });

  api.get("/health", (_req, res) => res.json({ ok: true, service: "crewcode-api", time: new Date().toISOString() }));
  
  api.post("/share/join", joinHandler);
  api.use(clerkAuthMiddleware);
  api.use(requireAuth);
  api.use(rateLimit);
  api.use("/cost-export", costExportRouter);
  api.use("/usage-events", usageEventsRouter);
  api.use("/tasks", taskEventsStreamRouter);
  api.use("/cost-optimizer", costOptimizerRouter);
  api.use("/auth/clerk", clerkTestRouter);
  api.use("/semantic-route", semanticRouteRouter);
  api.use("/agent-activity", agentActivityRouter);
  api.use("/cost-history", costHistoryRouter);
  api.use("/health", systemHealthRouter);
  api.use("/dashboard", dashboardRouter);
  api.use("/tasks", taskRetryRouter);
  api.use("/org-dashboard", orgDashboardRouter);
  api.use("/share", shareRouter);
  api.use("/threads", threadsRouter);
  api.use("/notes", notesRouter);
  api.use("/crew", crewRouter);
  api.use("/passport", passportRouter);
  api.use("/voice", voiceRouter);
  api.use("/safety", safetyRouter);
  api.use("/tasks", approvalsRouter);
  api.use("/setup", setupRouter);
  api.use("/agents", agentsRouter);
  api.use("/provider", providerRouter);
  
  api.use("/github/webhook", githubWebhookRouter);
  api.use("/orgs", orgsRouter);
  api.use("/audit", auditRouter);
  api.use("/billing", billingRouter);
  api.use("/events", eventsRouter);
  api.use("/rollback", rollbackRouter);
  api.use("/agent", agentRouter);
  api.use("/metering", meteringRouter);
  api.use("/rollback/diff", rollbackDiffRouter);
  api.use("/orgs/:id/members", orgMembersRouter);
  api.use("/templates", templatesRouter);
  api.use("/audit/filter", auditFilterRouter);
  api.use("/notify-settings", notifySettingsRouter);
  api.use("/org-billing", orgBillingRouter);
  api.use("/artifacts", artifactsRouter);
  api.use("/stripe/meters", stripeMetersRouter);
  api.use("/user-billing", userBillingRouter);
  api.use("/api-keys", apiKeysRouter);
  api.use("/deployments", deploymentsRouter);
  api.use("/projects", projectsSettingsRouter);
  api.use("/rate-limits", rateLimitRouter);
  api.use("/tasks", taskPriorityRouter);
  api.use("/deployments", deploymentStatusRouter);
  api.use("/projects", projectsRouter);
  api.use("/capabilities", capsRouter);
  api.use("/github", githubRouter);
  api.use("/previews", previewsRouter);
  api.use("/connections", connectionsRouter);
  api.use("/auth", authRouter);
  api.use("/tasks/:id", taskDetailRouter);
  api.use("/tasks", tasksRouter);

  app.use("/api", api);

  
  
  
  const webOut = resolve(process.cwd(), process.env.WEB_OUT ?? "apps/web/out");
  const webBuilt = existsSync(join(webOut, "index.html"));
  if (webBuilt) {
    app.use(express.static(webOut, { index: false }));
    app.get("*", (req, res, next) => {
      let rel = "";
      try {
        rel = decodeURIComponent(req.path).replace(/^\//, "");
      } catch {
        rel = req.path.replace(/^\//, "");
      }
      
      
      if (!rel) return res.sendFile(join(webOut, "index.html"));
      if (!String(req.headers.accept ?? "").includes("text/html")) return next();
      const file = join(webOut, `${rel}.html`);
      if (existsSync(file)) return res.sendFile(file);
      next();
    });
  }

  app.use(api); 

  if (!webBuilt) {
    app.get("/", (_req, res) =>
      res.status(200).json({
        ok: true,
        service: "crewcode",
        note: "web UI not built yet — run: npm run build -w crewcode-web",
        api: "/api/health",
      })
    );
  }

  return { app, webBuilt };
}
