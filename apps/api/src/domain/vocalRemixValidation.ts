import { z } from "zod";

const sourceAudioFileSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  base64: z.string().min(1)
});

const optionalTrimmedString = z
  .string()
  .trim()
  .min(1)
  .optional()
  .or(z.literal("").transform(() => undefined));

const commandJsonSchema = optionalTrimmedString.refine((value) => {
  if (!value) {
    return true;
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0 && parsed.every((part) => typeof part === "string");
  } catch {
    return false;
  }
}, "converterCommandJson must be a non-empty JSON string array.");

export const vocalRemixJobRequestSchema = z
  .object({
    sourceAudioPath: optionalTrimmedString,
    sourceAudioFile: sourceAudioFileSchema.optional(),
    voiceProfileId: optionalTrimmedString,
    converterMode: z.enum(["custom", "svc", "rvc"]).optional(),
    voiceModelPath: optionalTrimmedString,
    voiceIndexPath: optionalTrimmedString,
    outputDir: optionalTrimmedString,
    convertedVocalsPath: optionalTrimmedString,
    converterCommandJson: commandJsonSchema,
    converterBin: optionalTrimmedString,
    converterArgs: z.array(z.string()).optional(),
    converterCwd: optionalTrimmedString,
    separatorModel: optionalTrimmedString,
    separatorOutputFormat: optionalTrimmedString,
    separatorChunkDuration: z.coerce.number().positive().optional(),
    separatorImage: optionalTrimmedString,
    rights: z.object({
      hasSourceRights: z.boolean(),
      hasVoiceConsent: z.boolean(),
      allowPlatformProcessing: z.boolean()
    })
  })
  .refine((value) => Boolean(value.sourceAudioPath || value.sourceAudioFile), {
    message: "Either sourceAudioPath or sourceAudioFile is required.",
    path: ["sourceAudioPath"]
  })
  .refine((value) => Boolean(value.converterCommandJson || value.converterBin || value.converterMode === "svc" || value.converterMode === "rvc"), {
    message: "A converter mode, command JSON array, or converter executable is required.",
    path: ["converterCommandJson"]
  });
