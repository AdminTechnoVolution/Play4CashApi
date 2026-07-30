import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin, AdminDocument, AdminStatus } from './schemas/admin.schema';

@Injectable()
export class AdminRepository {
  constructor(@InjectModel(Admin.name) private readonly model: Model<AdminDocument>) {}

  findByEmail(email: string): Promise<AdminDocument | null> {
    return this.model.findOne({ email: email.trim().toLowerCase() });
  }

  findById(id: string): Promise<AdminDocument | null> {
    return this.model.findById(id);
  }

  async bindGoogleSubjectAndRecordLogin(
    id: string,
    googleSubject: string,
    displayName: string,
  ): Promise<AdminDocument | null> {
    const now = new Date();
    return this.model.findOneAndUpdate(
      {
        _id: id,
        status: AdminStatus.ACTIVE,
        $or: [
          { google_subject: googleSubject },
          { google_subject: { $exists: false } },
          { google_subject: null },
        ],
      },
      {
        $set: {
          google_subject: googleSubject,
          display_name: displayName,
          last_login_at: now,
        },
      },
      { returnDocument: 'after' },
    );
  }

  async provision(email: string, displayName: string): Promise<AdminDocument> {
    const normalized = email.trim().toLowerCase();
    return this.model.findOneAndUpdate(
      { email: normalized },
      {
        $set: { display_name: displayName.trim() },
        $setOnInsert: {
          email: normalized,
          status: AdminStatus.ACTIVE,
          created_source: 'cli',
        },
      },
      { upsert: true, returnDocument: 'after' },
    ) as Promise<AdminDocument>;
  }

  list(): Promise<AdminDocument[]> {
    return this.model.find().sort({ email: 1 });
  }

  setStatus(email: string, status: AdminStatus): Promise<AdminDocument | null> {
    return this.model.findOneAndUpdate(
      { email: email.trim().toLowerCase() },
      { $set: { status } },
      { returnDocument: 'after' },
    );
  }
}
