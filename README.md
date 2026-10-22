# Personal AI

A bring-your-own-key personal assistant powered by **Claude Haiku 5.5**, with local persistence and PWA support.

## Stack

- React + Vite + TypeScript
- Tailwind CSS
- Anthropic TypeScript SDK (`@anthropic-ai/sdk`), called directly from the browser
- IndexedDB for the API key, conversations, documents, reminders, memory, and usage
- PWA (installable, offline shell via service worker) and an optional Capacitor Android build

## Getting started

```bash
npm install
npm run generate:icons
npm run dev
```

Open `http://localhost:5173`.

## Usage

1. Create an API key in the [Claude Console](https://platform.claude.com/settings/keys).
2. Open **Settings → API**, paste the key, and tap **Save key** (optionally **Test key**).
3. Start chatting. Web search is on by default; toggle it from the **+** menu or Settings → API.

The key is stored locally in IndexedDB and sent directly from your browser to `api.anthropic.com` — there is no backend. Treat the device as trusted, and consider a dedicated workspace key with a spend limit set in the Console.

## Model and costs

Every request uses `claude-haiku-5-5` ($0.10 / $0.50 per million input / output tokens for prompts up to 100K tokens; cache reads $0.01). Web search costs $10 per 1,000 searches; web fetch costs tokens only.

The app keeps costs down with prompt caching, a bounded chat history (older messages are archived into memory), capped web lookups, and on-device image downscaling. **Settings → Usage** shows estimated cost per reply, daily and monthly totals, and lets you set local spending limits. Those limits only apply inside this app; set a hard limit on the Console's billing page as well.

## Build

```bash
npm run build
npm run preview
```

## Android app (Capacitor)

Background reminders use Capacitor Local Notifications when running as the native Android app (the installed PWA cannot reliably fire alerts while closed).

### Prerequisites

- [Android Studio](https://developer.android.com/studio)
- JDK 17+

### Build and run

```bash
npm run build:android
npm run cap:open:android
```

In Android Studio: **Run** on a device or emulator. On first launch, open **Settings → App → Enable notifications** so scheduled reminders can alert while the app is closed.

To ship an APK/AAB: **Build → Generate Signed Bundle / APK**.

The web/PWA build for GitHub Pages still uses `VITE_BASE_PATH=/personal-ai/` via CI. The Android build uses `VITE_BASE_PATH=/` (set in `build:android`).

## Project structure

```text
src/
  components/     Chat UI and shared components
  hooks/          Conversation and preference hooks
  layout/         App shell and navigation
  pages/          Route pages
  providers/      Shared React context
  services/       Claude API client, chat loop, tools, usage tracking
  storage/        IndexedDB layer
```
