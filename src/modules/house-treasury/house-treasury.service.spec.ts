import { Types } from 'mongoose';
import { HouseTreasuryService } from './house-treasury.service';

function query<T>(value: T) {
  return {
    then: (resolve: (result: T) => unknown) => Promise.resolve(value).then(resolve),
    session: jest.fn().mockResolvedValue(value),
  };
}

describe('HouseTreasuryService', () => {
  it('records a tournament fee exactly once for repeated settlement attempts', async () => {
    let stored: any = null;
    const ledgerModel = {
      findOne: jest.fn(() => query(stored)),
      create: jest.fn(async ([entry]: any[]) => {
        stored = { _id: new Types.ObjectId(), ...entry };
        return [stored];
      }),
    };
    const configModel = {
      updateOne: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    };
    const session = {
      withTransaction: jest.fn(async (callback: () => Promise<void>) => callback()),
      endSession: jest.fn(),
    };
    const service = new HouseTreasuryService(
      { startSession: jest.fn().mockResolvedValue(session) } as any,
      ledgerModel as any,
      {} as any,
      configModel as any,
      {} as any,
      {} as any,
    );
    const tournamentId = new Types.ObjectId();

    await service.recordTournamentFee(tournamentId, 1.005);
    await service.recordTournamentFee(tournamentId, 1.005);

    expect(ledgerModel.create).toHaveBeenCalledTimes(1);
    expect(configModel.updateOne).toHaveBeenCalledTimes(1);
    expect(stored.amount).toBe(1.01);
    expect(stored.idempotency_key).toBe(`house:tournament:${tournamentId}`);
  });

  it('does not create entries for a zero tournament commission', async () => {
    const ledgerModel = { findOne: jest.fn(), create: jest.fn() };
    const service = new HouseTreasuryService(
      {} as any,
      ledgerModel as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await service.recordTournamentFee(new Types.ObjectId(), 0);

    expect(ledgerModel.findOne).not.toHaveBeenCalled();
    expect(ledgerModel.create).not.toHaveBeenCalled();
  });
});

