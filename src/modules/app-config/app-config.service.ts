import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AppConfig, AppConfigDocument } from './schemas/app-config.schema';
import { BusinessException } from '../../common/exceptions/business.exception';
import { TtlCache } from '../../common/ttl-cache';

@Injectable()
export class AppConfigService {
  private readonly configCache = new TtlCache<any>();

  constructor(
    @InjectModel(AppConfig.name) private readonly configModel: Model<AppConfigDocument>,
  ) {}

  /** Internal helper — returns full config doc (used by other services) */
  async getRawConfig(): Promise<any> {
    return this.configCache.getOrSet('global', 30_000, async () => {
      let config = await this.configModel.findOne({ key: 'global' }).lean();
      if (!config) {
        config = await this.configModel.findOneAndUpdate(
          { key: 'global' },
          { $setOnInsert: { key: 'global', withdrawal_daily_limit: 10000 } },
          { upsert: true, returnDocument: 'after', lean: true },
        );
      }
      return config;
    });
  }

  /** GET /api/config — matches original: only exposes { withdrawal_daily_limit } */
  async getConfig(): Promise<{ withdrawal_daily_limit: number }> {
    const config = await this.getRawConfig();
    return { withdrawal_daily_limit: config.withdrawal_daily_limit };
  }

  /** PUT /api/config — validates and updates, returns { withdrawal_daily_limit } */
  async updateConfig(data: { withdrawal_daily_limit?: number }): Promise<{ withdrawal_daily_limit: number }> {
    const { withdrawal_daily_limit } = data;
    if (withdrawal_daily_limit === undefined || isNaN(withdrawal_daily_limit) || withdrawal_daily_limit <= 0) {
      throw new BusinessException('ERROR_BAD_REQUEST_RESPONSE', 400);
    }
    this.configCache.delete('global');

    const config = await this.configModel.findOneAndUpdate(
      { key: 'global' },
      { $set: { withdrawal_daily_limit } },
      { returnDocument: 'after', upsert: true, lean: true },
    ) as any;

    return { withdrawal_daily_limit: config.withdrawal_daily_limit };
  }
}
