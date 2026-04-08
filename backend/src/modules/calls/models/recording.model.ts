/**
 * Mongoose model for per-call recording metadata: provider id, status, optional file path, and links for playback.
 * One row can represent FreeSWITCH disk recordings or cloud provider recording ids depending on the media path.
 */

/** Layer: persistence shape only — recording fields and indexes; lifecycle rules live in CallService and ESL. */
import { model, Schema, Types } from "mongoose";
import { CallProvider } from "./call.model";

// NOTE: "pending" is legacy but kept for backward compatibility with existing rows.
export type RecordingStatus = "pending" | "recorded" | "uploading" | "completed" | "failed";

export type RecordingStorage = "local" | "s3";

export interface RecordingDocument {
  _id: Types.ObjectId;
  callId: Types.ObjectId;
  provider: CallProvider;
  providerRecordingId: string;
  status: RecordingStatus;
  storage?: RecordingStorage;
  durationSec?: number;
  retrievalUrl?: string;
  filePath?: string;
  s3Bucket?: string;
  s3Key?: string;
  s3Region?: string;
  uploadedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const recordingSchema = new Schema<RecordingDocument>(
  {
    callId: { type: Schema.Types.ObjectId, ref: "Call", required: true, index: true },
    provider: { type: String, enum: ["sip-local", "twilio", "plivo", "freeswitch"], required: true },
    providerRecordingId: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ["pending", "recorded", "uploading", "completed", "failed"], default: "pending" },
    storage: { type: String, enum: ["local", "s3"] },
    durationSec: { type: Number },
    retrievalUrl: { type: String },
    filePath: { type: String },
    s3Bucket: { type: String },
    s3Key: { type: String },
    s3Region: { type: String },
    uploadedAt: { type: Date },
  },
  { timestamps: true },
);

export const RecordingModel = model<RecordingDocument>("Recording", recordingSchema);
