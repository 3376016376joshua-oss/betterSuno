import type { RemixJob, RemixJobRequest } from "@better-suno/shared";
import type { MusicProvider } from "../providers/types";

const timestamp = () => new Date().toISOString();

export const createInitialJob = (id: string, request: RemixJobRequest): RemixJob => ({
  id,
  status: "queued",
  request,
  artifacts: [],
  createdAt: timestamp(),
  updatedAt: timestamp()
});

export const runRemixPipeline = async (
  job: RemixJob,
  provider: MusicProvider,
  onUpdate: (job: RemixJob) => void
): Promise<RemixJob> => {
  let current: RemixJob = { ...job, status: "analyzing", updatedAt: timestamp() };
  onUpdate(current);

  const analysis = await provider.analyzeSource(current.request);

  current = { ...current, status: "generating", updatedAt: timestamp() };
  onUpdate(current);

  const lyrics = await provider.generateConstrainedLyrics(current.request, analysis);
  const vocal = await provider.generateUserVocal(current.request, lyrics, analysis);

  current = { ...current, status: "mixing", updatedAt: timestamp() };
  onUpdate(current);

  const artifacts = await provider.mixRemix(current.request, vocal, analysis, lyrics);
  const quality = await provider.scoreQuality(current.request, artifacts);

  current = {
    ...current,
    status: "completed",
    artifacts,
    quality,
    updatedAt: timestamp()
  };
  onUpdate(current);

  return current;
};
