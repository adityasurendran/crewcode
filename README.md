# CrewCode

**Describe what you want. A crew of AI teammates builds it. You decide what lands.**

CrewCode is a local-first build studio. You talk to a helper in plain English, it
works in its own Git worktree, and the change waits for your approval before it
merges. One computer runs everything; friends join from a browser with a 6-digit
PIN.

## What it does

- **Build by chatting.** "Add a contact form", "make the header blue", "fix the
  signup bug" — your helper writes the code and explains what changed.
- **Nothing lands without you.** Every change arrives as an approval slip. Approve
  it to merge into the project, or keep it out.
- **Bring your crew.** Start a Cloudflare tunnel from the Share page and send a
  link plus PIN. Each friend gets their own helper and workspace.
- **Hear and speak replies.** Optional ElevenLabs voice reads answers aloud and
  turns speech into text.
- **Keep it local.** Projects are plain Git repos on your disk. Chats, settings,
  and keys stay in a local database.

## Requirements

- Node.js 20 or newer
- Git
- Docker Desktop (for the source setup; the packaged desktop app embeds its database)
- The `opencode` CLI: `npm i -g opencode-ai`
- An `opencode-go` API key (paste it in **Settings → Your helper's brain**)

## Quick start

```bash
git clone https://github.com/adityasurendran/crewcode.git
cd crewcode
npm install
docker compose up -d
npm run db:migrate
npm run build -w crewcode-web
```

Start the three processes in separate terminals:

```bash
npm run start         # web UI + API → http://localhost:4100
npm run worker:agent  # runs the helpers
npm run worker:merge  # approval + merge queue
```

Open http://localhost:4100, create a project, and add your key in Settings.

## Desktop app

The Electron app bundles the server, UI, and an embedded Postgres + Redis, so the
host does not need Docker.

```bash
npm install
npm run desktop:install
npm run build:opencode
npm run desktop:build
```

The build lands in `apps/desktop/release/`. It also expects Redis binaries in
`build/redis/`; Windows is the tested target.

## Share with a friend

1. Open a project and go to **Share**.
2. Click **Start sharing**. CrewCode starts a Cloudflare quick tunnel and shows a
   link and a 6-digit PIN.
3. Your friend opens the link, enters the PIN, and starts chatting.

Guests are scoped to that one project. They can chat, propose changes, and use
voice; they cannot see your other projects or keys. The host approves every
merge.

## Voice

Add an ElevenLabs key in **Settings → Voice (ElevenLabs)**. Replies can then be
read aloud, and **Talk** turns speech into a message. Without a key, chat works
normally and stays text-only.

## How it works

```text
you → chat → helper agent → its own Git worktree
                                │
                         edit, test, sync files
                                │
                         approval slip
                         ┌──────┴──────┐
                      approve       keep out
                         │
                   merge to main
```

Each project is a normal Git repository. Each teammate gets an isolated worktree,
so experiments never touch `main` until you say yes.

## Project layout

```text
apps/api       Express API, agent + merge workers, sharing, voice
apps/web       Next.js UI (static export, served by the API)
apps/desktop   Electron host with embedded Postgres + Redis
packages/      agent runtime, project graph, merge integrator
infra/         Postgres schema and migrations
templates/     starter projects
opencode-crew/ agent prompts and MCP server
```

## Configuration

Local defaults work out of the box. For different ports or database URLs, copy
`.env.example` to `.env`. Keys entered in the app are encrypted and stored on
your machine; they are only sent to the providers you choose.

## Status

CrewCode is an early, working build. The chat → worktree → approval → merge loop,
sharing, voice, and the desktop app all run. The repository also contains
hosted-SaaS pieces (orgs, billing, deploy hooks) that are not finished; the local
setup above does not depend on them.
