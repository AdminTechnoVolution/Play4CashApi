---
description: How to create a new game module (schema, logic, gateway) in Play4Cash project without affecting existing games
---

# Create a New Game Module

This skill documents the exact patterns and architecture for adding a **completely new game** to the Play4Cash project. It ensures consistency across game mechanics, WebSocket communication, and multi-language support.

> [!CAUTION]
> **GOLDEN RULE**: NEVER modify the code, gateways, or logic of existing games (Halma, Chess, Domino, Naval Battle). Any new game must be self-contained in its own directory.

---

## 📁 Directory Structure

Every new game must live in `src/modules/websockets/<game-name>/`:

```
src/modules/websockets/<game-name>/
├── schemas/
│   └── <game-name>-game.schema.ts    ← Mongoose state (board, players, timers)
├── <game-name>-game.logic.ts         ← Pure functional rules (no IO/DB)
├── <game-name>.gateway.ts            ← WebSocket handlers & event logic
└── <game-name>.module.ts             ← NestJS module definition
```

---

## Step 1: Create the Game Schema

**File:** `src/modules/websockets/<game-name>/schemas/<game-name>-game.schema.ts`

The schema tracks the active game state.

```typescript
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type <Game>Document = <Game> & Document;

@Schema({ versionKey: false, timestamps: true })
export class <Game>Game {
  @Prop({ type: Types.ObjectId, required: true, index: true })
  room_id: Types.ObjectId;

  @Prop({ type: [Types.ObjectId], required: true })
  player_ids: Types.ObjectId[];

  @Prop({ type: Object, required: true })
  board: any; // e.g., number[][] or record

  @Prop({ default: 0 })
  current_player_index: number;

  @Prop({ default: Date.now })
  turn_start_time: Date;

  @Prop({ type: [String], default: [] })
  eliminated_players: string[];
}

export const <Game>GameSchema = SchemaFactory.createForClass(<Game>Game);
```

---

## Step 2: Create the Game Logic

**File:** `src/modules/websockets/<game-name>/<game-name>-game.logic.ts`

Keep your game rules in a pure functional file. This makes testing and debugging 100x easier.

```typescript
export const createInitialBoard = () => { ... };
export const validateMove = (board: any, move: any, playerNum: number) => { ... };
export const checkWinCondition = (board: any) => { ... };
```

---

## Step 3: Create the WebSocket Gateway

**File:** `src/modules/websockets/<game-name>/<game-name>.gateway.ts`

The gateway connects the logic to the clients. Use the established patterns for I18n and timers.

### Boilerplate Pattern:
```typescript
@WebSocketGateway({ namespace: '/<game-name>', cors: { origin: '*', credentials: true } })
export class <Game>Gateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  
  // Rule: Inject I18nService and RoomsGateway
  constructor(
    @InjectModel(<Game>Game.name) private readonly gameModel: Model<<Game>Document>,
    private readonly i18n: I18nService,
    private readonly roomsGateway: RoomsGateway,
    // ... other standard injections (Room, User, Config, Redis)
  ) {}

  // Helper: Standard language detection
  private getLang(client: Socket): string {
    return (client.handshake?.query?.lang as string) || (client.data?.lang as string) || 'en';
  }

  // Mandatory: Handle disconnections (Forfeit/Timeouts)
  async handleDisconnect(client: Socket) {
    const { room_id, player_id } = client.data;
    // ... Implement elimination/forfeit logic here
  }

  @SubscribeMessage('move')
  async handleMove(client: Socket, payload: any) {
    const lang = this.getLang(client);
    // 1. Guard: Check if it's player's turn
    // 2. Logic: validateMove()
    // 3. Update DB: gameModel.updateOne()
    // 4. Broadcast: server.to(room_id).emit(...)
    // 5. Response: return { success: true, messages: [this.i18n.translate('ws.games.moveAccepted', lang)] }
  }
}
```

---

## Step 4: Integration (The Surgical Part)

**File:** `src/modules/websockets/websockets.module.ts`

Carefully register your new gateway and schema here. **Do not remove or change ANY other registrations.**

1.  **Import**: Add your new Gateway and Schema/Model.
2.  **`imports` array**: Add your `MongooseModule.forFeature` entry.
3.  **`providers` array**: Register your new Gateway.
4.  **`exports` array**: Export your new Gateway.

---

## 🔑 Game Response Shape

Always emit responses in this format to maintain frontend compatibility:

```json
{
  "success": true,
  "data": {
    "board": [...],
    "yourTurn": true,
    "turnTimerSeconds": 30,
    "gameEnded": false,
    "outcome": ""
  },
  "messages": ["ws.games.yourTurn"]
}
```

---

## 📋 Checklist for New Games

- [ ] New folder created in `src/modules/websockets/` (no reuse of existing game folders).
- [ ] Schema inherits timestamp and has `room_id` indexed.
- [ ] Logic is separated into a `*.logic.ts` file.
- [ ] Gateway injects `I18nService` and uses `this.i18n.translate` for all strings.
- [ ] Spectator-safe payloads: Resolving winner IDs to usernames for spectators.
- [ ] Forfeit/Disconnect logic handles balance refunds or prize payouts.
- [ ] `WebsocketsModule.ts` updated surgically (no breaking changes to existing games).
- [ ] Validated with `npx tsc --noEmit`.
