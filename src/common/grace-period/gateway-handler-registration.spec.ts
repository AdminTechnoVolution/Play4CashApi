import { GracePeriodService } from './grace-period.service';

/**
 * Integration-style sanity check: each game gateway must register its forfeit handler
 * with the global `GracePeriodService` at module init. If a gateway forgets to
 * register, the sweeper will release the lock and the grace row will rotate forever —
 * matches would hang and players would never be force-forfeited.
 *
 * We construct a thin instance of each gateway with the bare-minimum dependencies
 * (most are unused by `onModuleInit`) and verify that registerHandler was called
 * with the expected game key.
 */

import { UnoGateway } from '../../modules/websockets/uno/uno.gateway';
import { ChessGateway } from '../../modules/websockets/chess/chess.gateway';
import { HalmaGateway } from '../../modules/websockets/halma/halma.gateway';
import { DominoGateway } from '../../modules/websockets/domino/domino.gateway';
import { NavalBattleGateway } from '../../modules/websockets/naval-battle/naval-battle.gateway';

describe('Phase B — gateway grace-period handler registration', () => {
  const mkGrace = () => ({
    registerHandler: jest.fn(),
    start: jest.fn(),
    cancel: jest.fn(),
  }) as unknown as GracePeriodService & { registerHandler: jest.Mock };

  const stub = {} as any;

  it('UnoGateway.onModuleInit() registers a handler for game="uno"', () => {
    const grace = mkGrace();
    const gateway = new UnoGateway(stub, stub, stub, stub, stub, stub, stub, grace);
    gateway.onModuleInit();
    expect((grace as any).registerHandler).toHaveBeenCalledWith('uno', expect.any(Function));
  });

  it('ChessGateway.onModuleInit() registers a handler for game="chess"', () => {
    const grace = mkGrace();
    const gateway = new ChessGateway(stub, stub, stub, stub, stub, stub, stub, grace);
    gateway.onModuleInit();
    expect((grace as any).registerHandler).toHaveBeenCalledWith('chess', expect.any(Function));
  });

  it('HalmaGateway.onModuleInit() registers a handler for game="halma"', () => {
    const grace = mkGrace();
    const gateway = new HalmaGateway(stub, stub, stub, stub, stub, stub, stub, grace);
    gateway.onModuleInit();
    expect((grace as any).registerHandler).toHaveBeenCalledWith('halma', expect.any(Function));
  });

  it('DominoGateway.onModuleInit() registers a handler for game="domino"', () => {
    const grace = mkGrace();
    const gateway = new DominoGateway(stub, stub, stub, stub, stub, stub, stub, grace);
    gateway.onModuleInit();
    expect((grace as any).registerHandler).toHaveBeenCalledWith('domino', expect.any(Function));
  });

  it('NavalBattleGateway.onModuleInit() registers a handler for game="naval-battle"', () => {
    const grace = mkGrace();
    const gateway = new NavalBattleGateway(stub, stub, stub, stub, stub, stub, stub, grace);
    gateway.onModuleInit();
    expect((grace as any).registerHandler).toHaveBeenCalledWith('naval-battle', expect.any(Function));
  });
});
