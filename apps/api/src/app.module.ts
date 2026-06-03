import { Module } from "@nestjs/common";
import { HealthController } from "./controllers/health.controller";
import { RemixController } from "./controllers/remix.controller";
import { RemixService } from "./services/remix.service";

@Module({
  controllers: [HealthController, RemixController],
  providers: [RemixService]
})
export class AppModule {}
