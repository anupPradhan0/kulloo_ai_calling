/**
 * Loads dotenv once and exposes every process environment variable the backend reads in one typed object.
 * The rest of the codebase imports `env` from here so new settings are discovered in one place and tests can reason about configuration.
 * Server startup refuses to continue without Redis when this module reports it as configured.
 */

import dotenv from "dotenv";

dotenv.config();

const DEFAULT_PORT = 5000;
const DEFAULT_MONGO_URI = "mongodb://localhost:27017/sip-backend";

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") {
    return fallback;
  }
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseBoolEnv(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") {
    return fallback;
  }
  if (["1", "true", "yes", "on"].includes(raw)) return true;
  if (["0", "false", "no", "off"].includes(raw)) return false;
  return fallback;
}

/** Parsed environment values used across HTTP, ESL, and background jobs. */
export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  mongoUri: process.env.MONGODB_URI ?? DEFAULT_MONGO_URI,
  /** Required at runtime: idempotency cache + webhook deduplication (`assertRedisAvailable` in `server.ts`). */
  redisUrl: process.env.REDIS_URL?.trim() || undefined,
  redisKeyPrefix: process.env.REDIS_KEY_PREFIX?.trim() || "kulloo:",
  redisIdempotencyTtlSec: parseIntEnv("REDIS_IDEMPOTENCY_TTL_SEC", 86_400),
  redisWebhookDedupeTtlSec: parseIntEnv("REDIS_WEBHOOK_DEDUPE_TTL_SEC", 172_800),
  /** Optional override for absolute URLs (Plivo callbacks, recording links). */
  publicBaseUrl: process.env.PUBLIC_BASE_URL?.trim() || undefined,
  /**
   * Kamailio SIP load balancer URI — the primary target for Plivo `<Dial><User>` in the Answer URL.
   * When set, Plivo sends INVITEs to Kamailio which distributes them across the FreeSWITCH pool.
   * Format: sip:1000@<kamailio-host>:5060  or  sip:1000@<public-ip>
   * Takes precedence over FREESWITCH_SIP_URI when both are set.
   */
  kamailioSipUri: process.env.KAMAILIO_SIP_URI?.trim() || undefined,
  /**
   * Kamailio host/IP (used for logging and future health checks).
   * Separate from kamailioSipUri so we can check connectivity independently.
   */
  kamailioHost: process.env.KAMAILIO_HOST?.trim() || undefined,
  /**
   * Comma-separated list of FreeSWITCH instance identifiers for health monitoring.
   * Example: "fs1:5070,fs2:5071"
   * Used by future health check tooling; not required at runtime.
   */
  freeswitchInstances: process.env.FREESWITCH_INSTANCES?.trim() || undefined,
  /**
   * Legacy: direct FreeSWITCH SIP URI (used when Kamailio is not deployed).
   * Falls back to this if KAMAILIO_SIP_URI is not set.
   * In Kamailio deployments, set KAMAILIO_SIP_URI instead.
   */
  freeswitchSipUri: process.env.FREESWITCH_SIP_URI?.trim() || undefined,
  logLevel: process.env.LOG_LEVEL?.trim() || undefined,
  logFormat: process.env.LOG_FORMAT?.trim() || undefined,
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID?.trim() || undefined,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN?.trim() || undefined,
  plivoAuthId: process.env.PLIVO_AUTH_ID?.trim() || undefined,
  plivoAuthToken: process.env.PLIVO_AUTH_TOKEN?.trim() || undefined,
  plivoAnswerUrl: process.env.PLIVO_ANSWER_URL?.trim() || undefined,
  plivoHangupUrl: process.env.PLIVO_HANGUP_URL?.trim() || undefined,
  /** Outbound ESL TCP port (FreeSWITCH `socket` connects here; all FS instances use the same port). */
  eslOutboundPort: parseIntEnv("ESL_OUTBOUND_PORT", 3200),
  /**
   * Optional recordings root. When unset, `server` defaults to `/recordings`;
   * `call.service` register paths use `../recordings` relative to cwd; list/stream use `/recordings`.
   */
  recordingsDirRaw: process.env.RECORDINGS_DIR?.trim() || undefined,
  orphanGraceMs: Number(process.env.ORPHAN_GRACE_MS ?? 120000),
  orphanSweepIntervalMs: Number(process.env.ORPHAN_SWEEP_INTERVAL_MS ?? 60000),
  recordingsSyncGraceMs: Number(process.env.RECORDINGS_SYNC_GRACE_MS ?? 120000),
  recordingsSyncIntervalMs: Number(process.env.RECORDINGS_SYNC_INTERVAL_MS ?? 60000),
  // ---------------------------------------------------------------------------
  // Flow B: Drachtio SIP signaling (opt-in via CALL_CONTROL_BACKEND=drachtio)
  // Default is "kulloo" which keeps Flow A (Kamailio/ESL) unchanged.
  // ---------------------------------------------------------------------------
  /**
   * Which SIP call-control backend to activate at startup.
   * "kulloo"  → Flow A (default): Plivo → Kamailio → FreeSWITCH → ESL → Kulloo
   * "drachtio"→ Flow B (opt-in):  Plivo → Drachtio → FreeSWITCH → ESL → Kulloo
   */
  callControlBackend: (process.env.CALL_CONTROL_BACKEND?.trim() || "kulloo") as "kulloo" | "drachtio",
  /**
   * Drachtio C++ server host (Flow B only).
   * srf.connect() command socket connects here. Defaults to Docker service name "drachtio".
   */
  drachtioHost: process.env.DRACHTIO_HOST?.trim() || "drachtio",
  /**
   * Drachtio command port — TCP port the drachtio C++ server exposes for Node.js app connections.
   * NOT the SIP port (5060 is for Plivo→drachtio; this is the control plane). Default: 9022.
   */
  drachtioPort: parseIntEnv("DRACHTIO_PORT", 9022),
  /**
   * Shared secret between the drachtio C++ server and this Node.js app.
   * Must match the secret in the drachtio container config.
   */
  drachtioSecret: process.env.DRACHTIO_SECRET?.trim() || "kulloo-drachtio-secret",
  /**
   * SIP port on the drachtio container where Plivo/carrier sends INVITEs (Flow B only).
   * Used in logs and documentation only; the port mapping itself is in docker-compose.drachtio.yml.
   */
  drachtioSipPort: parseIntEnv("DRACHTIO_SIP_PORT", 5060),
  // ---------------------------------------------------------------------------
  // Agent WebRTC softphone (opt-in via AGENT_MODE=webrtc)
  // Default is "hello" which keeps the existing IVR beep/record/hangup script.
  // ---------------------------------------------------------------------------
  /**
   * "hello"   → existing IVR script (default, no change).
   * "webrtc"  → bridge inbound call to agent's sip.js WebRTC endpoint.
   * "ai_voice"→ Deepgram → OpenAI → VEXYL-TTS loop over ESL (requires API keys).
   */
  agentMode: (process.env.AGENT_MODE?.trim() || "hello") as "hello" | "webrtc" | "ai_voice",
  // --- AI voice pipeline (AGENT_MODE=ai_voice) — secrets only via env ---
  deepgramApiKey: process.env.DEEPGRAM_API_KEY?.trim() || undefined,
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || undefined,
  /** Chat Completions model for the live loop (e.g. gpt-4o-mini). */
  aiLlmModel: process.env.AI_LLM_MODEL?.trim() || "gpt-4o-mini",
  /** Persona key for `getAiSystemPrompt` (files under prompts/ai-voice/). */
  aiVoicePersona: process.env.AI_VOICE_PERSONA?.trim() || "default",
  /** Max non-system chat messages in the sliding window (OpenAI). */
  aiHistoryMaxTurns: parseIntEnv("AI_HISTORY_MAX_TURNS", 10),
  /** After hangup, run async LLM summary for operators (non-blocking). */
  aiSummaryOnHangup: parseBoolEnv("AI_SUMMARY_ON_HANGUP", true),
  /** VEXYL-TTS WebSocket base: ws(s)://host:port (no path). Default assumes Docker service `vexyl-tts:8080`. */
  vexylTtsWsUrl: process.env.VEXYL_TTS_WS_URL?.trim() || "ws://vexyl-tts:8080",
  optionalVexylTtsApiKey: process.env.VEXYL_TTS_API_KEY?.trim() || undefined,
  /** STT: treat telephony chunks as this sample rate (Deepgram pre-recorded). */
  aiAudioForkSampleRate: parseIntEnv("AI_AUDIO_FORK_SAMPLE_RATE", 8000),
  /** Playback / TTS alignment — WAV written for FS `playback` should match the SIP leg. */
  aiPlaybackSampleRate: parseIntEnv("AI_PLAYBACK_SAMPLE_RATE", 8000),
  /** VEXYL WebSocket synthesis: language/style (see VEXYL-TTS README). */
  vexylTtsLang: process.env.VEXYL_TTS_LANG?.trim() || "en-IN",
  vexylTtsStyle: process.env.VEXYL_TTS_STYLE?.trim() || "default",
  /** User speech slice length (ms) when using record_session fallback (no audio fork). */
  aiVoiceUserSliceMs: parseIntEnv("AI_VOICE_USER_SLICE_MS", 7000),
  /** Safety cap on assistant rounds per call. */
  aiVoiceMaxRounds: parseIntEnv("AI_VOICE_MAX_ROUNDS", 20),
  /**
   * FreeSWITCH WSS URL returned to the frontend so sip.js knows where to register.
   * Example: wss://yourdomain.com:7443
   */
  freeswitchWssUrl: process.env.FREESWITCH_WSS_URL?.trim() || "wss://localhost:7443",
  /**
   * FreeSWITCH SIP domain used in bridge(user/agentX@domain).
   * Must match the domain configured in FreeSWITCH sip_profiles.
   */
  freeswitchDomain: process.env.FREESWITCH_DOMAIN?.trim() || "kulloo.local",
  /**
   * SIP username for the agent (must match freeswitch/directory/default/agentX.xml).
   */
  agentSipUsername: process.env.AGENT_SIP_USERNAME?.trim() || "agent1",
  /**
   * SIP password for the agent (must match freeswitch/directory/default/agentX.xml).
   */
  agentSipPassword: process.env.AGENT_SIP_PASSWORD?.trim() || "agent123",
  /**
   * STUN server returned to sip.js for WebRTC ICE negotiation.
   */
  stunServerUrl: process.env.STUN_SERVER_URL?.trim() || "stun:stun.l.google.com:19302",
  /**
   * When true, only one browser session (X-Agent-Session-Id) may fetch /api/agent/credentials at a time (Redis).
   * Prevents two operators registering the same SIP agent extension. Default true in production-minded setups.
   */
  agentSingleLockEnabled: parseBoolEnv("AGENT_SINGLE_LOCK_ENABLED", true),

  // ---------------------------------------------------------------------------
  // Recording storage (local + optional S3 offload)
  // ---------------------------------------------------------------------------
  /**
   * S3 region (required when using S3).
   */
  s3Region: process.env.S3_REGION?.trim() || undefined,
  /**
   * S3 bucket name (required when using S3).
   */
  s3Bucket: process.env.S3_BUCKET?.trim() || undefined,
  /**
   * Optional prefix inside the bucket (no leading/trailing slashes).
   */
  s3Prefix: process.env.S3_PREFIX?.trim() || undefined,
  /**
   * Pre-signed URL TTL for playback/download.
   */
  s3PresignTtlSec: parseIntEnv("S3_PRESIGN_TTL_SEC", 300),
};

/**
 * Returns whether REDIS_URL is set to a non-empty string (does not check connectivity).
 */
export function isRedisConfigured(): boolean {
  return Boolean(env.redisUrl && env.redisUrl.length > 0);
}
