import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

/** HR onboarding sends base64 documents; default Express limit (~100kb) returns 413. */
const JSON_BODY_LIMIT = process.env.JSON_BODY_LIMIT ?? '100mb';

function isAllowedCorsOrigin(origin?: string) {
  if (!origin) {
    return true;
  }

  try {
    const parsed = new URL(origin);
    const host = parsed.hostname.toLowerCase();

    if (host === 'localhost' || host === '127.0.0.1') {
      return true;
    }

    if (host.endsWith('.localhost')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

function matchesAllowedOrigin(origin: string, allowedOrigin: string) {
  if (allowedOrigin === origin) {
    return true;
  }

  if (!allowedOrigin.includes('*')) {
    return false;
  }

  try {
    const originUrl = new URL(origin);
    const allowedUrl = new URL(allowedOrigin.replace('*.', 'placeholder.'));
    if (originUrl.protocol !== allowedUrl.protocol) {
      return false;
    }

    const wildcardHost = allowedOrigin
      .replace(`${allowedUrl.protocol}//`, '')
      .replace('*.', '');
    return originUrl.hostname === wildcardHost || originUrl.hostname.endsWith(`.${wildcardHost}`);
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);

  app.use(cookieParser());

  if (
    configService.get<string>('TRUST_PROXY') === 'true' ||
    configService.get<string>('NODE_ENV') === 'production'
  ) {
    app.set('trust proxy', 1);
  }

  app.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  app.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: true });

  const originsRaw = configService.get<string>('WEB_APP_ORIGINS')?.trim();
  const webAppAllowlist = originsRaw
    ? originsRaw
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean)
    : [];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (webAppAllowlist.length > 0) {
        if (webAppAllowlist.some((allowedOrigin) => matchesAllowedOrigin(origin, allowedOrigin))) {
          callback(null, origin);
          return;
        }
        callback(new Error(`CORS blocked for origin: ${origin}`), false);
        return;
      }
      if (isAllowedCorsOrigin(origin)) {
        callback(null, origin);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-bootstrap-admin-key',
      'x-org-id',
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle('peopleAIQ API')
    .setDescription('API documentation for peopleAIQ backend')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Optional: Bearer token for tooling. Production clients use HttpOnly cookies.',
      },
      'bearer',
    )
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, swaggerDoc, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });

  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
}
bootstrap();
