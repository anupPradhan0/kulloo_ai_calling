import dotenv from "dotenv";

dotenv.config();

const requiredVars = ["PORT", "MONGODB_URI"] as const;

for (const envKey of requiredVars) {
  if (!process.env[envKey]) {
    throw new Error(`Missing required environment variable: ${envKey}`);
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 5000),
  mongoUri: process.env.MONGODB_URI as string,
};
