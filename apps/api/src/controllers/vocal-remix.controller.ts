import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Res
} from "@nestjs/common";
import type { Response } from "express";
import type {
  CreateVocalRemixJobResponse,
  GetVocalRemixJobResponse,
  VocalRemixJobRequest
} from "@better-suno/shared";
import { ZodError } from "zod";
import { vocalRemixJobRequestSchema } from "../domain/vocalRemixValidation";
import { VocalRemixService } from "../services/vocal-remix.service";

@Controller("v1/remix/vocals/jobs")
export class VocalRemixController {
  constructor(@Inject(VocalRemixService) private readonly vocalRemixService: VocalRemixService) {}

  @Post()
  @HttpCode(202)
  createJob(@Body() body: unknown): CreateVocalRemixJobResponse {
    const request = this.parseRequest(body);

    try {
      return {
        job: this.vocalRemixService.createJob(request)
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("Rights confirmation")) {
        throw new BadRequestException(error.message);
      }

      if (error instanceof Error && isConfigurationError(error.message)) {
        throw new BadRequestException(error.message);
      }

      throw error;
    }
  }

  @Get()
  listJobs() {
    return {
      jobs: this.vocalRemixService.listJobs()
    };
  }

  @Get(":id")
  getJob(@Param("id") id: string): GetVocalRemixJobResponse {
    const job = this.vocalRemixService.getJob(id);

    if (!job) {
      throw new NotFoundException("Vocal remix job not found.");
    }

    return { job };
  }

  @Get(":id/artifacts/:kind")
  getArtifact(@Param("id") id: string, @Param("kind") kind: string, @Res() response: Response) {
    const job = this.vocalRemixService.getJob(id);
    if (!job) {
      throw new NotFoundException("Vocal remix job not found.");
    }

    const artifact = this.vocalRemixService.getArtifact(id, kind);
    if (!artifact) {
      throw new NotFoundException("Vocal remix artifact not found.");
    }

    response.type(artifact.mimeType);
    return response.sendFile(artifact.path);
  }

  private parseRequest(body: unknown): VocalRemixJobRequest {
    try {
      return vocalRemixJobRequestSchema.parse(body);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: "Invalid vocal remix job request.",
          issues: error.issues
        });
      }

      throw error;
    }
  }
}

function isConfigurationError(message: string) {
  return [
    "Voice profile",
    "Voice model",
    "Voice index",
    "converter command",
    "Remote voice artifact",
    "converter command must",
    "No SVC converter",
    "No RVC converter"
  ].some((prefix) => message.includes(prefix));
}
