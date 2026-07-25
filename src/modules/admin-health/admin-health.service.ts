import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
import { REDIS_CLIENT } from '../../common/redis/redis.module';
import { RoomsGateway } from '../websockets/rooms/rooms.gateway';

export type InfrastructureStatus = 'healthy' | 'degraded' | 'unavailable';

export interface InfrastructureCheck {
  status: InfrastructureStatus;
  latency_ms: number;
  error_code?: string;
}

export interface InfrastructureHealth {
  status: 'healthy' | 'degraded';
  checked_at: string;
  uptime_seconds: number;
  services: {
    api: InfrastructureCheck;
    mongodb: InfrastructureCheck;
    redis: InfrastructureCheck;
    websocket: InfrastructureCheck & {
      initialized: boolean;
      redis_adapter_enabled: boolean;
      connected_clients: number;
    };
  };
}

const CHECK_TIMEOUT_MS = 2_000;

@Injectable()
export class AdminHealthService {
  constructor(
    @InjectConnection() private readonly connection: Connection,
    @Inject(REDIS_CLIENT) private readonly redis: any,
    private readonly roomsGateway: RoomsGateway,
    private readonly config: ConfigService,
  ) {}

  async check(): Promise<InfrastructureHealth> {
    const apiStarted = performance.now();
    await Promise.resolve();
    const api: InfrastructureCheck = {
      status: 'healthy',
      latency_ms: this.elapsed(apiStarted),
    };

    const [mongodb, redis, websocket] = await Promise.all([
      this.checkDependency(async () => {
        if (!this.connection.db) throw new Error('MONGODB_NOT_INITIALIZED');
        await this.connection.db.admin().ping();
      }, 'MONGODB_UNAVAILABLE'),
      this.checkDependency(async () => {
        const response = await this.redis.ping();
        if (response !== 'PONG') throw new Error('REDIS_INVALID_RESPONSE');
      }, 'REDIS_UNAVAILABLE'),
      this.checkWebsocket(),
    ]);

    const status = [mongodb, redis, websocket].every((item) => item.status === 'healthy')
      ? 'healthy'
      : 'degraded';

    return {
      status,
      checked_at: new Date().toISOString(),
      uptime_seconds: Math.floor(process.uptime()),
      services: { api, mongodb, redis, websocket },
    };
  }

  private async checkWebsocket(): Promise<InfrastructureHealth['services']['websocket']> {
    const initialized = Boolean(this.roomsGateway.server);
    const redisAdapterEnabled = Boolean(this.config.get<boolean>('socketIoRedisAdapter'));
    if (!initialized) {
      return {
        status: 'unavailable',
        latency_ms: 0,
        initialized: false,
        redis_adapter_enabled: redisAdapterEnabled,
        connected_clients: 0,
        error_code: 'WEBSOCKET_NOT_INITIALIZED',
      };
    }

    const started = performance.now();
    try {
      const sockets = await this.withTimeout(this.roomsGateway.server.fetchSockets());
      return {
        status: 'healthy',
        latency_ms: this.elapsed(started),
        initialized: true,
        redis_adapter_enabled: redisAdapterEnabled,
        connected_clients: sockets.length,
      };
    } catch (error) {
      return {
        status: this.isTimeout(error) ? 'degraded' : 'unavailable',
        latency_ms: this.elapsed(started),
        initialized: true,
        redis_adapter_enabled: redisAdapterEnabled,
        connected_clients: 0,
        error_code: this.isTimeout(error) ? 'WEBSOCKET_TIMEOUT' : 'WEBSOCKET_UNAVAILABLE',
      };
    }
  }

  private async checkDependency(
    operation: () => Promise<void>,
    unavailableCode: string,
  ): Promise<InfrastructureCheck> {
    const started = performance.now();
    try {
      await this.withTimeout(operation());
      return { status: 'healthy', latency_ms: this.elapsed(started) };
    } catch (error) {
      const timeout = this.isTimeout(error);
      return {
        status: timeout ? 'degraded' : 'unavailable',
        latency_ms: this.elapsed(started),
        error_code: timeout ? `${unavailableCode.replace('_UNAVAILABLE', '')}_TIMEOUT` : unavailableCode,
      };
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('HEALTH_CHECK_TIMEOUT')), CHECK_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private isTimeout(error: unknown): boolean {
    return error instanceof Error && error.message === 'HEALTH_CHECK_TIMEOUT';
  }

  private elapsed(started: number): number {
    return Math.max(0, Math.round((performance.now() - started) * 100) / 100);
  }
}

