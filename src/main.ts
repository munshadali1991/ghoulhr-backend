import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

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

    if (host === 'localhost' || host.endsWith('.localhost')) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: (origin, callback) => {
      if (isAllowedCorsOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-bootstrap-admin-key'],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: false,
    }),
  );
  const swaggerConfig = new DocumentBuilder()
    .setTitle('GhoulHRMS API')
    .setDescription('API documentation for GhoulHRMS backend')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter access token in format: Bearer <token>',
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
