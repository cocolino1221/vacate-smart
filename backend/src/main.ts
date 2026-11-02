import 'reflect-metadata';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  // rawBody: necesar pentru verificarea semnăturii webhook-urilor Stripe
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  app.set('trust proxy', 1); // în spatele Nginx – IP-ul real al clientului (cerut de RateHawk la booking)
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  const port = parseInt(process.env.PORT ?? '4000', 10);
  await app.listen(port);
  Logger.log(`API pornit pe portul ${port}`, 'Bootstrap');
}
bootstrap();
