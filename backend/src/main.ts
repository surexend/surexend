import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as dns from 'dns';
import { PrismaService } from './prisma/prisma.service';

// Set DNS servers to prevent local network resolution timeouts
// Trigger deployment with auto-deploy active
dns.setServers(['8.8.8.8', '1.1.1.1']);
import helmet from 'helmet';
import * as compression from 'compression';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Admin bootstrap — promote accounts listed in ADMIN_EMAILS (comma-separated)
  // on every boot. Idempotent; safer than a shell script that can't reach the
  // container filesystem (the production image ships dist/ only). Set e.g.
  // ADMIN_EMAILS=demo@surexend.com,ops@surexend.com in Railway, redeploy, then
  // remove the var once promoted.
  const prisma = app.get(PrismaService);
  const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (adminEmails.length) {
    try {
      const promoted = await prisma.user.updateMany({
        where: { email: { in: adminEmails } },
        data: { role: 'ADMIN' },
      });
      console.log(`[admin] promoted ${promoted.count} user(s) to ADMIN via ADMIN_EMAILS`);
    } catch (error) {
      console.error('[admin] ADMIN_EMAILS bootstrap failed:', (error as Error).message);
    }
  }

  app.use(helmet());
  app.use(compression());
  
  const allowedOrigins = [
    'https://surexend.com',
    'https://surexend.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      const isAllowed =
        !origin ||
        allowedOrigins.includes(origin) ||
        origin.endsWith('.vercel.app') ||
        origin.endsWith('.monkeycode-ai.live') ||
        origin.startsWith('http://localhost:');
      if (isAllowed) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const port = configService.get<number>('app.port') || 3001;
  await app.listen(port);
  console.log(`SureXend backend running on port ${port}`);
}
bootstrap();
