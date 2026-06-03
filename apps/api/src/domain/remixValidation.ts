import { z } from "zod";

export const remixJobRequestSchema = z.object({
  sourceAudioUrl: z.string().url(),
  voiceProfileId: z.string().min(1).optional(),
  prompt: z.string().min(1).max(2000),
  lyrics: z.string().max(5000).optional(),
  targetLanguage: z.enum(["en", "zh", "ja", "ko", "es", "custom"]),
  durationSeconds: z.number().int().min(15).max(90),
  intent: z.enum(["cover", "parody", "translation", "brand_jingle", "original_variant"]),
  keepMelodyStrength: z.number().min(0).max(1),
  rights: z.object({
    hasSourceRights: z.boolean(),
    hasVoiceConsent: z.boolean(),
    allowPlatformProcessing: z.boolean()
  })
});
