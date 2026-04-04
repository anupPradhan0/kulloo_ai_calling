/**
 * Mongoose schema and TypeScript types for the core Call aggregate: direction, provider ids, status machine, and timestamps.
 * Indexes enforce deduplication for provider legs and upstream carriers; virtual callSid mirrors _id for API consumers.
 */

/** Layer: persistence shape only — defines stored fields and indexes; transitions are enforced in services. */
import { model, Schema, Types } from "mongoose";

export type CallDirection = "inbound" | "outbound";
export type CallProvider = "sip-local" | "twilio" | "plivo" | "freeswitch";
export type CallStatus =
  | "received"
  | "initiated"
  | "answered"
  | "connected"
  | "played"
  | "recording_started"
  | "hangup"
  | "completed"
  | "failed";

/**
 * Call persistence. The canonical **stable business id** (same role as Jambonz `call_sid`) is
 * `Call._id` as a 24-char hex string. It is propagated to the media leg on SIP as custom header
 * `KullooCallId` (not `X-Call-Sid`, by design). API JSON also exposes this as virtual `callSid`.
 */
export interface CallDocument {
  _id: Types.ObjectId;
  /** Same as `_id.toHexString()` when the document is serialized (`toJSON` / `res.json`). */
  callSid?: string;
  direction: CallDirection;
  provider: CallProvider;
  upstreamProvider?: CallProvider;
  upstreamCallId?: string;
  from: string;
  to: string;
  fromRaw?: string;
  toRaw?: string;
  fromE164?: string;
  toE164?: string;
  callerName?: string;
  status: CallStatus;
  /** HTTP request / log correlation (per request), not the telephony stable id. */
  correlationId: string;
  providerCallId?: string;
  idempotencyKey?: string;
  recordingEnabled: boolean;
  timestamps: {
    receivedAt?: Date;
    answeredAt?: Date;
    connectedAt?: Date;
    playedAt?: Date;
    recordingStartedAt?: Date;
    hangupAt?: Date;
    completedAt?: Date;
    failedAt?: Date;
  };
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

const callSchema = new Schema<CallDocument>(
  {
    direction: { type: String, enum: ["inbound", "outbound"], required: true },
    provider: { type: String, enum: ["sip-local", "twilio", "plivo", "freeswitch"], required: true },
    upstreamProvider: { type: String, enum: ["sip-local", "twilio", "plivo", "freeswitch"], required: false },
    upstreamCallId: { type: String, trim: true },
    from: { type: String, required: true, trim: true },
    to: { type: String, required: true, trim: true },
    fromRaw: { type: String, trim: true },
    toRaw: { type: String, trim: true },
    fromE164: { type: String, trim: true },
    toE164: { type: String, trim: true },
    callerName: { type: String, trim: true },
    status: { type: String, required: true },
    correlationId: { type: String, required: true, index: true },
    providerCallId: { type: String, trim: true },
    idempotencyKey: { type: String, trim: true, unique: true, sparse: true },
    recordingEnabled: { type: Boolean, default: true },
    timestamps: {
      receivedAt: { type: Date },
      answeredAt: { type: Date },
      connectedAt: { type: Date },
      playedAt: { type: Date },
      recordingStartedAt: { type: Date },
      hangupAt: { type: Date },
      completedAt: { type: Date },
      failedAt: { type: Date },
    },
    lastError: { type: String },
  },
  { timestamps: true },
);

// Dedupe at DB-level for provider-originated calls (e.g., freeswitch uuid)
callSchema.index({ provider: 1, providerCallId: 1 }, { unique: true, sparse: true });
// Dedupe upstream provider call IDs (e.g., Plivo request_uuid) when present.
callSchema.index({ upstreamProvider: 1, upstreamCallId: 1 }, { unique: true, sparse: true });

callSchema.virtual("callSid").get(function () {
  return String(this.get("_id"));
});

callSchema.set("toJSON", { virtuals: true });
callSchema.set("toObject", { virtuals: true });

export const CallModel = model<CallDocument>("Call", callSchema);
