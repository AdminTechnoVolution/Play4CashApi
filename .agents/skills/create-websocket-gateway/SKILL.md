---
description: How to create a new WebSocket gateway for a game or real-time feature in the Play4CashApi NestJS project
---

# Create a New WebSocket Gateway

This skill documents the exact patterns, file structure, and conventions used in the Play4CashApi NestJS project to create a new WebSocket (Socket.io) gateway with JWT authentication, turn timers, room management, and game lifecycle handling.

---

## 📁 File Structure

Every WebSocket gateway lives in `src/modules/websockets/<game-name>/`:

```
src/modules/websockets/<game-name>/
├── schemas/
│   └── <game-name>-game.schema.ts    ← Mongoose schema for game state
├── <game-name>.gateway.ts            ← WebSocket gateway (lifecycle, events, timers)
└── <game-name>-game.logic.ts         ← Pure game logic (no DB, no framework dependencies)
```

---

## Step 1: Create the Game State Schema

**File:** `src/modules/websockets/<game-name>/schemas/<game-name>-game.schema.ts`

The game schema stores the persistent state of an active game in MongoDB.

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type <Name>GameDocument = <Name>Game & Document;

@Schema({ versionKey: false, timestamps: true })
export class <Name>Game {
  // ── Required fields (all games have these) ──────────────────────────────────

  /** Reference to the Room document */
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Room', required: true, unique: true })
  room_id: Types.ObjectId;

  /** Player IDs in play order */
  @Prop([{ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true }])
  player_ids: Types.ObjectId[];

  /** Current turn index (maps to player_ids array) */
  @Prop({ type: Number, default: 0 })
  current_player_index: number;

  /** When the current turn started (for timer calculations) */
  @Prop({ type: Date, default: Date.now })
  turn_start_time: Date;

  /** Game status */
  @Prop({ type: String, enum: ['active', 'finished'], default: 'active' })
  status: string;

  // ── Game-specific fields (customize per game) ───────────────────────────────

  // Board state (2D array, varies by game):
  // @Prop({ type: [[Number]], required: true }) board: number[][];

  // Hands (for card/tile games):
  // @Prop({ type: Map, of: [[Number]], required: true }) hands: Map<string, number[][]>;

  // Scores:
  // @Prop({ type: Map, of: Number, default: {} }) scores: Map<string, number>;

  // Eliminated players (for N-player games):
  // @Prop({ type: [String], default: [] }) eliminated_players: string[];
}

export const <Name>GameSchema = SchemaFactory.createForClass(<Name>Game);
```

### Schema Conventions:
- `room_id` is always `unique: true` — one active game per room
- `versionKey: false` — no `__v` field
- `timestamps: true` — adds `createdAt` / `updatedAt`
- Use `Map<string, T>` for per-player data (keyed by player_id string)
- Use `Types.ObjectId` for references

---

## Step 2: Create the Game Logic (Pure Functions)

**File:** `src/modules/websockets/<game-name>/<game-name>-game.logic.ts`

Keep game logic in pure functions with **no framework dependencies** (no Mongoose, no NestJS, no Socket.io).
This makes the logic testable and portable.

```typescript
/** <Name> Game Logic — pure functions, no framework dependencies */

export type Board = number[][];

// ── Board Setup ───────────────────────────────────────────────────────────────

export const createBoard = (): Board => {
  // Return the initial game board
  return Array.from({ length: 8 }, () => Array(8).fill(0));
};

// ── Move Validation ───────────────────────────────────────────────────────────

export const isValidMove = (board: Board, from: number[], to: number[], playerNum: number): boolean => {
  // Validate the move according to game rules
  return true;
};

// ── Game Result ───────────────────────────────────────────────────────────────

export const getGameResult = (
  board: Board,
  playerIds: string[],
  eliminatedPlayers: string[] = [],
): { finished: boolean; winner?: string | null; reason?: string } => {
  const activePlayers = playerIds.filter(id => !eliminatedPlayers.includes(id));

  // Only 1 player left → they win
  if (activePlayers.length <= 1 && activePlayers.length > 0) {
    return { finished: true, winner: activePlayers[0], reason: 'last_standing' };
  }

  // Check game-specific win conditions
  // ...

  return { finished: false };
};

// ── Turn Management ───────────────────────────────────────────────────────────

/** Get next active player index, skipping eliminated players */
export const getNextActivePlayerIndex = (
  currentIndex: number,
  playerIds: string[],
  eliminatedPlayers: string[],
): number => {
  const total = playerIds.length;
  let next = (currentIndex + 1) % total;
  for (let i = 0; i < total; i++) {
    if (!eliminatedPlayers.includes(playerIds[next])) return next;
    next = (next + 1) % total;
  }
  return next;
};
```

### Logic Conventions:
- **No imports** from NestJS, Mongoose, or Socket.io
- Export as named functions (not a class)
- All functions take plain data and return plain data
- Player identity is always a `string` (ObjectId cast externally)

---

## Step 3: Create the Gateway

**File:** `src/modules/websockets/<game-name>/<game-name>.gateway.ts`

This is the main file. It handles:
- JWT authentication (via `applyWsAuth`)
- Socket lifecycle (connect, disconnect, rejoin)
- Game initialization (when all players connect)
- Move handling (validate, apply, broadcast)
- Turn timers (timeout → elimination or game end)
- Prize calculation and distribution

```typescript
import {
  WebSocketGateway, WebSocketServer, SubscribeMessage,
  MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, OnGatewayInit,
} from '@nestjs/websockets';
import { Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { Server, Socket } from 'socket.io';
import { Model, Types } from 'mongoose';
import { applyWsAuth } from '../../../common/guards/ws-auth.middleware';
import { REDIS_CLIENT } from '../../../common/redis/redis.module';
import { RoomsGateway } from '../rooms/rooms.gateway';
import { <Name>Game, <Name>GameDocument } from './schemas/<game-name>-game.schema';
import { createBoard, isValidMove, getGameResult } from './<game-name>-game.logic';

// ── Turn Timer Registry ───────────────────────────────────────────────────────
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (id: string) => {
  const t = turnTimers.get(id);
  if (t) { clearTimeout(t); turnTimers.delete(id); }
};

// ── Gateway ───────────────────────────────────────────────────────────────────

@WebSocketGateway({ namespace: '/<game-name>', cors: { origin: '*', credentials: true } })
export class <Name>Gateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(<Name>Gateway.name);

  constructor(
    @InjectModel(<Name>Game.name) private readonly gameModel: Model<<Name>GameDocument>,
    @InjectModel('Room') private readonly roomModel: Model<any>,
    @InjectModel('User') private readonly userModel: Model<any>,
    private readonly config: ConfigService,
    private readonly roomsGateway: RoomsGateway,
    @Inject(REDIS_CLIENT) private readonly redis: any,
  ) {}

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  afterInit(server: Server) {
    applyWsAuth(server, this.config.get<string>('jwt.secret')!, this.redis);
  }

  handleConnection(client: Socket) {
    this.logger.log(`[<Name>] Connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    clearTimer(client.id);
    const { room_id, player_id } = client.data;
    if (!room_id || !player_id) return;

    const roomObjId = new Types.ObjectId(room_id);
    const playerObjId = new Types.ObjectId(player_id);

    const room = await this.roomModel.findOne({ _id: roomObjId, 'players.playerId': playerObjId });
    if (!room || room.status === 'finished') return;

    // ── Room is WAITING: remove player from lobby ─────────────────────────
    if (room.status === 'waiting') {
      const updated = await this.roomModel.findOneAndUpdate(
        { _id: roomObjId, 'players.playerId': playerObjId },
        { $pull: { players: { playerId: playerObjId } } },
        { returnDocument: 'after' },
      );
      if (updated?.players.length === 0) {
        await this.roomModel.findOneAndDelete({ _id: roomObjId, players: { $size: 0 } });
      } else {
        const user = await this.userModel.findById(player_id).select('username');
        const username = user?.username || 'Unknown';
        client.to(room_id).emit('<game-name>', {
          success: true,
          data: {
            opponentLeft: true,
            waitingForOpponent: true,
            playerLeft: username,
            playersRemaining: updated?.players.length || 0,
          },
          messages: ['ws.<game-name>.playerLeftWaiting'],
        });
      }
      return;
    }

    // ── Room is STARTED: handle forfeit ───────────────────────────────────
    if (room.status === 'started') {
      // For 2-player games: opponent wins immediately
      const winner_id = room.players.find((p: any) => p.playerId.toString() !== player_id)?.playerId;
      if (!winner_id) return;
      room.status = 'finished';
      room.winner = winner_id;
      room.winner_reason = 'forfeit';
      room.finished_at = new Date();
      await room.save();
      const prize = (room.bet_amount * room.players.length) * (1 - room.house_edge / 100);
      await this.userModel.updateOne({ _id: winner_id }, { $inc: { balance: prize } });
      client.to(room_id).emit('<game-name>', {
        success: true,
        data: { gameEnded: true, outcome: 'opponent_disconnected', youWon: true, winner: winner_id, reason: 'forfeit', prize },
        messages: ['ws.<game-name>.opponentDisconnected'],
      });
      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
    }
  }

  // ── Join ───────────────────────────────────────────────────────────────────

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { room_id: string }) {
    if (!payload?.room_id) return client.emit('<game-name>', { success: false, messages: ['Missing room_id'] });
    const { room_id } = payload;
    const player_id = client.data.player_id;

    const room = await this.roomModel.findById(room_id).populate('game_id', 'turn_timer_seconds max_players');
    if (!room) return client.emit('<game-name>', { success: false, messages: ['Room not found.'] });

    const isMember = room.players.some((p: any) => p.playerId.toString() === player_id);
    if (!isMember) return client.emit('<game-name>', { success: false, messages: ['Not in room.'] });

    await client.join(room_id);
    client.data.room_id = room_id;

    // ── Rejoin active game ────────────────────────────────────────────────
    if (room.status === 'started') {
      const game = await this.gameModel.findOne({ room_id });
      if (game) {
        const isMyTurn = game.player_ids[game.current_player_index]?.toString() === player_id;
        return client.emit('<game-name>', {
          success: true, messages: [],
          data: {
            /* Send current game state: board, hand, etc. */
            yourTurn: isMyTurn,
            turnTimerSeconds: 30,
            waitingForOpponent: false,
            gameStarted: true,
          },
        });
      }
    }

    // ── Waiting for players ───────────────────────────────────────────────
    client.emit('<game-name>', {
      success: true,
      data: { waitingForOpponent: true },
      messages: ['Waiting for opponent.'],
    });

    const socketsInRoom = await this.server.in(room_id).fetchSockets();
    const maxPlayers = room.player_limit || room.game_id?.max_players || 2;

    // ── All players connected → Start game ────────────────────────────────
    if (socketsInRoom.length >= maxPlayers && room.status === 'waiting') {
      // Atomically set status to prevent race conditions
      const started = await this.roomModel.findOneAndUpdate(
        { _id: room_id, status: 'waiting' },
        { $set: { status: 'started' } },
        { returnDocument: 'after' },
      );
      if (!started) return;

      // Deduct bets from all players (atomically)
      const playerIds = room.players.map((p: any) => p.playerId);
      const deductions = await Promise.all(
        playerIds.map((pid: any) =>
          this.userModel.findOneAndUpdate(
            { _id: pid, balance: { $gte: room.bet_amount } },
            { $inc: { balance: -room.bet_amount } },
          ),
        ),
      );
      // If any deduction failed, refund all and revert room
      if (deductions.some(d => !d)) {
        await Promise.all(
          deductions.map((d, i) =>
            d ? this.userModel.updateOne({ _id: playerIds[i] }, { $inc: { balance: room.bet_amount } }) : null,
          ),
        );
        await this.roomModel.findByIdAndUpdate(room_id, { $set: { status: 'waiting' } });
        this.server.to(room_id).emit('<game-name>', { success: false, messages: ['Insufficient balance.'] });
        return;
      }

      // Create game state document
      const board = createBoard();
      await this.gameModel.create({
        room_id,
        player_ids: playerIds,
        /* game-specific initial state: board, hands, etc. */
      });

      // Notify all players
      const timerSec = room.game_id?.turn_timer_seconds ?? 30;
      for (const s of socketsInRoom) {
        const pid = (s as any).data.player_id;
        const isMyTurn = playerIds[0].toString() === pid; // Player 1 starts
        (s as unknown as Socket).emit('<game-name>', {
          success: true,
          data: {
            /* game state per player */
            yourTurn: isMyTurn,
            turnTimerSeconds: timerSec,
            gameStarted: true,
          },
          messages: [isMyTurn ? 'Your turn!' : 'Waiting for opponent.'],
        });
        if (isMyTurn) this.startTimer(s as unknown as Socket, room_id, timerSec);
      }
    }
  }

  // ── Game Action (move, fire, play, etc.) ────────────────────────────────────

  @SubscribeMessage('move')
  async handleMove(@ConnectedSocket() client: Socket, @MessageBody() payload: any) {
    const { room_id } = payload;
    const player_id = client.data.player_id;
    this.logger.log(`[<Name>] ⭐ Move | room=${room_id} | player=${player_id} | payload=${JSON.stringify(payload)}`);

    const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
    if (!game) return client.emit('<game-name>', { success: false, messages: ['Game not found'] });

    // Verify it's the player's turn
    if (game.player_ids[game.current_player_index]?.toString() !== player_id) {
      return client.emit('<game-name>', { success: false, messages: ['Not your turn.'] });
    }

    // Validate the move using pure logic
    // if (!isValidMove(...)) return client.emit('<game-name>', { success: false, messages: ['Invalid move.'] });

    // Apply the move to game state
    // ...

    // Check game result
    const playerIdsStr = game.player_ids.map((p: any) => p.toString());
    const result = getGameResult(/* game state */, playerIdsStr);

    if (result.finished) {
      // ── Game Over ────────────────────────────────────────────────────────
      const room = await this.roomModel.findById(room_id);
      if (result.winner) {
        room.status = 'finished';
        room.winner = new Types.ObjectId(result.winner);
        room.winner_reason = result.reason;
        room.finished_at = new Date();
        await room.save();
        const prize = (room.bet_amount * room.players.length) * (1 - room.house_edge / 100);
        await this.userModel.updateOne({ _id: result.winner }, { $inc: { balance: prize } });
      }
      // Notify all players
      // ...
      const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
      if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      return;
    }

    // ── Advance Turn ──────────────────────────────────────────────────────
    game.current_player_index = (game.current_player_index + 1) % game.player_ids.length;
    game.turn_start_time = new Date();
    await game.save();

    // Timer management
    const sockets = await this.server.in(room_id).fetchSockets();
    const nextPlayerId = game.player_ids[game.current_player_index].toString();
    const nextPlayerSocket = sockets.find(s => (s as any).data.player_id === nextPlayerId);
    clearTimer(client.id);
    if (nextPlayerSocket) this.startTimer(nextPlayerSocket as unknown as Socket, room_id, 30);

    // Broadcast updated state to all players
    for (const s of sockets) {
      const pid = (s as any).data.player_id;
      const isMyTurn = pid === nextPlayerId;
      (s as unknown as Socket).emit('<game-name>', {
        success: true,
        data: {
          /* updated game state */
          yourTurn: isMyTurn,
          turnTimerSeconds: 30,
        },
        messages: [isMyTurn ? 'Your turn!' : 'Opponent moved.'],
      });
    }
  }

  // ── Turn Timer ──────────────────────────────────────────────────────────────

  private startTimer(socket: Socket, room_id: string, seconds: number) {
    clearTimer(socket.id);
    const t = setTimeout(async () => {
      const timedOutPlayerId = (socket as any).data?.player_id;
      if (!timedOutPlayerId) return;

      // Notify the timed-out player BEFORE disconnecting them
      socket.emit('<game-name>', {
        success: false,
        data: { gameEnded: true, outcome: 'timeout_loss', youWon: false, reason: 'timeout' },
        messages: ['ws.<game-name>.timeout'],
      });
      socket.leave(room_id);
      socket.disconnect(true);

      // For 2-player: end game, opponent wins
      const game = await this.gameModel.findOne({ room_id: new Types.ObjectId(room_id) });
      if (!game) return;
      const winnerId = game.player_ids.find((p: any) => p.toString() !== timedOutPlayerId);
      const room = await this.roomModel.findById(room_id);
      if (room && room.status === 'started') {
        room.status = 'finished';
        room.winner = winnerId;
        room.winner_reason = 'timeout';
        room.finished_at = new Date();
        await room.save();
        const prize = (room.bet_amount * room.players.length) * (1 - room.house_edge / 100);
        await this.userModel.updateOne({ _id: winnerId }, { $inc: { balance: prize } });

        const sockets = await this.server.in(room_id).fetchSockets();
        for (const s of sockets) {
          (s as unknown as Socket).emit('<game-name>', {
            success: true,
            data: { gameEnded: true, outcome: 'win', youWon: true, winner: winnerId, reason: 'timeout', prize },
            messages: ['ws.<game-name>.opponentTimeout'],
          });
        }
        const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
        if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
      }
    }, seconds * 1000);
    turnTimers.set(socket.id, t);
  }
}
```

---

## Step 4: Register in websockets.module.ts

**File:** `src/modules/websockets/websockets.module.ts`

Add three things:

```typescript
// 1. Import the schema
import { <Name>Game, <Name>GameSchema } from './<game-name>/schemas/<game-name>-game.schema';
// 2. Import the gateway
import { <Name>Gateway } from './<game-name>/<game-name>.gateway';

@Module({
  imports: [
    MongooseModule.forFeature([
      // ... existing schemas
      { name: <Name>Game.name, schema: <Name>GameSchema },  // ← add
    ]),
  ],
  providers: [
    // ... existing gateways
    <Name>Gateway,    // ← add
  ],
  exports: [
    // ... existing exports
    <Name>Gateway,    // ← add (if RoomService or other services need to access the server)
  ],
})
```

---

## Step 5: Verify

```bash
npx tsc --noEmit --pretty    # Must compile clean
npm run start                 # Test WebSocket connection
```

---

## 🏗️ Architecture Patterns

### Authentication
- JWT auth is applied **once on connection** via `applyWsAuth()` in `afterInit()`
- After auth, `socket.data.player_id` is available in ALL event handlers
- Token comes from: `handshake.auth.token`, `handshake.query.token`, or `authorization` header

### Player Identity
```typescript
// Set by ws-auth middleware on connect:
socket.data.player_id   // string — the user's MongoDB _id
socket.data.token        // string — the raw JWT

// Set by gateway on join:
socket.data.room_id      // string — the room they joined
socket.data.playerNum    // number — (optional) 1-indexed player position
```

### Room Management
- Clients are added to Socket.io rooms using `client.join(room_id)`
- `this.server.in(room_id).fetchSockets()` gets all connected sockets in a room
- `client.to(room_id).emit(...)` sends to everyone in room EXCEPT sender
- `this.server.to(room_id).emit(...)` sends to EVERYONE in room including sender

### Timer Pattern
```typescript
// Module-level (NOT class-level):
const turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
const clearTimer = (id: string) => {
  const t = turnTimers.get(id);
  if (t) { clearTimeout(t); turnTimers.delete(id); }
};

// Keyed by socket.id — each player has one timer at a time
// Always clear before starting a new one
// Always clear on disconnect
```

### Prize Calculation
```typescript
// Standard formula (all games):
const prize = (room.bet_amount * room.players.length) * (1 - room.house_edge / 100);
// Example: $10 bet × 2 players × (1 - 5/100) = $19.00
```

### Lobby Sync
When a game finishes, remove the room from the lobby:
```typescript
const gameId = (room.game_id as any)?._id?.toString() || room.game_id?.toString();
if (gameId) this.roomsGateway.broadcastRoomUpdate(gameId, 'roomDeleted', { id: room_id });
```

### Move Logging
Log every incoming game action for observability:
```typescript
this.logger.log(`[<Name>] ⭐ Move | room=${room_id} | player=${player_id} | payload=${JSON.stringify(payload)}`);
```

---

## 📡 Standard WebSocket Response Format

ALL emissions follow this shape:

```json
{
  "success": true,
  "messages": ["i18n.key.or.message"],
  "data": {
    "board": [...],
    "yourTurn": true,
    "turnTimerSeconds": 30,
    "gameStarted": true,
    "gameEnded": false,
    "outcome": "",
    "youWon": false,
    "winner": null,
    "reason": null,
    "prize": 0
  }
}
```

### Standard `data` fields for game-end events:

| Field | Type | Description |
|-------|------|-------------|
| `gameEnded` | `boolean` | Is the game over? |
| `outcome` | `string` | `'win'`, `'lose'`, `'draw'`, `'timeout_loss'`, `'opponent_disconnected'` |
| `youWon` | `boolean` | Per-player win flag |
| `winner` | `string` | Winner's player ID |
| `reason` | `string` | `'normal'`, `'timeout'`, `'forfeit'`, `'blocked_game'`, `'last_standing'` |
| `prize` | `number` | Prize amount (0 for losers) |

### Messages convention:
- Use i18n keys: `'ws.<game-name>.<event>'`
- Dynamic data is sent in `data` fields — the frontend builds the localized message

---

## 🎮 Game Lifecycle Summary

```
1. CLIENT connects to /<game-name> namespace (JWT in auth/query/header)
   └── ws-auth middleware validates token, sets socket.data.player_id

2. CLIENT emits 'join' { room_id }
   ├── Room is WAITING → wait for opponents
   ├── Room is STARTED (rejoin) → resend current game state
   └── All players connected → Initialize game:
       ├── Update room status to 'started'
       ├── Deduct bets atomically (with rollback on failure)
       ├── Create game document in MongoDB
       ├── Deal/setup initial state
       ├── Emit game state to each player
       └── Start turn timer for first player

3. CLIENT emits 'move' (or game-specific action)
   ├── Validate turn ownership
   ├── Validate move with pure logic functions
   ├── Apply move to game state
   ├── Check win condition
   │   ├── Winner found → end game, distribute prize, notify all
   │   └── No winner → advance turn, reset timer, notify all
   └── Save updated game state

4. TIMER fires (turn timeout)
   ├── Notify timed-out player → disconnect them
   ├── 2-player: opponent wins
   └── N-player: eliminate player, continue game

5. CLIENT disconnects
   ├── Room WAITING → remove from lobby
   └── Room STARTED → forfeit (2-player) or eliminate (N-player)
```

---

## 📋 Checklist

When creating a new WebSocket gateway, verify:

- [ ] Game state schema created with `room_id` (unique), `player_ids`, `current_player_index`, `turn_start_time`
- [ ] Pure game logic in separate file (no framework imports)
- [ ] Gateway implements `OnGatewayInit`, `OnGatewayConnection`, `OnGatewayDisconnect`
- [ ] `afterInit` calls `applyWsAuth(server, jwtSecret, redis)`
- [ ] `handleDisconnect` clears timer and handles both `waiting` and `started` states
- [ ] `handleJoin` handles: rejoin, waiting, game initialization
- [ ] Bet deduction is atomic with rollback on failure
- [ ] Room status transitions use `findOneAndUpdate` with status filter (prevents race conditions)
- [ ] Turn timer uses module-level `Map` (not class-level — survives DI lifecycle)
- [ ] Timer clears on disconnect and on turn change
- [ ] Prize uses standard formula: `(bet × players) × (1 - house_edge/100)`
- [ ] Game end broadcasts to lobby via `roomsGateway.broadcastRoomUpdate`
- [ ] Every game action has a `this.logger.log(...)` for observability
- [ ] Messages use i18n keys (`ws.<game-name>.<event>`)
- [ ] Gateway registered in `websockets.module.ts` (imports, providers, exports)
- [ ] `npx tsc --noEmit` compiles clean
