import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ContactMessage,
  ContactMessageDocument,
  ContactMessageStatus,
} from './schemas/contact-message.schema';
import { SubmitContactDto } from './dtos/submit-contact.dto';
import { UpdateContactDto } from './dtos/update-contact.dto';
import { GameService } from '../game/game.service';
import { BusinessException } from '../../common/exceptions/business.exception';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';

@Injectable()
export class ContactUsService {
  constructor(
    @InjectModel(ContactMessage.name)
    private readonly contactMessageModel: Model<ContactMessageDocument>,
    private readonly gameService: GameService,
  ) {}

  async submit(user: JwtPayload, dto: SubmitContactDto, lang = 'en') {
    let gameIds: Types.ObjectId[] = [];
    let gameLabels: string[] = [];

    if (dto.all_games) {
      gameIds = [];
      gameLabels = [];
    } else {
      const uniqueIds = [...new Set(dto.game_ids ?? [])];
      if (uniqueIds.length === 0) {
        throw new BusinessException('ERROR_CONTACT_GAMES_REQUIRED', 400);
      }

      for (const id of uniqueIds) {
        if (!Types.ObjectId.isValid(id)) {
          throw new BusinessException('ERROR_GAME_NOT_FOUND', 404);
        }
        const game = await this.gameService.findById(id, lang);
        gameIds.push(new Types.ObjectId(id));
        gameLabels.push(String(game.name ?? ''));
      }
    }

    const doc = await this.contactMessageModel.create({
      user_id: new Types.ObjectId(user.id),
      email: user.email,
      username: user.username ?? user.name ?? user.email,
      type: dto.type,
      message: dto.message.trim(),
      game_ids: gameIds,
      all_games: dto.all_games,
      game_labels: gameLabels,
      status: ContactMessageStatus.NEW,
    });

    return { success: true, messages: [], data: { id: doc._id.toString() } };
  }

  async list(status?: ContactMessageStatus) {
    const filter = status ? { status } : {};
    const messages = await this.contactMessageModel
      .find(filter)
      .sort({ createdAt: -1 })
      .lean();
    return { success: true, messages: [], data: messages };
  }

  async listMine(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BusinessException('ERROR_AUTH', 401);
    }
    const messages = await this.contactMessageModel
      .find({ user_id: new Types.ObjectId(userId) })
      .select('type message all_games game_labels status public_response admin_notes createdAt updatedAt')
      .sort({ createdAt: -1 })
      .lean();
    return {
      success: true,
      messages: [],
      data: messages.map((message: any) => ({
        ...message,
        public_response: message.public_response || message.admin_notes || '',
        admin_notes: undefined,
      })),
    };
  }

  async getById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BusinessException('ERROR_NOT_FOUND', 404);
    }
    const message = await this.contactMessageModel.findById(id).lean();
    if (!message) throw new BusinessException('ERROR_NOT_FOUND', 404);
    return { success: true, messages: [], data: message };
  }

  async update(id: string, dto: UpdateContactDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BusinessException('ERROR_NOT_FOUND', 404);
    }

    const patch: Partial<ContactMessage> = {};
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.admin_notes !== undefined) patch.admin_notes = dto.admin_notes;
    if (dto.public_response !== undefined) patch.public_response = dto.public_response;

    if (Object.keys(patch).length === 0) {
      return this.getById(id);
    }

    const message = await this.contactMessageModel
      .findByIdAndUpdate(id, { $set: patch }, { new: true })
      .lean();
    if (!message) throw new BusinessException('ERROR_NOT_FOUND', 404);
    return { success: true, messages: [], data: message };
  }
}
