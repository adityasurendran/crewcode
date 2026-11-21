# CrewCode — Everyone builds. CrewCode integrates.

Production SaaS scaffold (Phase 0/1). Students + pro teams + non-technical builders.

## Layout

```
apps/api      Control plane: ~30 routes, workers, capabilities proxy, vault, billing
apps/web      Team UI: board, My Agent chat, orgs, audit, billing, deployments, settings
packages/worker-opencode  Headless OpenCode wrapper (SDK + shell fallback)
packages/graph            Project graph scan
packages/integrator       Merge queue: rebase → tsc → unit → browser → build
infra/schema.sql          Postgres source of truth
infra/migration-00*.sql   RLS, templates, notify, priority, etc.
templates/                 7 starter templates (Next, Vue, Svelte, Express, Flask, Django)
.github/workflows/ci.yml   Typecheck + build + unit tests on PR
```

## Run it (one server)

The UI and the API are a single server. `npm run build -w crewcode-web` emits a
static app to `apps/web/out`; the API serves that and `/api` on one port, so the
whole product is one process and one URL.

```powershell
docker compose up -d postgres redis
npm install
npm run db:migrate   # ordered schema + migrations 002..014 (uses DATABASE_URL)
npm run build -w crewcode-web   # -> apps/web/out
npm run start                   # :4100 serves web UI + api
npm run worker:agent            # terminal 2
npm run worker:merge            # terminal 3
```

Autopilot runs inside the API (on by default): stuck tasks get requeued,
blocked ones are rescued up to twice (budget-aware), merged work gets a
preview, and old worktrees are deleted. `AUTOPILOT=0` disables it. It never
promotes to prod and never touches budget-blocked tasks.

Open `http://localhost:4100`. One process, one tunnel target. If the app is built,
the server prints `(serving web UI + api)`.

## Development (separate servers, fast refresh)

```powershell
npm run dev:api      # :4100  api
npm run worker:agent # :3100-ish  worker
npm run worker:merge
npm run dev:web      # :3100  next dev (talks to :4100)
```


## Desktop app (Electron)

CrewCode also ships as a desktop app. The window is the host's cockpit; guests
still join over the tunnel/PIN in a browser. It boots the same one-server stack
(bundled), so there's nothing to start by hand.

```powershell
npm run desktop:install   # one-time: installs Electron into apps/desktop
npm run desktop           # dev: launches the app against the repo (tsx source)
npm run desktop:smoke     # headless check: boots the stack, serves the UI, exits
```

Build a packaged app (server + built UI bundled into the executable):

```powershell
npm run desktop:build     # -> apps/desktop/release/win-unpacked/CrewCode.exe
```

What's bundled vs. what the host still provides:
- **Bundled:** Electron runtime, the server (single-file bundle in
  `build/server/*.cjs`), the built web UI, the agent prompts + MCP server, the
  **opencode binary** (`build/opencode/`), and — for the no-Docker path — an
  **embedded Postgres** (`embedded-postgres`) and a **bundled Redis**
  (`build/redis/`).
- **Host-provided:** Git (for the merge flow) and opencode model auth. With the
  embedded datastore, Docker is **not** required.

### No Docker (embedded datastore)
The packaged app boots its own Postgres + Redis on local ports (no Docker
Desktop) and runs migrations on startup. Force the same in dev with:

```powershell
$env:CREW_EMBEDDED="1"; npm run desktop
```

Build the bundled assets first: `npm run build:opencode` (copies the opencode
binary) and `npm run build:server` (server + migrator).

`apps/desktop` is intentionally **not** an npm workspace, so its Electron
toolchain stays isolated from the rest of the monorepo.


## Setup — CrewCode installs itself

Open the web UI. The **Setup** panel at the top checks every prerequisite and
installs what's missing — no admin rights needed:

| Tool | How CrewCode gets it |
|---|---|
| Node.js 20+ | portable download into `.crew/bin` (win: single `node.exe`) |
| cloudflared | GitHub releases download into `.crew/bin` |
| opencode CLI | `npm i -g opencode-ai` |
| Git / Docker | detected + one-click guided command (these can need admin) |
| Postgres + Redis | one-click `docker compose up -d` via **Start DB** |

`.crew/bin` is prepended to `PATH` at API startup, so spawned `cloudflared` /
`opencode` resolve to the portable copies first. API surface:
`GET /setup/status`, `POST /setup/install {tool}`,
`POST /setup/install-all`, `POST /setup/db-up`.
Override versions with `NODE_PIN_VERSION`, binary with `CLOUDFLARED_BIN`.

## API surface (selected)

| Route | Purpose |
|---|---|
| `POST /tasks` | create task + sandbox + agent job |
| `POST /agent/chat` | My Agent natural-language follow-up |
| `GET /tasks/:id/detail` | task + events + artifacts |
| `POST /tasks/:id/done` | enqueue integration |
| `POST /capabilities/:tool` | MCP proxy (db/stripe/llm — keys never in prompt) |
| `POST /connections` | vault pointer CRUD (`env://`, `doppler://`, `aws-sm://`) |
| `GET /billing` `/org-billing` `/user-billing` | cost dashboards |
| `POST /metering` `/stripe/meters/events` | token usage → Stripe meters |
| `POST /rollback` + `GET /rollback/diff` | human-gated revert + preview |
| `POST /previews` | deploy preview (stub/local-docker/railway/fly) |
| `GET /deployments/:id/status` | poll Railway/Fly for live state |
| `POST /github/export` | draft PR from task branch |
| `GET /events/stream` | SSE live event feed |
| `GET /rate-limits` | Redis limit usage |
| `POST /orgs` + `/orgs/:id/members` | team management |
| `POST /api-keys` | project API keys (shown once) |
| `POST /templates` | create project from starter template |

## Security posture

- Secrets: vault pointers only (`env://`, `doppler://`, `aws-sm://`), resolved server-side, redacted in logs/audit.
- Agents: no git push, no deploy, no `.env` read. Capability proxy enforces per-task scopes.
- Budgets: per-task token caps + kill-switch (status → blocked).
- Rate limits: Redis sliding windows on tasks + capabilities.
- Audit: every capability call, deploy, rollback, key create/revoke, member change.
- Multi-tenant: Postgres RLS + `queryWithOrg` on projects/tasks/events/artifacts.
- Prod: approve gate required. Rollback human-only. Notifications (Slack) on done/blocked/merged.

## Architecture

```
Humans → Web UI → Control Plane (Express+Postgres+Redis)
                      ├─ Agent workers → OpenCode SDK/shell → sandbox (E2B/local)
                      ├─ Merge worker → integrator → semantic patch → merge → preview
                      ├─ Capabilities proxy → Vault → Stripe/Supabase/OpenAI
                      └─ Rollback / billing / orgs / audit
```

Git is hidden infrastructure (worktrees + branches internally). Users see tasks, not PRs — unless they want them (`/github/export`).

## Sharing — one host, PIN join (Live Share-style)

One computer runs CrewCode. Guests join from anywhere with a 6-digit PIN:

```
Host: click "Share → get PIN"
  → API spawns `cloudflared tunnel --url http://localhost:3100`
  → parses the https://xxx.trycloudflare.com URL from cloudflared logs
  → creates a PIN (sha256-hashed, single-project, expires in 8h default)
  → shows PIN + URL once

Guest: opens the tunnel URL → enters PIN
  → `POST /share/join` (5 failed attempts / 5 min per IP → 429)
  → gets a guest_token (Redis, TTL = share expiry) scoped to that project
  → `x-guest-token` header enforced in the auth chain
  → guests use tasks, chat, previews on the host — never see vault secrets
```

Host needs the `cloudflared` binary on PATH. `GET /share/tunnel/status` reports
installed/running state. Shares are listed per project and revokable. Every
share create/join/revoke is audited. PINs are never stored raw.

| Route | Purpose |
|---|---|
| `POST /share` | host creates PIN (auto-starts tunnel) |
| `POST /share/join` | guest enters PIN → guest_token + project |
| `DELETE /share/:id` | host revokes |
| `GET /share/tunnel/status` + `/start` + `/stop` | tunnel lifecycle |

## What's real vs stubbed

**Real:** OpenCode SDK sessions (auto-start), E2B live pull, Stripe checkout + meter events, Supabase PostgREST reads, OpenAI completions, Doppler + AWS SM vault, Railway + Fly GraphQL deploy, Clerk JWKS verify (RS256 when CLERK_JWKS_URL set), GitHub PR webhooks (signature-verified), RLS, budgets, rate limits, audit, orgs, billing, cost export, rollback, semantic conflict resolution with cost-optimizer model tiers, per-project cost mapping overrides, CI.

**Stubbed (clear TODOs):** Fly/Railway need service IDs via project settings; preview providers default to `stub`; semantic patch needs an `openai` connection; E2B needs `E2B_API_KEY`; SSO is project API keys + Clerk JWT path (swap-ready).

## API surface (selected)

| Route | Purpose |
|---|---|
| `POST /tasks` | create task + sandbox + agent job |
| `POST /agent/chat` | My Agent natural-language follow-up |
| `GET /tasks/:id/detail` + `/stream` | task + events + artifacts + SSE |
| `POST /capabilities/:tool` | MCP proxy (db/stripe/llm — keys never in prompt) |
| `POST /connections` | vault pointer CRUD (`env://`, `doppler://`, `aws-sm://`) |
| `GET /billing` `/org-billing` `/user-billing` `/cost-export` | cost dashboards + invoice export |
| `GET /cost-optimizer/tiers` `/route` + `PATCH /mapping` | model tier routing + per-project overrides |
| `POST /metering` `/stripe/meters/events` | token usage → Stripe meters |
| `POST /rollback` + `GET /rollback/diff` | human-gated revert + preview |
| `POST /previews` + `GET /deployments/:id/status` | deploy preview + poll Railway/Fly |
| `POST /github/export` + `POST /github/webhook` | draft PR + PR/push events (signature-verified) |
| `GET /events/stream` + `/usage-events` | SSE live feed + token usage |
| `GET /rate-limits` + `POST /orgs` + `/orgs/:id/members` | rate limits + team management |
| `POST /api-keys` + `POST /templates` | project keys (shown once) + starter templates |

## Next

- [ ] Wire Clerk/Auth.js JWT on top of `requireAuth`
- [ ] Real OpenCode server sessions in sandboxes (auto-start is in place)
- [ ] E2B live pull with real key (code path exists)
- [ ] Cost optimizer routing through more model tiers
- [ ] Per-org multi-project cost export for billing invoices
