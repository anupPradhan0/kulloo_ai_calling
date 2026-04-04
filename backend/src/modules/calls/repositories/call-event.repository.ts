/**
 * Inserts and lists CallEvent rows for timeline features and debugging without embedding queries in CallService.
 */

/** Layer: database only — Mongoose access for call events; no HTTP or telephony logic. */
import { Types } from "mongoose";
import { CallEventDocument, CallEventModel } from "../models/call-event.model";

export class CallEventRepository {
  /**
   * Persists one event row linked to a call and correlation id.
   */
  async create(payload: Omit<CallEventDocument, "createdAt" | "updatedAt">): Promise<CallEventDocument> {
    return CallEventModel.create(payload);
  }

  /**
   * Returns events for a call in chronological order for display or export.
   */
  async listByCallId(callId: string): Promise<CallEventDocument[]> {
    if (!Types.ObjectId.isValid(callId)) {
      return [];
    }

    return CallEventModel.find({ callId }).sort({ createdAt: 1 });
  }
}
