import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));

loadEnv({
  path: resolve(currentDir, "../../../../.env")
});

const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().optional());

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  MUSIC_PROVIDER: z.enum(["stub", "mureka"]).default("mureka"),
  MUREKA_API_KEY: z.string().optional(),
  MUREKA_BASE_URL: z.string().url().default("https://api.mureka.ai"),
  MUREKA_OUTPUT_COUNT: z.coerce.number().int().min(1).max(4).default(1),
  MUREKA_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1500),
  MUREKA_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(120000),
  VOICE_PROFILES_DIR: z.string().default("storage/voice-profiles"),
  SVC_CONVERTER_COMMAND_JSON: optionalString,
  SVC_CONVERTER_CWD: optionalString,
  RVC_CONVERTER_COMMAND_JSON: optionalString,
  RVC_CONVERTER_CWD: optionalString
});

export const env = envSchema.parse(process.env);
