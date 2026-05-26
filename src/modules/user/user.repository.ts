import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).lean();
  }

  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).lean();
  }

  /** findById with a Mongoose projection string, e.g. '-created_at' */
  async findByIdSelect(id: string, select: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).select(select).lean();
  }

  async findByUsername(username: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ username })
      .collation({ locale: 'en', strength: 2 })
      .lean();
  }

  async create(data: Partial<User>): Promise<UserDocument> {
    return this.userModel.create(data);
  }

  async updateById(id: string, update: Partial<User>): Promise<UserDocument | null> {
    return this.userModel.findByIdAndUpdate(id, update, { returnDocument: 'after' }).lean();
  }

  /** Public stats: total user documents (same basis as admin aggregate `total_users`). */
  async countRegisteredUsers(): Promise<number> {
    return this.userModel.countDocuments().exec();
  }

  async upsertPushSubscription(
    userId: string,
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
  ): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { $pull: { push_subscriptions: { endpoint: sub.endpoint } } },
    );
    await this.userModel.updateOne(
      { _id: userId },
      { $push: { push_subscriptions: sub } },
    );
  }

  async removePushSubscription(userId: string, endpoint: string): Promise<void> {
    await this.userModel.updateOne(
      { _id: userId },
      { $pull: { push_subscriptions: { endpoint } } },
    );
  }

  async getTotalBalances(): Promise<any> {
    const result = await this.userModel.aggregate([
      {
        $group: {
          _id: null,
          total_balances: { $sum: '$balance' },
          total_deposited: { $sum: '$total_recharged' },
          total_withdrawn: { $sum: '$total_witdrawal' },
          total_users: { $sum: 1 },
        },
      },
    ]);
    const data = result.length > 0 ? result[0] : { total_balances: 0, total_deposited: 0, total_withdrawn: 0, total_users: 0 };
    delete data._id;
    return data;
  }
}
