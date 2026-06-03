import { env } from "../config/env";
import { createMurekaProvider } from "./murekaProvider";
import { stubMusicProvider } from "./stubMusicProvider";
import type { MusicProvider } from "./types";

export const getMusicProvider = (): MusicProvider => {
  if (env.MUSIC_PROVIDER === "mureka") {
    return createMurekaProvider({
      apiKey: env.MUREKA_API_KEY,
      baseUrl: env.MUREKA_BASE_URL,
      outputCount: env.MUREKA_OUTPUT_COUNT,
      pollIntervalMs: env.MUREKA_POLL_INTERVAL_MS,
      pollTimeoutMs: env.MUREKA_POLL_TIMEOUT_MS
    });
  }

  return stubMusicProvider;
};
