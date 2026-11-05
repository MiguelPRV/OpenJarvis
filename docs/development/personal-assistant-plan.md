# Personal Assistant Roadmap

Audit of the current checkout against the goal of turning OpenJarvis into a
personal AI assistant that works across phone, tablet and computer, plus the
phased plan for getting there. Written from the source tree at the time of the
audit — re-check anything that looks stale before building on it.

---

## 1. What already exists

OpenJarvis is a local-first agent framework with a browser UI. Nothing here is
greenfield: most of the assistant capabilities already have an engine behind
them, and the work is largely wiring, persistence and presentation.

### Runtime shape

| Layer | Technology | Entry point |
|---|---|---|
| Backend | FastAPI + uvicorn, OpenAI-compatible API | `src/openjarvis/server/app.py` |
| Frontend | React 19 + Vite + Tailwind, PWA + Tauri desktop shell | `frontend/src/App.tsx` |
| Inference | Ollama, vLLM, MLX, cloud providers via OpenAI-compatible APIs | `src/openjarvis/engine/` |
| Storage | SQLite files under the OpenJarvis home dir | `~/.openjarvis/` (`OPENJARVIS_HOME`) |

The frontend talks to the API through `/v1/*` (HTTP + SSE at
`/v1/chat/completions`), `/v1/agents/events` (WebSocket) and `/api/*`.

### Capability map against the goal

**1. AI Assistant — largely present.**

- Streaming chat, tool calling, research timeline, tool-call cards:
  `frontend/src/components/Chat/`.
- Agent runtime with on-demand, scheduled and continuous agents:
  `src/openjarvis/agents/`, `src/openjarvis/operators/`.
- Conversation context: client-side. Conversations live in browser
  `localStorage` (`frontend/src/lib/store.ts`), so history, titles and the
  active conversation are per-browser and per-device.

**2. Voice Assistant — backends and UI exist, not enabled by default.**

- Speech-to-text backends: faster-whisper (local), OpenAI Whisper, Deepgram.
- Text-to-speech backends: Kokoro (local), OpenAI, ElevenLabs, Cartesia.
- UI: tap-to-talk `MicButton`, read-aloud `SpeakMessageButton`,
  `hooks/useSpeech.ts`, `hooks/useTts.ts`.
- Requires the `desktop` (STT) and/or `voice` (TTS) install extras plus a
  model download. Without them `/v1/speech/health` reports
  `"No speech backend configured"` and the mic is hidden/disabled.

**3. Personal Memory — two layers, both server-side.**

- *Fact memory* (`src/openjarvis/memory/`): background extraction of durable
  facts about the user into a small JSON store (`FactStore`), with trust levels
  and de-duplication. Facts are injected into the system context on each turn
  (`src/openjarvis/server/routes.py`, `tools/storage/context.py`).
- *Document memory / RAG* (`/v1/memory`): SQLite FTS5 (default) or FAISS,
  chunked ingestion with `/v1/memory/store|search|stats|config`.
- Settings exposes enable/top-k/min-score/token-budget controls
  (`SettingsPage.tsx`), and the memory service reports its real status.
- Gaps: no UI to browse, edit or delete individual facts, and the RAG backend
  needs the native `openjarvis_rust` extension (see §4).

**4. Dashboard — present, but it is a machine dashboard.**

- `DashboardPage.tsx` + `components/Dashboard/`: energy draw, token throughput,
  cloud-cost comparison, trace debugger. Useful for the local-first story, but
  it is not a personal workspace: no conversations, tasks, memories or quick
  actions.
- Layout is responsive with a mobile drawer (`components/Layout.tsx`,
  `Sidebar.tsx`) and ships dark/light themes.

**5. Integrations — a wide connector layer already exists.**

- Google: Gmail, Calendar, Tasks, Drive, Contacts (OAuth, `connectors/google_auth.py`).
- Apple: Calendar, Notes, Contacts, Health, Music (macOS only).
- Others: Outlook, IMAP, Slack, Discord, Notion, Obsidian, GitHub, Spotify,
  Strava, Oura, RSS/news, weather, Home Assistant-adjacent webhooks.
- Channels for talking to the assistant away from the desk: Slack (Socket
  Mode), Telegram, Discord, SendBlue (iMessage/SMS), email and others.
- All of these are opt-in and require the user's own credentials.

### Authentication and data boundary

- One shared bearer key (`OPENJARVIS_API_KEY`) gates `/v1/*`, `/api/*`, metrics
  and API docs; WebSockets authenticate through a subprotocol token
  (`server/auth_middleware.py`). Binding a non-loopback interface without a key
  is refused at startup.
- There are **no user accounts** and no per-user data partitioning: the server
  is single-tenant, which is correct for "runs on my machine" but is the main
  structural gap for multi-device use.

---

## 2. The real gap for the stated vision

1. **Multi-device has no sync story.** Conversations are in `localStorage`;
   memory, sessions and settings are per-instance. Phone + tablet + laptop today
   means three independent assistants.
2. **Memory is write-only from the user's point of view.** It is extracted and
   injected, but there is no screen to review, correct or delete what was
   learned — which is a trust requirement for personal data.
3. **The home screen is about the machine, not the person.** No agenda, tasks,
   recent threads, reminders or "what needs me" surface.
4. **Voice is assembled but off.** Backends exist; they are not installed,
   health-checked and surfaced as one hands-free mode.
5. **Integrations are broad but shallow for daily use.** Connector plumbing
   exists; the assistant-facing workflows (today's calendar, unread mail that
   matters, task capture) are not yet first-class.

---

## 3. Phased plan

Each phase is independently shippable and keeps existing behaviour intact.

### Phase 0 — Foundation (no new dependencies)

- Keep the audit findings current; treat the environment report in §4 as the
  known-good baseline.
- Fix regressions where a UI surface silently fails (for example, the system
  panel must send the API key, otherwise telemetry renders as zeros).
- Establish the mobile drawer default so phone visitors land on content, not on
  an overlay.

### Phase 1 — Memory you can see and control

- Add `GET/PATCH/DELETE /v1/memory/facts` over the existing `FactStore`.
- Build a "Memories" screen: list, search, edit, delete, pause extraction.
- Keep the existing enable/top-k/min-score controls; add provenance (when a
  fact was learned, from which conversation).
- No new services, no cost. This is the highest-trust-per-effort change.

### Phase 2 — Personal dashboard

- Extend `/dashboard` (or introduce a home route) with assistant-centric tiles:
  recent conversations, upcoming calendar events, open tasks, saved memories,
  and quick actions (new chat, voice, capture task).
- Reuse the existing design tokens, `components/ui/`, and keep the machine
  telemetry as a secondary tab rather than removing it.
- Mobile-first layout first, desktop enhancement second.

### Phase 3 — One coherent voice mode

- Install the `desktop`/`voice` extras, add the whisper model at build time, and
  surface `/v1/speech/health` status in Settings and next to the mic.
- Add a continuous conversation mode (VAD → STT → agent → TTS) on top of the
  existing `speech/voice_io.py` primitives, with a visible stop control.
- Local-only by default; cloud STT/TTS stay opt-in.

### Phase 4 — Cross-device continuity

Choose one, in order of effort:

1. **Sync without accounts (cheapest):** server-side conversation store
   (`/v1/conversations`) plus a shared access key per household; any device on
   the same server sees the same threads. Requires moving conversation state
   out of `localStorage`.
2. **Accounts + per-user isolation (bigger):** real identity, scoped storage
   per user, and revocable device tokens. Needed before exposing an instance to
   the internet or to more than one person.

Phase 4.1 is the recommended next step after Phases 1–2; it unlocks phone and
tablet use without inventing an auth system.

### Phase 5 — Daily integrations

- Ship opinionated, read-first workflows: "today" (calendar + tasks + weather),
  "inbox triage" (Gmail summaries with explicit send approval), task capture
  from chat and voice.
- Keep all writes behind the existing approval mechanism
  (`server/approval_routes.py`) — never auto-send mail or mutate calendars.

---

## 4. Environment notes (what the app needs to run fully)

| Capability | Requirement | Status without it |
|---|---|---|
| Chat with a local model | Ollama running, a model pulled (e.g. `qwen3:0.6b`) | Model list empty, chat unusable |
| Document memory (RAG) | Native `openjarvis_rust` extension (`maturin develop -m rust/crates/openjarvis-python/Cargo.toml`, rustc ≥ 1.88) | `/v1/memory/*` returns 503, memory UI shows "not configured" |
| Speech-to-text | `desktop` extra (faster-whisper) or a cloud STT key | `/v1/speech/health` unavailable, mic hidden |
| Text-to-speech | `voice` extra (Kokoro + espeak-ng) or a cloud TTS key | Read-aloud button unavailable |
| Google connectors | OAuth client id/secret for the user's own Google Cloud project | Connector buttons fail at the OAuth step |
| Messaging channels | Per-channel credentials (Slack app token, Telegram bot token, SendBlue keys) | Channels cannot be connected |

Nothing above requires a paid OpenAI/Anthropic subscription: local Ollama,
SQLite memory, Kokoro TTS and browser speech fallbacks cover the core loop.

---

## 5. Ground rules for the work

- Local-first remains the default; cloud calls stay explicit and opt-in.
- Personal data (facts, conversations, credentials) stays on the user's machine
  or their own server; no third-party analytics beyond the existing, consented
  PostHog/Supabase opt-in.
- Never add a surface that writes to email, calendar or files without an
  approval step.
- Extend existing modules (`memory/`, `speech/`, `connectors/`, `server/`) rather
  than introducing parallel implementations.
