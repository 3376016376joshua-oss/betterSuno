import "reflect-metadata";
import express from "express";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { env } from "./config/env";

const app = await NestFactory.create(AppModule, {
  bodyParser: false
});

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

app.enableCors({
  origin: env.CORS_ORIGIN === "*" ? true : env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
});

await app.listen(env.API_PORT, "0.0.0.0");
