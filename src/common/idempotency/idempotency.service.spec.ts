import { Test, TestingModule } from '@nestjs/testing';
import { IdempotencyService } from './idempotency.service';
import { REDIS_CLIENT } from '../redis/redis.module';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let redis: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [IdempotencyService, { provide: REDIS_CLIENT, useValue: redis }],
    }).compile();
    service = module.get(IdempotencyService);
  });

  it('executes the producer once and caches its result', async () => {
    redis.get.mockResolvedValueOnce(null);
    const producer = jest.fn().mockResolvedValue({ ok: true, value: 42 });
    const result = await service.getOrSet('idem:test:1', 60, producer);

    expect(result).toEqual({ ok: true, value: 42 });
    expect(producer).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenCalledWith('idem:test:1', JSON.stringify({ ok: true, value: 42 }), 'EX', 60);
  });

  it('replays the cached result without invoking the producer (idempotent retry)', async () => {
    redis.get.mockResolvedValueOnce(JSON.stringify({ ok: true, value: 'cached' }));
    const producer = jest.fn();

    const result = await service.getOrSet('idem:test:1', 60, producer);

    expect(result).toEqual({ ok: true, value: 'cached' });
    expect(producer).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('degrades gracefully when Redis read fails (executes producer, ignores cache)', async () => {
    redis.get.mockRejectedValueOnce(new Error('redis down'));
    const producer = jest.fn().mockResolvedValue({ ok: true });

    const result = await service.getOrSet('idem:test:1', 60, producer);
    expect(result).toEqual({ ok: true });
    expect(producer).toHaveBeenCalled();
  });

  it('propagates producer errors and does NOT cache failed results', async () => {
    redis.get.mockResolvedValueOnce(null);
    const producer = jest.fn().mockRejectedValue(new Error('domain failure'));

    await expect(service.getOrSet('idem:test:err', 60, producer)).rejects.toThrow('domain failure');
    expect(redis.set).not.toHaveBeenCalled();
  });

  it('still returns the producer result if the cache write fails', async () => {
    redis.get.mockResolvedValueOnce(null);
    redis.set.mockRejectedValueOnce(new Error('redis full'));
    const producer = jest.fn().mockResolvedValue({ ok: true });

    const result = await service.getOrSet('idem:test:1', 60, producer);
    expect(result).toEqual({ ok: true });
  });
});
