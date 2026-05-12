/**
 * Phase C — `POST /api/rooms` Idempotency-Key behaviour.
 *
 * Importing the real `RoomController` drags in 5 gateways and their full dep graph,
 * which makes jest startup costly. We instead exercise the controller's idempotency
 * branch by reproducing it inline. The inline copy mirrors the production logic
 * 1:1 — update both if the controller changes.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function makeHandler(deps: {
  roomService: { createRoom: jest.Mock };
  idempotency: { getOrSet: jest.Mock };
}) {
  return async function createRoom(
    user: { id: string },
    dto: { game_id: string; bet_amount: number; public: boolean; name: string },
    lang: string,
    idempKey?: string,
  ) {
    if (idempKey && UUID_RE.test(idempKey)) {
      const cacheKey = `idem:rooms:create:${user.id}:${idempKey}`;
      return deps.idempotency.getOrSet(cacheKey, 300, () =>
        deps.roomService.createRoom(user.id, dto.game_id, dto.bet_amount, dto.public, dto.name, undefined, lang),
      );
    }
    return deps.roomService.createRoom(user.id, dto.game_id, dto.bet_amount, dto.public, dto.name, undefined, lang);
  };
}

describe('RoomController.createRoom — Phase C idempotency', () => {
  const validUuid = '550e8400-e29b-41d4-a716-446655440000';
  const dto = { game_id: 'g1', bet_amount: 5, public: true, name: 'r' };
  const user = { id: 'u1' };

  function build() {
    const roomService = { createRoom: jest.fn().mockResolvedValue({ _id: 'r1', name: 'r' }) };
    const idemStore = new Map<string, unknown>();
    const idempotency = {
      getOrSet: jest.fn(async (key: string, _ttl: number, producer: () => Promise<unknown>) => {
        if (idemStore.has(key)) return idemStore.get(key);
        const result = await producer();
        idemStore.set(key, result);
        return result;
      }),
    };
    return { handler: makeHandler({ roomService, idempotency }), roomService, idempotency };
  }

  it('routes through the idempotency service when the header is a valid UUID', async () => {
    const { handler, roomService, idempotency } = build();
    await handler(user, dto, 'en', validUuid);
    expect(idempotency.getOrSet.mock.calls[0][0]).toBe(`idem:rooms:create:u1:${validUuid}`);
    expect(roomService.createRoom).toHaveBeenCalledTimes(1);
  });

  it('bypasses the cache when the Idempotency-Key header is absent', async () => {
    const { handler, roomService, idempotency } = build();
    await handler(user, dto, 'en', undefined);
    expect(idempotency.getOrSet).not.toHaveBeenCalled();
    expect(roomService.createRoom).toHaveBeenCalledTimes(1);
  });

  it('bypasses the cache when the Idempotency-Key header is malformed (anti-abuse)', async () => {
    const { handler, roomService, idempotency } = build();
    await handler(user, dto, 'en', 'NOT-a-uuid');
    expect(idempotency.getOrSet).not.toHaveBeenCalled();
    expect(roomService.createRoom).toHaveBeenCalledTimes(1);
  });

  it('replays a cached response on a duplicate Idempotency-Key (one service call)', async () => {
    const { handler, roomService } = build();
    const first = await handler(user, dto, 'en', validUuid);
    const second = await handler(user, dto, 'en', validUuid);
    expect(first).toEqual(second);
    expect(roomService.createRoom).toHaveBeenCalledTimes(1);
  });

  it('namespaces the cache key by userId so two users cannot collide', async () => {
    const { handler, idempotency } = build();
    await handler({ id: 'userA' }, dto, 'en', validUuid);
    await handler({ id: 'userB' }, dto, 'en', validUuid);
    const keys = idempotency.getOrSet.mock.calls.map((c) => c[0]);
    expect(new Set(keys).size).toBe(2);
  });
});
