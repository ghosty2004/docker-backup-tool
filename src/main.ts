import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule);
}

bootstrap().catch((err: Error) => {
  console.error('Failed to bootstrap', err.stack);
});
