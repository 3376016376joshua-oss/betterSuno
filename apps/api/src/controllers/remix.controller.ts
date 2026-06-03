import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post
} from "@nestjs/common";
import type { CreateRemixJobResponse, GetRemixJobResponse, RemixJobRequest } from "@better-suno/shared";
import { ZodError } from "zod";
import { remixJobRequestSchema } from "../domain/remixValidation";
import { RemixService } from "../services/remix.service";

@Controller("v1/remix/jobs")
export class RemixController {
  constructor(@Inject(RemixService) private readonly remixService: RemixService) {}

  @Post()
  @HttpCode(202)
  createJob(@Body() body: unknown): CreateRemixJobResponse {
    const request = this.parseRequest(body);

    try {
      return {
        job: this.remixService.createJob(request)
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("Rights confirmation")) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  @Get()
  listJobs() {
    return {
      jobs: this.remixService.listJobs()
    };
  }

  @Get(":id")
  getJob(@Param("id") id: string): GetRemixJobResponse {
    const job = this.remixService.getJob(id);

    if (!job) {
      throw new NotFoundException("Remix job not found.");
    }

    return { job };
  }

  private parseRequest(body: unknown): RemixJobRequest {
    try {
      return remixJobRequestSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: "Invalid remix job request.",
          issues: error.issues
        });
      }

      throw error;
    }
  }
}
