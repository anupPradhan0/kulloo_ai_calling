/**
 * Express handlers for call and recording routes: validate with Zod, call CallService, and use next(error) for centralized errors.
 * Covers outbound hello, provider recording webhooks, Mongo-backed recording detail, and local WAV streaming from disk.
 */

/** Layer: HTTP only — validate input, call CallService, send JSON or files; no Mongo or Redis here. */
import { NextFunction, Request, Response } from "express";
import path from "node:path";
import { ApiError } from "../../../utils/api-error";
import { parseWithSchema } from "../../../utils/zod-validate";
import {
  callIdParamSchema,
  outboundHelloSchema,
  plivoRecordingCallbackQuerySchema,
  plivoRecordingCallbackSchema,
  recordingIdParamSchema,
  freeswitchRecordingCallbackSchema,
  twilioRecordingCallbackSchema,
} from "../validators/call.schema";
import { CallService } from "../services/call.service";

const callService = new CallService();

/**
 * GET /api/recordings/local — JSON list of WAV files in the recordings directory with API-relative URLs.
 */
export async function listLocalRecordings(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const recordings = await callService.listLocalWavSummaries();
    res.status(200).json({ success: true, count: recordings.length, data: recordings });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/recordings/local/:uuid — streams a WAV file from disk with audio headers set for inline playback.
 */
export async function localRecordingFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const uuid = req.params.uuid?.replace(/\.wav$/i, "");
    const filePath = await callService.resolveLocalRecordingAbsolutePath(uuid ?? "");
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Content-Disposition", `inline; filename="${path.basename(filePath)}"`);
    res.sendFile(filePath);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/calls/outbound/hello — requires Idempotency-Key header and runs the full outbound hello business flow.
 */
export async function outboundHelloCall(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const idempotencyKey = req.header("Idempotency-Key");
    if (!idempotencyKey) {
      throw new ApiError("Idempotency-Key header is required", 400);
    }

    const payload = parseWithSchema(outboundHelloSchema, req.body);
    const result = await callService.runOutboundHelloFlow(payload, idempotencyKey);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/calls/:callId/recordings — returns recording metadata rows for one call.
 */
export async function listCallRecordings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { callId } = parseWithSchema(callIdParamSchema, req.params);
    const recordings = await callService.listRecordingsByCall(callId);
    res.status(200).json({ success: true, data: recordings });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/recordings/:recordingId — returns one recording document from Mongo.
 */
export async function getRecording(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { recordingId } = parseWithSchema(recordingIdParamSchema, req.params);
    const recording = await callService.getRecordingById(recordingId);
    res.status(200).json({ success: true, data: recording });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/recordings/:recordingId/file — streams the file when filePath is stored on the recording document.
 */
export async function getRecordingFile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { recordingId } = parseWithSchema(recordingIdParamSchema, req.params);
    const recording = await callService.getRecordingById(recordingId);

    if (!recording.filePath) {
      throw new ApiError("Recording file is not available", 404);
    }

    res.sendFile(path.resolve(recording.filePath));
  } catch (error) {
    next(error);
  }
}

/**
 * POST Twilio recording webhook — responds with duplicate flag when Redis dedupe says the event was already handled.
 */
export async function twilioRecordingCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = parseWithSchema(twilioRecordingCallbackSchema, req.body);
    const result = await callService.processTwilioRecordingWebhook(payload);
    if (result.duplicate) {
      res.status(200).json({ success: true, duplicate: true });
      return;
    }
    res.status(200).json({ success: true, data: result.recording });
  } catch (error) {
    next(error);
  }
}

/**
 * POST Plivo recording webhook — combines query callUuid with body fields after validation.
 */
export async function plivoRecordingCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { callUuid } = parseWithSchema(plivoRecordingCallbackQuerySchema, req.query);
    const payload = parseWithSchema(plivoRecordingCallbackSchema, req.body);
    const result = await callService.processPlivoRecordingWebhook(callUuid, payload);
    if (result.duplicate) {
      res.status(200).json({ success: true, duplicate: true });
      return;
    }
    res.status(200).json({ success: true, data: result.recording });
  } catch (error) {
    next(error);
  }
}

/**
 * POST FreeSWITCH recording webhook — normalizes duration from string form when present, then delegates to the service.
 */
export async function freeswitchRecordingCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = parseWithSchema(freeswitchRecordingCallbackSchema, req.body);
    const durationSec =
      typeof payload.durationSec === "string" && payload.durationSec.trim().length > 0
        ? Number(payload.durationSec)
        : undefined;

    const result = await callService.processFreeswitchRecordingWebhook({
      callUuid: payload.callUuid,
      durationSec,
      from: payload.from,
      to: payload.to,
    });

    if (result.duplicate) {
      res.status(200).json({ success: true, duplicate: true });
      return;
    }

    res.status(200).json({ success: true, data: result.recording });
  } catch (error) {
    next(error);
  }
}
