import crypto from "node:crypto";
import type { RemixJob, RemixJobRequest } from "@better-suno/shared";
import { getMusicProvider } from "../providers";
import { createInitialJob, runRemixPipeline } from "../pipelines/remixPipeline";

const jobs = new Map<string, RemixJob>();

const saveJob = (job: RemixJob) => {
  jobs.set(job.id, job);
};

export const listJobs = (): RemixJob[] => Array.from(jobs.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

export const getJob = (id: string): RemixJob | undefined => jobs.get(id);

export const createJob = (request: RemixJobRequest): RemixJob => {
  if (!request.rights.hasSourceRights || !request.rights.hasVoiceConsent || !request.rights.allowPlatformProcessing) {
    throw new Error("Rights confirmation is required before creating a remix job.");
  }

  const job = createInitialJob(crypto.randomUUID(), request);
  saveJob(job);

  queueMicrotask(async () => {
    try {
      await runRemixPipeline(job, getMusicProvider(), saveJob);
    } catch (error) {
      const latestJob = getJob(job.id) ?? job;
      saveJob({
        ...latestJob,
        status: "failed",
        error: error instanceof Error ? error.message : "Unknown remix pipeline error.",
        updatedAt: new Date().toISOString()
      });
    }
  });

  return job;
};
