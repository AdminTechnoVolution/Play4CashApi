import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { UserDocument } from '../../modules/user/schemas/user.schema';
export type WebPushPayload = {
    title: string;
    body: string;
    url?: string;
};
export declare class WebPushService {
    private readonly config;
    private readonly userModel;
    private readonly logger;
    private configured;
    private readonly webpush;
    constructor(config: ConfigService, userModel: Model<UserDocument>);
    isConfigured(): boolean;
    notifyUser(userId: string, payload: WebPushPayload): Promise<void>;
    notifyYourTurn(userId: string, game: string, roomId: string): void;
}
