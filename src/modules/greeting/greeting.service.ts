import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Greeting, GreetingDocument } from './schemas/greeting.schema';
import { BusinessException } from '../../common/exceptions/business.exception';

@Injectable()
export class GreetingService {
  private readonly logger = new Logger(GreetingService.name);

  constructor(
    @InjectModel(Greeting.name) private readonly greetingModel: Model<GreetingDocument>,
  ) {}

  /** Returns 5 random active greetings in the requested language */
  async getRandom(lang = 'en'): Promise<any> {
    const supported = ['es', 'en', 'fr', 'de', 'it', 'pt'];
    const l = supported.includes(lang) ? lang : 'en';

    const greetings = await this.greetingModel.aggregate([
      { $match: { active: true } },
      { $sample: { size: 5 } },
      { $project: { _id: 1, text: `$text.${l}`, active: 1, createdAt: 1 } },
    ]);

    return { success: true, messages: [], data: greetings };
  }

  /** Create a new greeting (admin) */
  async create(dto: { text: Record<string, string> }): Promise<any> {
    const greeting = await this.greetingModel.create({ text: dto.text });
    return { success: true, messages: [], data: greeting };
  }

  /** Update a greeting by ID (admin) */
  async update(id: string, dto: { text?: Record<string, string>; active?: boolean }): Promise<any> {
    const greeting = await this.greetingModel.findByIdAndUpdate(id, { $set: dto }, { new: true });
    if (!greeting) throw new BusinessException('ERROR_NOT_FOUND', 404);
    return { success: true, messages: [], data: greeting };
  }

  /** Get all greetings (admin — no random, full objects) */
  async getAll(): Promise<any> {
    const greetings = await this.greetingModel.find().sort({ createdAt: -1 }).lean();
    return { success: true, messages: [], data: greetings };
  }

  /** Delete a greeting by ID (admin) */
  async delete(id: string): Promise<any> {
    const result = await this.greetingModel.findByIdAndDelete(id);
    if (!result) throw new BusinessException('ERROR_NOT_FOUND', 404);
    return { success: true, messages: [], data: { deleted: true } };
  }
}
