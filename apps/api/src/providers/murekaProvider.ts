import type { RemixArtifact, RemixJobRequest, RemixQualityReport } from "@better-suno/shared";
import type { GeneratedLyrics, MusicProvider, SourceAnalysis } from "./types";

type MurekaProviderOptions = {
  apiKey?: string;
  baseUrl: string;
  outputCount: number;
  pollIntervalMs: number;
  pollTimeoutMs: number;
};

type JsonObject = Record<string, unknown>;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {
      raw: text
    };
  }
};

const asObject = (value: unknown): JsonObject | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as JsonObject) : undefined;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const pickString = (source: unknown, keys: string[]): string | undefined => {
  const object = asObject(source);

  if (!object) {
    return undefined;
  }

  for (const key of keys) {
    const value = object[key];

    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }

  return undefined;
};

const nestedObjects = (source: unknown): JsonObject[] => {
  const object = asObject(source);

  if (!object) {
    return [];
  }

  return [object, ...["data", "result", "task", "song"].flatMap((key) => nestedObjects(object[key]))];
};

const pickNestedString = (source: unknown, keys: string[]): string | undefined => {
  for (const object of nestedObjects(source)) {
    const value = pickString(object, keys);

    if (value) {
      return value;
    }
  }

  return undefined;
};

const extractArray = (source: unknown, keys: string[]): unknown[] => {
  for (const object of nestedObjects(source)) {
    for (const key of keys) {
      const value = object[key];

      if (Array.isArray(value)) {
        return value;
      }
    }
  }

  return [];
};

const extractErrorMessage = (source: unknown): string | undefined =>
  pickNestedString(source, ["message", "error", "detail", "reason"]);

const extractUploadAudioId = (source: unknown): string | undefined =>
  pickNestedString(source, ["upload_audio_id", "uploadAudioId", "file_id", "fileId", "id"]);

const extractTaskId = (source: unknown): string | undefined =>
  pickNestedString(source, ["task_id", "taskId", "id"]);

const extractLyrics = (source: unknown): string | undefined => {
  const direct = pickNestedString(source, ["lyrics", "lyric", "text", "content"]);

  if (direct) {
    return direct;
  }

  for (const choice of extractArray(source, ["choices", "results"])) {
    const lyrics = pickNestedString(choice, ["lyrics", "lyric", "text", "content"]);

    if (lyrics) {
      return lyrics;
    }
  }

  return undefined;
};

const extractStatus = (source: unknown): string | undefined =>
  pickNestedString(source, ["status", "state", "task_status", "taskStatus"])?.toLowerCase();

const isSuccessStatus = (status?: string) =>
  status ? ["succeeded", "success", "completed", "complete", "finished", "done"].includes(status) : false;

const isFailureStatus = (status?: string) =>
  status ? ["failed", "failure", "error", "cancelled", "canceled"].includes(status) : false;

const extractAudioUrl = (source: unknown): string | undefined => {
  const direct = pickNestedString(source, [
    "audio_url",
    "audioUrl",
    "url",
    "song_url",
    "songUrl",
    "cdn_url",
    "cdnUrl",
    "mp3_url",
    "mp3Url",
    "stream_url",
    "streamUrl"
  ]);

  if (direct?.startsWith("http")) {
    return direct;
  }

  return undefined;
};

const buildPrompt = (input: RemixJobRequest) =>
  [
    input.prompt,
    `intent: ${input.intent}`,
    `language: ${input.targetLanguage}`,
    `duration_seconds: ${input.durationSeconds}`,
    `melody_strength: ${input.keepMelodyStrength}`,
    input.voiceProfileId ? `voice_profile_id: ${input.voiceProfileId}` : undefined,
    "rights_confirmed: source, voice, platform_processing"
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, 1024);

export const createMurekaProvider = ({
  apiKey,
  baseUrl,
  outputCount,
  pollIntervalMs,
  pollTimeoutMs
}: MurekaProviderOptions): MusicProvider => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");

  const assertConfigured = () => {
    if (!apiKey) {
      throw new Error("MUREKA_API_KEY is required when MUSIC_PROVIDER=mureka.");
    }
  };

  const requestJson = async (path: string, init: RequestInit = {}): Promise<unknown> => {
    assertConfigured();

    const response = await fetch(`${normalizedBaseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...init.headers
      }
    });
    const text = await response.text();
    const payload = text ? parseJson(text) : {};

    if (!response.ok) {
      throw new Error(
        `Mureka API ${path} failed with ${response.status}: ${extractErrorMessage(payload) ?? text.slice(0, 300)}`
      );
    }

    return payload;
  };

  const waitForTask = async (taskId: string): Promise<unknown> => {
    const deadline = Date.now() + pollTimeoutMs;

    while (Date.now() < deadline) {
      const result = await requestJson(`/v1/song/query/${encodeURIComponent(taskId)}`);
      const status = extractStatus(result);

      if (isSuccessStatus(status) || extractAudioUrl(result)) {
        return result;
      }

      if (isFailureStatus(status)) {
        throw new Error(`Mureka remix task ${taskId} failed: ${extractErrorMessage(result) ?? status}`);
      }

      await sleep(pollIntervalMs);
    }

    throw new Error(`Mureka remix task ${taskId} timed out after ${pollTimeoutMs}ms.`);
  };

  return {
    name: "mureka",

    async analyzeSource(input) {
      const uploaded = await requestJson("/v1/files/upload", {
        method: "POST",
        body: JSON.stringify({
          url: input.sourceAudioUrl,
          purpose: "remix"
        })
      });
      const uploadAudioId = extractUploadAudioId(uploaded);

      if (!uploadAudioId) {
        throw new Error("Mureka upload response did not include an upload audio id.");
      }

      return {
        sections: [],
        melodyGuideUrl: `mureka://uploads/${uploadAudioId}`,
        providerData: {
          uploadAudioId
        }
      };
    },

    async generateConstrainedLyrics(input): Promise<GeneratedLyrics> {
      if (input.lyrics?.trim()) {
        return {
          text: input.lyrics.trim().slice(0, 3000)
        };
      }

      const generated = await requestJson("/v1/lyrics/generate", {
        method: "POST",
        body: JSON.stringify({
          prompt: input.prompt
        })
      });
      const lyrics = extractLyrics(generated);

      if (!lyrics) {
        throw new Error("Mureka lyrics response did not include lyrics. Provide lyrics in the remix request.");
      }

      return {
        text: lyrics.slice(0, 3000)
      };
    },

    async generateUserVocal(input) {
      return {
        audioUrl: input.voiceProfileId ? `mureka://voice-profiles/${input.voiceProfileId}` : "mureka://voice-profiles/default",
        voiceProfileId: input.voiceProfileId
      };
    },

    async mixRemix(input, _vocal, analysis: SourceAnalysis, lyrics) {
      const uploadAudioId = pickString(analysis.providerData, ["uploadAudioId", "upload_audio_id"]);

      if (!uploadAudioId) {
        throw new Error("Mureka remix requires an uploaded source audio id.");
      }

      const task = await requestJson("/v1/song/remix", {
        method: "POST",
        body: JSON.stringify({
          upload_audio_id: uploadAudioId,
          lyrics: lyrics.text.slice(0, 3000),
          prompt: buildPrompt(input),
          n: outputCount
        })
      });
      const taskId = extractTaskId(task);

      if (!taskId) {
        throw new Error("Mureka remix response did not include a task id.");
      }

      const result = await waitForTask(taskId);
      const candidates = [...extractArray(result, ["choices", "songs", "results"]), result];
      const masters: RemixArtifact[] = candidates.flatMap((candidate) => {
        const url = extractAudioUrl(candidate);

        return url
          ? [
              {
                kind: "master" as const,
                url,
                mimeType: url.endsWith(".wav") ? "audio/wav" : "audio/mpeg"
              }
            ]
          : [];
      });

      if (!masters.length) {
        throw new Error("Mureka remix completed but no audio URL was found in the response.");
      }

      return [
        ...masters,
        {
          kind: "report",
          url: `mureka://tasks/${taskId}`,
          mimeType: "application/json"
        }
      ];
    },

    async scoreQuality(_input, _artifacts): Promise<RemixQualityReport> {
      return {
        melodySimilarity: 0.8,
        lyricFit: 0.75,
        voiceSimilarity: 0.7,
        mixReadiness: 0.78,
        notes: ["Mureka generation completed. Offline quality scoring is not implemented in the MVP yet."]
      };
    }
  };
};
