/**
 * Zod schemas for outbound hello requests, route params, and recording webhook bodies from Twilio, Plivo, and FreeSWITCH.
 * Controllers parse with these before calling CallService so invalid input becomes a 400 with a single consistent pattern.
 */

import { z } from "zod";

const providerSchema = z.enum(["sip-local", "twilio", "plivo", "freeswitch"]);

/** Body for POST /api/calls/outbound/hello. */
export const outboundHelloSchema = z.object({
  from: z.string().trim().min(1, "from is required"),
  to: z.string().trim().min(1, "to is required"),
  provider: providerSchema.default("sip-local"),
  recordingEnabled: z.boolean().default(true),
});

/** Query for GET /api/calls — list recent calls. */
export const callListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

/** Route param for call-scoped recording list. */
export const callIdParamSchema = z.object({
  callId: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid call id"),
});

/** Route param for recording detail and file streaming. */
export const recordingIdParamSchema = z.object({
  recordingId: z.string().trim().regex(/^[0-9a-fA-F]{24}$/, "Invalid recording id"),
});

/** Twilio recording status callback body subset we persist. */
export const twilioRecordingCallbackSchema = z.object({
  CallSid: z.string().trim().min(1),
  RecordingSid: z.string().trim().min(1),
  RecordingUrl: z.string().trim().url().optional(),
  RecordingDuration: z.string().trim().optional(),
  RecordingStatus: z.string().trim().optional(),
});

/** Plivo recording callback body fields. */
export const plivoRecordingCallbackSchema = z.object({
  RecordingID: z.string().trim().min(1),
  RecordUrl: z.string().trim().url().optional(),
  RecordingDuration: z.string().trim().optional(),
  RecordingDurationMs: z.string().trim().optional(),
});

/** Plivo passes call UUID on the query string for the recording webhook. */
export const plivoRecordingCallbackQuerySchema = z.object({
  callUuid: z.string().trim().min(1),
});

/** FreeSWITCH HTTP callback posting recording completion metadata. */
export const freeswitchRecordingCallbackSchema = z.object({
  callUuid: z.string().trim().min(1),
  durationSec: z.string().trim().optional(),
  from: z.string().trim().optional(),
  to: z.string().trim().optional(),
});

export type OutboundHelloInput = z.infer<typeof outboundHelloSchema>;
export type TwilioRecordingCallbackPayload = z.infer<typeof twilioRecordingCallbackSchema>;
export type PlivoRecordingCallbackPayload = z.infer<typeof plivoRecordingCallbackSchema>;
export type FreeswitchRecordingCallbackPayload = z.infer<typeof freeswitchRecordingCallbackSchema>;
