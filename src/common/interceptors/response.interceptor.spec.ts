import { firstValueFrom, of } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { ResponseInterceptor } from './response.interceptor';

function makeContext(): ExecutionContext {
  return {} as ExecutionContext;
}

function makeHandler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

describe('ResponseInterceptor', () => {
  const interceptor = new ResponseInterceptor();

  it('wraps plain data in { success, messages, data }', async () => {
    const out = await firstValueFrom(
      interceptor.intercept(makeContext(), makeHandler({ x: 1 })),
    );
    expect(out).toEqual({ success: true, messages: [], data: { x: 1 } });
  });

  it('wraps null with data: null', async () => {
    const out = await firstValueFrom(
      interceptor.intercept(makeContext(), makeHandler(null as unknown)),
    );
    expect(out).toEqual({ success: true, messages: [], data: null });
  });

  it('wraps undefined with data: null', async () => {
    const out = await firstValueFrom(
      interceptor.intercept(makeContext(), makeHandler(undefined as unknown)),
    );
    expect(out).toEqual({ success: true, messages: [], data: null });
  });

  it('passes through if data already has a "success" key', async () => {
    const passthrough = { success: false, messages: ['x'], data: 'y' };
    const out = await firstValueFrom(
      interceptor.intercept(makeContext(), makeHandler(passthrough)),
    );
    expect(out).toBe(passthrough);
  });

  it('does NOT pass through arrays even when truthy', async () => {
    const arr = [1, 2, 3];
    const out = await firstValueFrom(
      interceptor.intercept(makeContext(), makeHandler(arr)),
    );
    expect(out).toEqual({ success: true, messages: [], data: arr });
  });
});
