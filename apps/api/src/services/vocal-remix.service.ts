import { Injectable } from "@nestjs/common";
import type { VocalRemixArtifact, VocalRemixJob, VocalRemixJobRequest } from "@better-suno/shared";
import {
  createVocalRemixJob,
  getVocalRemixArtifact,
  getVocalRemixJob,
  listVocalRemixJobs
} from "../jobs/vocalRemixJobs";

@Injectable()
export class VocalRemixService {
  createJob(request: VocalRemixJobRequest): VocalRemixJob {
    return createVocalRemixJob(request);
  }

  listJobs(): VocalRemixJob[] {
    return listVocalRemixJobs();
  }

  getJob(id: string): VocalRemixJob | undefined {
    return getVocalRemixJob(id);
  }

  getArtifact(id: string, kind: string): VocalRemixArtifact | undefined {
    return getVocalRemixArtifact(id, kind);
  }
}
