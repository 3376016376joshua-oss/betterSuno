import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { env } from "./config/env";

const app = await NestFactory.create(AppModule);

app.enableCors({
  origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
});

await app.listen(env.API_PORT, "0.0.0.0");
