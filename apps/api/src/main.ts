import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";

import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global validation pipe — strips unknown properties, transforms types
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // CORS — open for local dev; tighten in production
  app.enableCors({
    origin: process.env["ALLOWED_ORIGINS"]?.split(",") ?? [
      "http://localhost:3000",
      "http://localhost:3001",
    ],
    credentials: true,
  });

  // Global prefix for REST routes
  app.setGlobalPrefix("api");

  const port = process.env["PORT"] ?? 4000;
  await app.listen(port);
  console.warn(`🚀 RicherWealth API running on http://localhost:${port}/api`);
  console.warn(`📊 GraphQL playground: http://localhost:${port}/graphql`);
}

void bootstrap();
