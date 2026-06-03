import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  MUSIC_PROVIDER: z.enum(["stub", "mureka"]).default("mureka"),
  MUREKA_API_KEY: z.string().optional(),
  MUREKA_BASE_URL: z.string().url().default("https://api.mureka.ai"),
  MUREKA_OUTPUT_COUNT: z.coerce.number().int().min(1).max(4).default(1),
  MUREKA_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1500),
  MUREKA_POLL_TIMEOUT_MS: z.coerce.number().int().positive().default(120000)
});

export const env = envSchema.parse(process.env);
