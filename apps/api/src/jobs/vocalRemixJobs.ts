import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path, { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type {
  LyricsAlignmentSummary,
  SourceAudioFile,
  RhythmBeatSource,
  RhythmSummary,
  VocalRemixArtifact,
  VocalRemixArtifactKind,
  VocalGuideSummary,
  VocalRemixJob,
  VocalRemixJobRequest,
  VocalRemixJobStatus
} from "@better-suno/shared";
import { resolveProjectPath, resolveVocalRemixRequest } from "../services/voice-profile-resolver";

type VocalConversionPipelineResult = {
  inputAudioPath: string;
  outputDir: string;
  vocalsPath: string;
  instrumentalPath: string;
  convertedVocalsPath: string;
  lyricsAlignmentPath?: string;
  lyricsAlignmentTextGridPath?: string;
  lyricsAlignment?: {
    provider?: {
      name?: string;
    };
    transcript?: {
      source?: string;
    };
    quality?: {
      wordCount?: number;
      phoneCount?: number;
      hasPhoneTimestamps?: boolean;
      warnings?: string[];
    };
  };
  rhythmPath?: string;
  rhythm?: {
    tempoBpm?: number | null;
    beats?: unknown[];
    phrases?: unknown[];
    vocalOnsets?: unknown[];
    summary?: {
      tempoBpm?: number | null;
      beatCount?: number;
      phraseCount?: number;
      vocalOnsetCount?: number;
      syllableCandidateCount?: number;
      beatSource?: string | null;
      warnings?: string[];
    };
    warnings?: string[];
  };
  vocalGuidePath?: string;
  melodyMidiPath?: string;
  alignmentJsonPath?: string;
  alignmentTextGridPath?: string;
  syllableMapPath?: string;
  vocalGuide?: {
    rhythm?: {
      phrases?: unknown[];
    };
    slots?: unknown[];
    lyrics?: {
      syllableCount?: number;
    };
    fit?: VocalGuideSummary["fit"];
  };
  conversion?: {
    converter?: {
      command: string;
      args: string[];
    };
  };
};

type RunVocalConversionPipeline = (
  inputAudioFile: string,
  options: {
    outputDir?: string;
    voiceProfileId?: string;
    voiceModelPath?: string;
    voiceIndexPath?: string;
    convertedVocalsPath?: string;
    originalLyrics?: string;
    originalLyricsPath?: string;
    generateLyricsAlignment?: boolean;
    lyricsAlignmentProvider?: "auto" | "mfa" | "whisperx" | "whisperx-mfa";
    lyricsAlignmentPath?: string;
    lyricsAlignmentTextGridPath?: string;
    lyricsAlignmentLanguage?: string;
    lyricsAlignmentPythonBin?: string;
    requireLyricsAlignmentPhones?: boolean;
    mfaBin?: string;
    mfaDictionary?: string;
    mfaDictionaryPath?: string;
    mfaAcousticModel?: string;
    mfaAcousticModelPath?: string;
    whisperxBin?: string;
    whisperxModel?: string;
    whisperxDevice?: string;
    whisperxComputeType?: string;
    whisperxBatchSize?: number;
    guideLyrics?: string;
    guideLyricsPath?: string;
    vocalGuidePath?: string;
    melodyMidiPath?: string;
    alignmentJsonPath?: string;
    alignmentTextGridPath?: string;
    syllableMapPath?: string;
    vocalGuideLanguage?: string;
    vocalGuidePythonBin?: string;
    vocalGuideMaxMismatchRatio?: number;
    requireVocalGuideMatch?: boolean;
    generateVocalGuide?: boolean;
    extractRhythm?: boolean;
    rhythmPath?: string;
    rhythmPythonBin?: string;
    rhythmBeatSource?: RhythmBeatSource;
    rhythmSampleRate?: number;
    rhythmHopLength?: number;
    converterCommandJson?: string;
    converterBin?: string;
    converterArgs?: string[];
    converterCwd?: string;
    separatorModel?: string;
    separatorOutputFormat?: string;
    separatorChunkDuration?: number;
    separatorImage?: string;
    onStage?: (stage: VocalRemixJobStatus) => void;
  }
) => Promise<VocalConversionPipelineResult>;

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, "../../../..");
const require = createRequire(import.meta.url);
const { runVocalConversionPipeline } = require(resolve(
  projectRoot,
  "scripts/lib/remix-v1-vocals-pipeline.js"
)) as {
  runVocalConversionPipeline: RunVocalConversionPipeline;
};

const jobs = new Map<string, VocalRemixJob>();

const timestamp = () => new Date().toISOString();

const saveJob = (job: VocalRemixJob) => {
  jobs.set(job.id, job);
};

const sanitizeFilename = (filename: string) => {
  const sanitized = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "-");
  return sanitized || "source-audio";
};

const storeUploadedSource = async (jobId: string, sourceAudioFile: SourceAudioFile): Promise<string> => {
  const uploadDir = path.join(projectRoot, "storage", "remix-v1-vocals", "uploads", jobId);
  await mkdir(uploadDir, { recursive: true });

  const uploadPath = path.join(uploadDir, sanitizeFilename(sourceAudioFile.filename));
  await writeFile(uploadPath, Buffer.from(sourceAudioFile.base64, "base64"));

  if (!existsSync(uploadPath)) {
    throw new Error(`Uploaded source audio could not be saved: ${uploadPath}`);
  }

  return uploadPath;
};

const prepareInputAudio = async (jobId: string, request: VocalRemixJobRequest): Promise<string> => {
  if (request.sourceAudioFile) {
    return storeUploadedSource(jobId, request.sourceAudioFile);
  }

  const sourceAudioPath = resolveProjectPath(request.sourceAudioPath);
  if (!sourceAudioPath) {
    throw new Error("Either sourceAudioPath or sourceAudioFile is required.");
  }

  return sourceAudioPath;
};

const artifactUrl = (jobId: string, kind: VocalRemixArtifactKind) =>
  `/v1/remix/vocals/jobs/${jobId}/artifacts/${kind}`;

const createArtifacts = (jobId: string, result: VocalConversionPipelineResult): VocalRemixArtifact[] => {
  const artifacts: VocalRemixArtifact[] = [
    {
      kind: "vocals",
      url: artifactUrl(jobId, "vocals"),
      path: result.vocalsPath,
      mimeType: "audio/wav"
    },
    {
      kind: "instrumental",
      url: artifactUrl(jobId, "instrumental"),
      path: result.instrumentalPath,
      mimeType: "audio/wav"
    },
    {
      kind: "converted-vocals",
      url: artifactUrl(jobId, "converted-vocals"),
      path: result.convertedVocalsPath,
      mimeType: "audio/wav"
    }
  ];

  if (result.vocalGuidePath) {
    artifacts.push({
      kind: "vocal-guide",
      url: artifactUrl(jobId, "vocal-guide"),
      path: result.vocalGuidePath,
      mimeType: "application/json"
    });
  }

  if (result.melodyMidiPath) {
    artifacts.push({
      kind: "melody-midi",
      url: artifactUrl(jobId, "melody-midi"),
      path: result.melodyMidiPath,
      mimeType: "audio/midi"
    });
  }

  if (result.alignmentJsonPath) {
    artifacts.push({
      kind: "alignment-json",
      url: artifactUrl(jobId, "alignment-json"),
      path: result.alignmentJsonPath,
      mimeType: "application/json"
    });
  }

  if (result.alignmentTextGridPath) {
    artifacts.push({
      kind: "alignment-textgrid",
      url: artifactUrl(jobId, "alignment-textgrid"),
      path: result.alignmentTextGridPath,
      mimeType: "text/plain"
    });
  }

  if (result.syllableMapPath) {
    artifacts.push({
      kind: "syllable-map",
      url: artifactUrl(jobId, "syllable-map"),
      path: result.syllableMapPath,
      mimeType: "application/json"
    });
  }

  if (result.lyricsAlignmentPath) {
    artifacts.push({
      kind: "lyrics-alignment",
      url: artifactUrl(jobId, "lyrics-alignment"),
      path: result.lyricsAlignmentPath,
      mimeType: "application/json"
    });
  }

  if (result.lyricsAlignmentTextGridPath) {
    artifacts.push({
      kind: "lyrics-alignment-textgrid",
      url: artifactUrl(jobId, "lyrics-alignment-textgrid"),
      path: result.lyricsAlignmentTextGridPath,
      mimeType: "text/plain"
    });
  }

  if (result.rhythmPath) {
    artifacts.push({
      kind: "rhythm",
      url: artifactUrl(jobId, "rhythm"),
      path: result.rhythmPath,
      mimeType: "application/json"
    });
  }

  return artifacts;
};

const createLyricsAlignmentSummary = (result: VocalConversionPipelineResult): LyricsAlignmentSummary | undefined => {
  if (!result.lyricsAlignmentPath || !result.lyricsAlignment?.quality) {
    return undefined;
  }

  return {
    path: result.lyricsAlignmentPath,
    textGridPath: result.lyricsAlignmentTextGridPath,
    provider: result.lyricsAlignment.provider?.name ?? null,
    transcriptSource: result.lyricsAlignment.transcript?.source ?? null,
    wordCount: result.lyricsAlignment.quality.wordCount ?? 0,
    phoneCount: result.lyricsAlignment.quality.phoneCount ?? 0,
    hasPhoneTimestamps: Boolean(result.lyricsAlignment.quality.hasPhoneTimestamps),
    warnings: result.lyricsAlignment.quality.warnings ?? []
  };
};

const createRhythmSummary = (result: VocalConversionPipelineResult): RhythmSummary | undefined => {
  if (!result.rhythmPath || !result.rhythm) {
    return undefined;
  }

  return {
    path: result.rhythmPath,
    tempoBpm: result.rhythm.summary?.tempoBpm ?? result.rhythm.tempoBpm ?? null,
    beatCount: result.rhythm.summary?.beatCount ?? result.rhythm.beats?.length ?? 0,
    phraseCount: result.rhythm.summary?.phraseCount ?? result.rhythm.phrases?.length ?? 0,
    vocalOnsetCount: result.rhythm.summary?.vocalOnsetCount ?? result.rhythm.vocalOnsets?.length ?? 0,
    syllableCandidateCount: result.rhythm.summary?.syllableCandidateCount ?? 0,
    beatSource: result.rhythm.summary?.beatSource ?? null,
    warnings: result.rhythm.summary?.warnings ?? result.rhythm.warnings ?? []
  };
};

const createVocalGuideSummary = (result: VocalConversionPipelineResult): VocalGuideSummary | undefined => {
  if (!result.vocalGuidePath || !result.vocalGuide?.fit) {
    return undefined;
  }

  return {
    path: result.vocalGuidePath,
    phraseCount: result.vocalGuide.rhythm?.phrases?.length ?? 0,
    slotCount: result.vocalGuide.slots?.length ?? result.vocalGuide.fit.slotCount,
    lyricSyllableCount: result.vocalGuide.lyrics?.syllableCount ?? result.vocalGuide.fit.lyricSyllableCount,
    fit: result.vocalGuide.fit
  };
};

const updateJobStatus = (jobId: string, status: VocalRemixJobStatus) => {
  const current = jobs.get(jobId);
  if (!current || current.status === status) {
    return;
  }

  saveJob({
    ...current,
    status,
    updatedAt: timestamp()
  });
};

const runJob = async (job: VocalRemixJob) => {
  const inputAudioPath = await prepareInputAudio(job.id, job.request);
  const outputDir =
    resolveProjectPath(job.request.outputDir) ?? path.join(projectRoot, "storage", "remix-v1-vocals", "jobs", job.id);

  saveJob({
    ...job,
    status: "separating",
    inputAudioPath,
    outputDir,
    updatedAt: timestamp()
  });

  const result = await runVocalConversionPipeline(inputAudioPath, {
    outputDir,
    voiceProfileId: job.request.voiceProfileId,
    voiceModelPath: resolveProjectPath(job.request.voiceModelPath),
    voiceIndexPath: resolveProjectPath(job.request.voiceIndexPath),
    convertedVocalsPath: resolveProjectPath(job.request.convertedVocalsPath),
    originalLyrics: job.request.originalLyrics,
    originalLyricsPath: resolveProjectPath(job.request.originalLyricsPath),
    generateLyricsAlignment: job.request.generateLyricsAlignment,
    lyricsAlignmentProvider: job.request.lyricsAlignmentProvider,
    lyricsAlignmentPath: resolveProjectPath(job.request.lyricsAlignmentPath),
    lyricsAlignmentTextGridPath: resolveProjectPath(job.request.lyricsAlignmentTextGridPath),
    lyricsAlignmentLanguage: job.request.lyricsAlignmentLanguage,
    lyricsAlignmentPythonBin: job.request.lyricsAlignmentPythonBin,
    requireLyricsAlignmentPhones: job.request.requireLyricsAlignmentPhones,
    mfaBin: job.request.mfaBin,
    mfaDictionary: job.request.mfaDictionary,
    mfaDictionaryPath: resolveProjectPath(job.request.mfaDictionaryPath),
    mfaAcousticModel: job.request.mfaAcousticModel,
    mfaAcousticModelPath: resolveProjectPath(job.request.mfaAcousticModelPath),
    whisperxBin: job.request.whisperxBin,
    whisperxModel: job.request.whisperxModel,
    whisperxDevice: job.request.whisperxDevice,
    whisperxComputeType: job.request.whisperxComputeType,
    whisperxBatchSize: job.request.whisperxBatchSize,
    guideLyrics: job.request.guideLyrics,
    guideLyricsPath: resolveProjectPath(job.request.guideLyricsPath),
    vocalGuidePath: resolveProjectPath(job.request.vocalGuidePath),
    melodyMidiPath: resolveProjectPath(job.request.melodyMidiPath),
    alignmentJsonPath: resolveProjectPath(job.request.alignmentJsonPath),
    alignmentTextGridPath: resolveProjectPath(job.request.alignmentTextGridPath),
    syllableMapPath: resolveProjectPath(job.request.syllableMapPath),
    vocalGuideLanguage: job.request.vocalGuideLanguage,
    vocalGuidePythonBin: job.request.vocalGuidePythonBin,
    vocalGuideMaxMismatchRatio: job.request.vocalGuideMaxMismatchRatio,
    requireVocalGuideMatch: job.request.requireVocalGuideMatch,
    generateVocalGuide: job.request.generateVocalGuide,
    extractRhythm: job.request.extractRhythm,
    rhythmPath: resolveProjectPath(job.request.rhythmPath),
    rhythmPythonBin: job.request.rhythmPythonBin,
    rhythmBeatSource: job.request.rhythmBeatSource,
    rhythmSampleRate: job.request.rhythmSampleRate,
    rhythmHopLength: job.request.rhythmHopLength,
    converterCommandJson: job.request.converterCommandJson,
    converterBin: job.request.converterBin,
    converterArgs: job.request.converterArgs,
    converterCwd: resolveProjectPath(job.request.converterCwd),
    separatorModel: job.request.separatorModel,
    separatorOutputFormat: job.request.separatorOutputFormat,
    separatorChunkDuration: job.request.separatorChunkDuration,
    separatorImage: job.request.separatorImage,
    onStage: (stage) => updateJobStatus(job.id, stage)
  });

  const current = jobs.get(job.id) ?? job;
  saveJob({
    ...current,
    status: "completed",
    inputAudioPath: result.inputAudioPath,
    outputDir: result.outputDir,
    artifacts: createArtifacts(job.id, result),
    converter: result.conversion?.converter,
    lyricsAlignment: createLyricsAlignmentSummary(result),
    rhythm: createRhythmSummary(result),
    vocalGuide: createVocalGuideSummary(result),
    updatedAt: timestamp()
  });
};

export const listVocalRemixJobs = (): VocalRemixJob[] =>
  Array.from(jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const getVocalRemixJob = (id: string): VocalRemixJob | undefined => jobs.get(id);

export const getVocalRemixArtifact = (id: string, kind: string): VocalRemixArtifact | undefined =>
  getVocalRemixJob(id)?.artifacts.find((artifact) => artifact.kind === kind);

export const createVocalRemixJob = (request: VocalRemixJobRequest): VocalRemixJob => {
  if (!request.rights.hasSourceRights || !request.rights.hasVoiceConsent || !request.rights.allowPlatformProcessing) {
    throw new Error("Rights confirmation is required before creating a vocal remix job.");
  }

  const resolvedRequest = resolveVocalRemixRequest(request);

  const job: VocalRemixJob = {
    id: crypto.randomUUID(),
    status: "queued",
    request: resolvedRequest,
    artifacts: [],
    createdAt: timestamp(),
    updatedAt: timestamp()
  };

  saveJob(job);

  queueMicrotask(async () => {
    try {
      await runJob(job);
    } catch (error) {
      const latestJob = jobs.get(job.id) ?? job;
      saveJob({
        ...latestJob,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown vocal remix pipeline error.",
        updatedAt: timestamp()
      });
    }
  });

  return job;
};
