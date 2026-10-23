import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // Preserve raw body buffer for webhook signature verification
  });

  // Requests from the portal arrive via Next.js rewrites, so the client IP is in
  // X-Forwarded-For. Trust it only from known proxies (loopback by default;
  // set TRUST_PROXY in production) so IP-based rate limits can't be spoofed.
  app.set('trust proxy', process.env.TRUST_PROXY ?? 'loopback');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  console.log(`🚀 Vima API running on port ${port}`);
}

bootstrap();
