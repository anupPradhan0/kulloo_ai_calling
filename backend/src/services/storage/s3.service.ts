import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "node:fs/promises";
import path from "node:path";
import { env } from "../../config/env";

export interface S3Location {
  bucket: string;
  key: string;
  region: string;
}

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!client) {
    client = new S3Client({ region: env.s3Region });
  }
  return client;
}

export function isS3Enabled(): boolean {
  return Boolean(env.s3Bucket && env.s3Region);
}

export function buildDatePartitionedRecordingKey(input: { callUuid: string; at: Date }): string {
  const yyyy = String(input.at.getUTCFullYear());
  const mm = String(input.at.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(input.at.getUTCDate()).padStart(2, "0");
  const base = `recordings/${yyyy}/${mm}/${dd}/${input.callUuid}.wav`;
  const prefix = (env.s3Prefix ?? "").replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${base}` : base;
}

export async function uploadWavToS3(input: { localPath: string; location: S3Location }): Promise<void> {
  const body = await fs.readFile(input.localPath);
  const filename = path.basename(input.localPath);
  const s3 = getClient();
  await s3.send(
    new PutObjectCommand({
      Bucket: input.location.bucket,
      Key: input.location.key,
      Body: body,
      ContentType: "audio/wav",
      ContentDisposition: `inline; filename="${filename}"`,
    }),
  );
}

export async function getPresignedRecordingGetUrl(input: {
  location: S3Location;
  expiresInSec: number;
}): Promise<string> {
  const s3 = getClient();
  const cmd = new GetObjectCommand({
    Bucket: input.location.bucket,
    Key: input.location.key,
  });
  return await getSignedUrl(s3, cmd, { expiresIn: input.expiresInSec });
}

