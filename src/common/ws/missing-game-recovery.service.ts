import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model, Types } from 'mongoose';
import { Room, RoomDocument, RoomStatus } from '../../modules/room/schemas/room.schema';
import { User, UserDocument } from '../../modules/user/schemas/user.schema';
import { ChessGame } from '../../modules/websockets/chess/schemas/chess-game.schema';
import { DominoGame } from '../../modules/websockets/domino/schemas/domino-game.schema';
import { HalmaGame } from '../../modules/websockets/halma/schemas/halma-game.schema';
import { UnoGame } from '../../modules/websockets/uno/schemas/uno-game.schema';
import { ConnectFourGame } from '../../modules/websockets/connect-four/schemas/connect-four-game.schema';
import { RoomsGateway } from '../../modules/websockets/rooms/rooms.gateway';

@Injectable()
export class MissingGameRecoveryService implements OnModuleInit {
  private readonly logger = new Logger(MissingGameRecoveryService.name);
  private running = false;

  constructor(
    @InjectModel(Room.name) private readonly roomModel: Model<RoomDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(ChessGame.name) private readonly chessModel: Model<any>,
    @InjectModel(DominoGame.name) private readonly dominoModel: Model<any>,
    @InjectModel(HalmaGame.name) private readonly halmaModel: Model<any>,
    @InjectModel(UnoGame.name) private readonly unoModel: Model<any>,
    @InjectModel(ConnectFourGame.name) private readonly connectFourModel: Model<any>,
    private readonly roomsGateway: RoomsGateway,
  ) {}

  onModuleInit(): void {
    setTimeout(() => void this.reconcile(), 1_000);
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async reconcile(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const rooms = await this.roomModel
        .find({
          status: RoomStatus.STARTED,
          game_ready_at: { $exists: true, $ne: null },
          source: { $ne: 'tournament' },
        })
        .populate('game_id', 'socket_code')
        .lean();

      for (const room of rooms) {
        const gameModel = this.modelForSocketCode((room.game_id as any)?.socket_code);
        if (!gameModel) continue;
        const exists = await gameModel.exists({ room_id: room._id });
        if (!exists) await this.refundAndCancel(room);
      }
    } catch (error) {
      this.logger.error('event=missing_game_recovery_scan_failed', error);
    } finally {
      this.running = false;
    }
  }

  private modelForSocketCode(socketCode?: string): Model<any> | null {
    switch (socketCode) {
      case 'chess': return this.chessModel;
      case 'domino': return this.dominoModel;
      case 'halma': return this.halmaModel;
      case 'uno': return this.unoModel;
      case 'connect-four':
      case 'connect4': return this.connectFourModel;
      default: return null;
    }
  }

  private async refundAndCancel(room: any): Promise<void> {
    const roomId = String(room._id);
    const adjustmentKey = `missing-game-refund:${roomId}`;
    const amount = Number(room.bet_amount) || 0;

    for (const player of room.players || []) {
      const playerId = new Types.ObjectId(String(player.playerId?._id || player.playerId));
      const applied = await this.userModel.findOneAndUpdate(
        { _id: playerId, balance_adjustment_keys: { $ne: adjustmentKey } },
        {
          $inc: { balance: amount },
          $addToSet: { balance_adjustment_keys: adjustmentKey },
        },
        { new: true },
      );
      if (!applied) {
        const alreadyApplied = await this.userModel.exists({
          _id: playerId,
          balance_adjustment_keys: adjustmentKey,
        });
        if (!alreadyApplied) {
          throw new Error(`Unable to refund player ${playerId} for room ${roomId}`);
        }
      }
    }

    const finished = await this.roomModel.findOneAndUpdate(
      {
        _id: room._id,
        status: RoomStatus.STARTED,
        game_ready_at: { $exists: true, $ne: null },
      },
      {
        $set: {
          status: RoomStatus.FINISHED,
          winner_reason: 'start_state_missing_refunded',
          finished_at: new Date(),
          updated_at: new Date(),
        },
        $unset: {
          winner: 1,
          start_lock: 1,
          start_locked_at: 1,
        },
      },
      { new: true },
    );
    if (!finished) return;

    this.logger.warn(
      `event=missing_game_recovered room=${roomId} players=${room.players.length} refund=${amount}`,
    );
    const gameId = String((room.game_id as any)?._id || room.game_id || '');
    if (gameId && this.roomsGateway.server) {
      this.roomsGateway.broadcastRoomUpdate(gameId, 'roomUpdated', finished);
    }
  }
}
