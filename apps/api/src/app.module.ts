import { Module } from "@nestjs/common";
import { HealthController } from "./controllers/health.controller";
import { RemixController } from "./controllers/remix.controller";
import { VocalRemixController } from "./controllers/vocal-remix.controller";
import { RemixService } from "./services/remix.service";
import { VocalRemixService } from "./services/vocal-remix.service";

@Module({
  controllers: [HealthController, RemixController, VocalRemixController],
  providers: [RemixService, VocalRemixService]
})
export class AppModule {}
