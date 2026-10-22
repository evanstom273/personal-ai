# Personal AI — project context for Cursor agents

Read this file at the start of a new agent run before making changes.

## Copy-paste starter prompt (for the user)

```
Read .cursor/PROJECT_CONTEXT.md first, then continue from where we left off.
Repo: evanstom273/personal-ai (renamed from PersonalDashboard).
Live site: https://evanstom273.github.io/personal-ai/
Deploy: merge to main → GitHub Actions publishes GitHub Pages automatically.
Use branch prefix cursor/<name>-6558, commit, push, open PR to main.
User prefers tabs for indentation, minimal diffs, and stacking work on one open PR when possible.
```

---

## What this is

**Personal AI** (package name: `personal-ai`) is a bring-your-own-key **Claude chat PWA** (Claude Haiku 5.5 only, since v3.0.0 — Gemini was removed).

- React + Vite + TypeScript + Tailwind
- **IndexedDB** for the API key, conversations, documents, library media, memories, reminders, usage
- Claude called **directly from the browser** via `@anthropic-ai/sdk` (`dangerouslyAllowBrowser`), no backend
- Installable PWA with service worker

---

## Repository & URLs

| Item | Value |
|------|--------|
| GitHub repo | `evanstom273/personal-ai` |
| Old name | `PersonalDashboard` (redirects still work for git) |
| **Live site (primary)** | https://evanstom273.github.io/personal-ai/ |
| Base path | `/personal-ai/` (set in GitHub Actions via `VITE_BASE_PATH`) |
| Vercel | Still connected but **Hobby rate-limited**; `vercel.json` only builds `main`, skips other branches |

**Deploy flow:** push/merge to `main` → workflow `.github/workflows/deploy-pages.yml` → GitHub Pages (~1–2 min).

**PWA note:** installed home-screen apps cache aggressively. After deploy, user may need to clear site data once. Branch `cursor/pwa-auto-update-6558` adds `skipWaiting` + auto-reload (may need merge).

---

## App structure

### Navigation (bottom nav)

Home · Chat · Library · Settings

| Route | Purpose |
|-------|---------|
| `/home` | Home hub |
| `/chat` | Conversations with Claude |
| `/library` | Tabs: Schedule, Projects, Documents |
| `/settings` | Tabs: Profile, Memory, API, Usage, Voice, App |
| `/memory` | Linked from Settings |

### Theme

Dark blue-black UI (`#0E1016` background, glass/surface panels).

### Key directories

```text
src/
  components/chat/       Chat UI, markdown, messages, input
  components/schedule/   Reminder UI (Library → Schedule)
  hooks/                 Chat, reminders, TTS, speech, etc.
  layout/                AppShell, BottomNav
  pages/                 Route pages
  providers/             ChatProvider (chat + reminders + TTS wiring)
  services/claude/       API client, chat loop, tools, prompts, pricing
  services/reminders/    Reminder CRUD, scheduler, OS notification triggers
  storage/               IndexedDB (db v7; name is still `gemini-chat` to keep existing data)
public/
  notification-sw.js     Notification click handler (imported by Workbox)
```

---

## Major features already shipped (on `main`)

### UI overhaul
- Bottom nav, Home page, Library tabs, Settings tabs
- Dark theme refresh

### Reminders & schedule
- IndexedDB `reminders` store
- Library → **Schedule** tab for manual CRUD
- Claude tools: `list_reminders`, `create_reminder`, `update_reminder`, `delete_reminder`
- In-app scheduler (30s poll + on visibility change) posts assistant chat message + notification when due
- System time injected via `scheduleContext.ts`

### PWA background reminders (Android Chrome)
- `Notification Triggers API` (`TimestampTrigger`) in `reminderNotificationTriggers.ts`
- Syncs OS-level scheduled notifications when reminders change
- Tap notification → `/chat?reminderFire=…` → posts chat message
- Requires: installed PWA, notifications enabled, Chrome on Android
- Fallback: in-app scheduler while app is open

### Chat UX (PR #41 merged)
- Input placeholder: **Message…** only
- Textarea auto-expands with content
- **No auto-scroll** while assistant reply streams
- Scroll-to-bottom arrow when not at latest message
- Scroll position preserved when switching bottom-nav tabs (sessionStorage)

---

## Git / agent workflow

- **Base branch:** `main`
- **Feature branches:** `cursor/<descriptive-name>-6558` (lowercase, suffix `-6558`)
- **Push:** `git push -u origin <branch>`
- **PRs:** create/update PR to `main` (ManagePullRequest or GitHub UI)
- **Build check:** `npm run build`

### User preferences
- Tabs for indentation (never spaces)
- Minimal scope — don't refactor unrelated code
- Prefer stacking on an **open PR** rather than opening many PRs
- Hard-refresh PWA after deploy when testing on phone

---

## Pending / not yet merged

| Branch | What |
|--------|------|
| `cursor/pwa-auto-update-6558` | Force service worker to activate new deploys + page reload |

---

## Known issues & gotchas

1. **Repo rename:** Cursor cloud environments were bound to `PersonalDashboard`. User reconnected to `personal-ai` for new agents.
2. **Vercel Hobby:** hit 100 deploys/day from agent preview builds. GitHub Pages is primary hosting now.
3. **PR creation:** was failing with `[unauthenticated]` on old repo linkage; should work after reconnecting to `personal-ai`.
4. **PWA cache:** user must clear site data once after big deploys until pwa-auto-update branch is merged.
5. **No backend yet:** all data is local per device. User wants **Supabase** eventually for cross-device sync + push — not started.

---

## Future direction (user intent)

- **Supabase** for account sync (laptop + phone), optional Web Push from a small backend
- **Capacitor/Android app** as fallback if PWA notification triggers don't work on user's device
- Custom domain later (requires paid domain); free URL is `evanstom273.github.io/personal-ai/`

---

## Quick commands

```bash
npm install
npm run generate:icons   # PWA icons from public/pwa-icon.svg
npm run dev              # http://localhost:5173
npm run build            # tsc + vite build
```
