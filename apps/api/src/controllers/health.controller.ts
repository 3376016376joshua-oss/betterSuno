import { Controller, Get } from "@nestjs/common";
import { env } from "../config/env";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return {
      ok: true,
      provider: env.MUSIC_PROVIDER,
      timestamp: new Date().toISOString()
    };
  }
}
