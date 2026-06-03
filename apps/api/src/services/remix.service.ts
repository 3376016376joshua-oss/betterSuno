import { Injectable } from "@nestjs/common";
import type { RemixJob, RemixJobRequest } from "@better-suno/shared";
import { createJob, getJob, listJobs } from "../jobs/remixJobs";

@Injectable()
export class RemixService {
  createJob(request: RemixJobRequest): RemixJob {
    return createJob(request);
  }

  listJobs(): RemixJob[] {
    return listJobs();
  }

  getJob(id: string): RemixJob | undefined {
    return getJob(id);
  }
}
