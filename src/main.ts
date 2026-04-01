import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // ─── Security Headers ─────────────────────────────────────────────────────
  app.use(helmet());

  // ─── NoSQL Injection Protection ───────────────────────────────────────────
  // Custom wrapper for Express 5 compatibility (req.query is read-only)
  app.use((req: any, _res: any, next: any) => {
    if (req.body) req.body = mongoSanitize.sanitize(req.body);
    if (req.params) req.params = mongoSanitize.sanitize(req.params);
    next();
  });

  // ─── CORS ─────────────────────────────────────────────────────────────────
  const allowedOrigins = config.get<string[]>('cors.allowedOrigins') || [];
  app.enableCors({
    origin: (origin: string | undefined, callback: Function) => {
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        // Return false (403) without throwing — avoids polluting the error logs
        callback(null, false);
      }
    },
    credentials: true,
  });

  // ─── API Prefix ───────────────────────────────────────────────────────────
  app.setGlobalPrefix('api');

  // ─── Swagger ──────────────────────────────────────────────────────────────
  if (config.get<boolean>('swagger.enabled')) {
    const swaggerPassword = config.get<string>('swagger.password');

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Play4Cash API')
      .setDescription('Play4Cash RESTful & WebSocket API')
      .setVersion('2.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);

    // Password-protect Swagger UI
    app.use('/api-docs', (req: any, res: any, next: any) => {
      if (!swaggerPassword) return res.status(403).json({ success: false, messages: ['Swagger not accessible'] });
      const authHeader: string = req.headers['authorization'] || '';
      if (!authHeader.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Swagger API Docs"');
        return res.status(401).json({ success: false, messages: ['Authentication required'] });
      }
      const [, password] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
      if (password !== swaggerPassword) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Swagger API Docs"');
        return res.status(401).json({ success: false, messages: ['Invalid credentials'] });
      }
      next();
    });

    SwaggerModule.setup('api-docs', app, document);
  }

  const port = config.get<number>('port') || 3000;
  await app.listen(port, '0.0.0.0');
  console.log(`🚀 Play4Cash NestJS server running on port ${port}`);
}

bootstrap();
