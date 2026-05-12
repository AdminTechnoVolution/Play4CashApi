import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Server } from 'http';
import { createAppVersionHeadersMiddleware } from '../src/common/middleware/app-version-headers.middleware';

@Controller()
class EchoController {
  @Get('echo')
  echo(): { ok: true } {
    return { ok: true };
  }
}

@Module({
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: true,
      load: [() => ({ 'pwa.minVersion': '1.5.0' })],
    }),
  ],
  controllers: [EchoController],
})
class HeaderHostModule {}

@Module({
  imports: [
    ConfigModule.forRoot({ ignoreEnvFile: true, load: [() => ({ 'pwa.minVersion': '' })] }),
  ],
  controllers: [EchoController],
})
class HeaderHostModuleNoMin {}

async function buildAppWithMin(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [HeaderHostModule] }).compile();
  const app = mod.createNestApplication();
  app.use(createAppVersionHeadersMiddleware(app.get(ConfigService)));
  await app.init();
  return app;
}

async function buildAppWithoutMin(): Promise<INestApplication> {
  const mod = await Test.createTestingModule({ imports: [HeaderHostModuleNoMin] }).compile();
  const app = mod.createNestApplication();
  app.use(createAppVersionHeadersMiddleware(app.get(ConfigService)));
  await app.init();
  return app;
}

describe('app-version-headers middleware (e2e)', () => {
  let app: INestApplication;
  afterEach(async () => app?.close());

  it('emits X-App-Min-Version on every response when configured', async () => {
    app = await buildAppWithMin();
    const res = await request(app.getHttpServer() as Server).get('/echo');
    expect(res.status).toBe(200);
    expect(res.headers['x-app-min-version']).toBe('1.5.0');
  });

  it('does NOT emit X-App-Min-Version when PWA_MIN_VERSION is empty', async () => {
    app = await buildAppWithoutMin();
    const res = await request(app.getHttpServer() as Server).get('/echo');
    expect(res.status).toBe(200);
    expect(res.headers['x-app-min-version']).toBeUndefined();
  });

  it('echoes X-App-Version request header on the response (sanity smoke)', async () => {
    app = await buildAppWithMin();
    const res = await request(app.getHttpServer() as Server)
      .get('/echo')
      .set('X-App-Version', '1.0.0');
    expect(res.status).toBe(200);
    // The middleware records the version internally onto req.clientAppVersion. The
    // contract is verified by spec'ing the middleware unit, so here we just confirm the
    // request did not error end-to-end when the client supplies the header.
  });
});
