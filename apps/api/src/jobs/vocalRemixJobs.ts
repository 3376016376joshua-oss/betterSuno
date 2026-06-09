import crypto from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path, { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type {
  SourceAudioFile,
  VocalRemixArtifact,
  VocalRemixArtifactKind,
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

const createArtifacts = (jobId: string, result: VocalConversionPipelineResult): VocalRemixArtifact[] => [
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
