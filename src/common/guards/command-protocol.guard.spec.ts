import { ExecutionContext, HttpException } from '@nestjs/common';
import { CommandProtocolGuard } from './command-protocol.guard';

describe('CommandProtocolGuard', () => {
  const previous = process.env.FINANCE_V2_ENABLED;
  afterEach(() => {
    if (previous === undefined) delete process.env.FINANCE_V2_ENABLED;
    else process.env.FINANCE_V2_ENABLED = previous;
  });
  const context = (version?: string) => ({
    switchToHttp: () => ({ getRequest: () => ({ headers: { 'x-p4c-command-protocol': version } }) }),
  }) as ExecutionContext;
  it('rejects an unsupported client before entering a funded game', () => {
    process.env.FINANCE_V2_ENABLED = 'true';
    for (const version of [undefined, '0', '2']) {
      try { new CommandProtocolGuard().canActivate(context(version)); throw new Error('accepted'); }
      catch (error) { expect(error).toBeInstanceOf(HttpException); expect(error.getStatus()).toBe(426); }
    }
  });
  it('accepts recoverable commands and permits legacy test mode', () => {
    process.env.FINANCE_V2_ENABLED = 'true';
    expect(new CommandProtocolGuard().canActivate(context('1'))).toBe(true);
    process.env.FINANCE_V2_ENABLED = 'false';
    expect(new CommandProtocolGuard().canActivate(context())).toBe(true);
  });
});
