# AI voice agent flow (implemented)

> **Doc hub:** [Documentation index](README.md). **Design / roadmap:** [ai-voice-pipeline.md](../.cursor/plans/ai-voice-pipeline.md).

This document describes the **AI voice agent** path that is **implemented in code today**: how it is turned on, what services it uses, where the logic lives, and how it differs from the default hello IVR and the WebRTC agent bridge.

---

## What it is

When **`AGENT_MODE=ai_voice`**, inbound calls that reach FreeSWITCH and connect over **outbound ESL** run an **AI conversation loop** instead of the fixed hello script (`tone → record → DTMF → hangup`) or the WebRTC bridge.

**Pipeline (high level):**

1. **Answer** the channel.
2. **Greeting** via **VEXYL-TTS** (synthesized WAV) and FreeSWITCH **`playback`**.
3. **Loop** until hangup or max rounds:
   - Capture **user speech** using **`record_session`** in **time slices** (fallback path — not a live RTP “audio fork” yet).
   - **Transcribe** each slice with **Deepgram** (pre-recorded / file API).
   - **Reply** with **OpenAI Chat Completions** using a **system prompt** from files under `backend/src/prompts/ai-voice/` and a **sliding window** of recent turns (`AI_HISTORY_MAX_TURNS`).
   - **Speak** the reply with **VEXYL-TTS** → WAV bytes written to a **temporary file** for **`playback`** (buffer-first contract; temp file is an allowed ESL detail).
4. On hangup, optionally enqueue an **async operator summary** (`AI_SUMMARY_ON_HANGUP`) using the **full** transcript stored in Mongo.

**Secrets** (`DEEPGRAM_API_KEY`, `OPENAI_API_KEY`, optional `VEXYL_TTS_API_KEY`) are read only from **`backend/src/config/env.ts`** / environment — never from the client or repo.

---

## How it relates to other modes

| `AGENT_MODE` | Behavior |
|--------------|----------|
| **`hello`** (default) | Original IVR: answer → tone → record → DTMF / timeout → hangup. |
| **`webrtc`** | Bridge inbound caller to agent softphone (sip.js); see [webrtc-agent-softphone.md](webrtc-agent-softphone.md). |
| **`ai_voice`** | AI loop: Deepgram → OpenAI → VEXYL-TTS as above. |

Only one mode applies per API process. The ESL handler **dispatches** in `backend/src/services/freeswitch/esl-call-handler.service.ts` (`executeCallFlow`).

If **`ai_voice`** is selected but **`DEEPGRAM_API_KEY`** or **`OPENAI_API_KEY`** is missing, the server **falls back to the hello IVR** and logs that fact (so deployments without AI keys still get a working call).

---

## Configuration (environment)

Variables are defined in **`backend/src/config/env.ts`** and documented in **`backend/.env.example`** under “AI voice pipeline”.

**Required for AI voice (besides normal Kulloo stack):**

- **`AGENT_MODE=ai_voice`**
- **`DEEPGRAM_API_KEY`**
- **`OPENAI_API_KEY`**
- **`VEXYL_TTS_WS_URL`** — WebSocket base URL for [VEXYL-TTS](https://github.com/vexyl-ai/vexyl-tts) (default in code: `ws://vexyl-tts:8080`; adjust to your host/port).

**Common optional knobs:**

- **`AI_LLM_MODEL`** — e.g. `gpt-4o-mini`
- **`AI_VOICE_PERSONA`** — loads `backend/src/prompts/ai-voice/system-<persona>.txt` (default **`default`** → `system-default.txt`)
- **`AI_SYSTEM_PROMPT_FILE`** — absolute or cwd-relative file override for the system prompt
- **`AI_HISTORY_MAX_TURNS`** — max non-system chat messages in the sliding window (default `10`)
- **`AI_SUMMARY_ON_HANGUP`** — `true`/`false` for post-call summary
- **`VEXYL_TTS_LANG`**, **`VEXYL_TTS_STYLE`**, **`VEXYL_TTS_API_KEY`**
- **`AI_VOICE_USER_SLICE_MS`** — length of each user recording slice (default `7000`)
- **`AI_VOICE_MAX_ROUNDS`** — safety cap on assistant rounds per call
- **`AI_AUDIO_FORK_SAMPLE_RATE`** — passed toward Deepgram for chunk transcription (default `8000`)

**Deployment note:** VEXYL-TTS is a **separate process** (Python server or its Docker image). The Kulloo API container must **reach** that WebSocket URL on the network (same Docker network, or public URL).

---

## Code map

| Area | Location |
|------|----------|
| ESL dispatch + `executeAiVoiceFlow` | `backend/src/services/freeswitch/esl-call-handler.service.ts` |
| Main loop (record → STT → LLM → TTS → playback) | `backend/src/services/ai/ai-voice-esl.runner.ts` |
| Deepgram (file transcription) | `backend/src/services/ai/deepgram-stt.adapter.ts` |
| OpenAI (sliding window + hangup summary) | `backend/src/services/ai/openai-llm.adapter.ts` |
| VEXYL WebSocket TTS | `backend/src/services/ai/vexyl-tts.adapter.ts` |
| System prompt loading | `backend/src/services/ai/prompt-loader.ts`, `backend/src/prompts/ai-voice/*.txt` |
| Shared types | `backend/src/services/ai/types.ts` |
| Future audio-fork WebSocket (stub) | `backend/src/services/ai/ai-fork-ws.service.ts` — path **`/internal/ai-audio-fork`**, attached in `backend/src/server.ts` |
| Mongo: transcript + summary | `Call.aiVoice.turns`, `Call.aiVoice.operatorSummary` — `backend/src/modules/calls/models/call.model.ts`; helpers in `CallService` / `CallRepository` |
| Production Docker copies prompts | `backend/Dockerfile` copies `src/prompts` → `/app/prompts` |

---

## Audio path: what is implemented vs planned

- **Implemented (MVP):** **Short WAV slices** via **`record_session`** → **Deepgram transcribe file** → text. This matches the plan’s **fallback** until a FreeSWITCH **audio fork / media tap** is wired end-to-end.
- **Stub:** A **WebSocket** endpoint exists for a future **fork → Kulloo → Deepgram live** path; it does **not** yet forward frames to Deepgram.
- **Not in this doc as a requirement:** resampling between VEXYL output rate and narrowband telephony — set VEXYL output rate or add resampling if playback sounds wrong (see [ai-voice-pipeline.md](../.cursor/plans/ai-voice-pipeline.md) “Audio resolution contract”).

---

## Barge-in (interrupt TTS)

- During **playback** of assistant audio, DTMF **`*`** triggers **`uuid_break`** on the channel (same idea as Jambonz-style interrupt).
- **Deepgram stream invalidation** and **`ai_turn_id`** sequencing (Bolna-style) are **not** fully implemented; see the plan for the target behavior.

---

## Persistence

- **Full** user/assistant text turns are appended to **`Call.aiVoice.turns`** for audit and for **post-call summary**.
- The **live** LLM request uses only the **sliding window** of recent messages plus system prompt.
- If **`AI_SUMMARY_ON_HANGUP`** is enabled, an **async** job after hangup can fill **`Call.aiVoice.operatorSummary`** (full transcript summarized for operators).

There is **no** dedicated **`GET /api/calls/:id/transcript`** yet (optional in the plan).

---

## Verify the stack

1. **Health:** `curl` the API health endpoint (see [deployment.md](deployment.md)).
2. **Keys:** `DEEPGRAM_API_KEY`, `OPENAI_API_KEY` set; VEXYL reachable at **`VEXYL_TTS_WS_URL`**.
3. **Call:** Inbound call to your SIP path → FS → ESL → you should hear the **VEXYL greeting**, then **record slices** and **spoken replies** if STT returns text.

---

## See also

- [esl.md](esl.md) — outbound ESL, `executeCallFlow`
- [hello-call-contract.md](hello-call-contract.md) — baseline hello behavior when not in AI mode
- [deployment.md](deployment.md) — Docker and `.env` checklist
- [ai-voice-pipeline.md](../.cursor/plans/ai-voice-pipeline.md) — full design, phases, and definition of done
