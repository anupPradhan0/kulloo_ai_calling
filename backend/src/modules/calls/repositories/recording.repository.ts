/**
 * All Mongoose operations for Recording documents: create, find, list by call, and upsert from disk sync jobs.
 */

/** Layer: database only — recording queries and updates; callers enforce business rules. */
import { Types } from "mongoose";
import { RecordingDocument, RecordingModel, RecordingStatus } from "../models/recording.model";

export class RecordingRepository {
  /**
   * Inserts a new recording row for a call.
   */
  async create(
    payload: Omit<RecordingDocument, "_id" | "createdAt" | "updatedAt">,
  ): Promise<RecordingDocument> {
    return RecordingModel.create(payload);
  }

  /**
   * Loads one recording by Mongo id or returns null when invalid or missing.
   */
  async findById(id: string): Promise<RecordingDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return RecordingModel.findById(id);
  }

  /**
   * Looks up by provider-specific recording identifier (for example FreeSWITCH channel UUID as basename).
   */
  async findByProviderRecordingId(providerRecordingId: string): Promise<RecordingDocument | null> {
    return RecordingModel.findOne({ providerRecordingId });
  }

  /**
   * Lists recordings for a call newest-first for API responses.
   */
  async listByCallId(callId: string): Promise<RecordingDocument[]> {
    if (!Types.ObjectId.isValid(callId)) {
      return [];
    }
    return RecordingModel.find({ callId }).sort({ createdAt: -1 });
  }

  /**
   * Lists recent recordings across all calls (newest first), capped for API safety.
   */
  async listRecent(limit: number): Promise<RecordingDocument[]> {
    return RecordingModel.find().sort({ createdAt: -1 }).limit(limit);
  }

  /**
   * Updates status and optional duration or URL fields on an existing recording.
   */
  async updateStatus(
    id: string,
    status: RecordingStatus,
    patch?: Partial<Pick<RecordingDocument, "durationSec" | "retrievalUrl">>,
  ): Promise<RecordingDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return RecordingModel.findByIdAndUpdate(id, { status, ...patch }, { new: true, runValidators: true });
  }

  /**
   * General-purpose partial update by Mongo id with a narrowed patch type for safety.
   */
  async updateById(
    id: string,
    patch: Partial<
      Pick<
        RecordingDocument,
        | "providerRecordingId"
        | "status"
        | "storage"
        | "durationSec"
        | "retrievalUrl"
        | "filePath"
        | "s3Bucket"
        | "s3Key"
        | "s3Region"
        | "uploadedAt"
      >
    >,
  ): Promise<RecordingDocument | null> {
    if (!Types.ObjectId.isValid(id)) {
      return null;
    }
    return RecordingModel.findByIdAndUpdate(id, patch, { new: true, runValidators: true });
  }

  /**
   * Finds the most recent pending recording for a call when finalizing Plivo metadata onto an ESL-created row.
   */
  async findPendingByCallId(callId: string): Promise<RecordingDocument | null> {
    if (!Types.ObjectId.isValid(callId)) {
      return null;
    }
    return RecordingModel.findOne({ callId, status: "pending" }).sort({ createdAt: -1 });
  }

  /**
   * Upserts by FreeSWITCH channel id so disk sync can create or refresh rows idempotently.
   */
  async upsertFreeswitchRecordingFromDiskSync(input: {
    providerRecordingId: string;
    callId: Types.ObjectId;
    filePath: string;
    retrievalUrl: string;
  }): Promise<void> {
    await RecordingModel.updateOne(
      { providerRecordingId: input.providerRecordingId },
      {
        $setOnInsert: {
          callId: input.callId,
          provider: "freeswitch",
          providerRecordingId: input.providerRecordingId,
        },
        $set: {
          status: "completed",
          filePath: input.filePath,
          retrievalUrl: input.retrievalUrl,
        },
      },
      { upsert: true },
    );
  }
}
