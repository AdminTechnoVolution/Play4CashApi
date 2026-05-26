import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../../modules/user/schemas/user.schema';

type WebPushLib = {
  setVapidDetails(subject: string, publicKey: string, privateKey: string): void;
  sendNotification(
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string | Buffer,
  ): Promise<{ statusCode: number }>;
};

function loadWebPush(): WebPushLib | null {
  try {
    // Optional runtime dep — package.json lists web-push; install may lag in dev.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('web-push') as WebPushLib;
  } catch {
    return null;
  }
}

export type WebPushPayload = {
  title: string;
  body: string;
  url?: string;
};

/**
 * Sends Web Push notifications to registered PWA subscriptions (background turn alerts).
 * No-op when VAPID keys are not configured — subscription storage still works without them.
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  private configured = false;
  private readonly webpush: WebPushLib | null;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {
    this.webpush = loadWebPush();
    const publicKey = (config.get<string>('webPush.publicKey') || '').trim();
    const privateKey = (config.get<string>('webPush.privateKey') || '').trim();
    const subject = (config.get<string>('webPush.subject') || 'mailto:support@play4cash.com').trim();
    if (this.webpush && publicKey && privateKey) {
      this.webpush.setVapidDetails(subject, publicKey, privateKey);
      this.configured = true;
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async notifyUser(userId: string, payload: WebPushPayload): Promise<void> {
    if (!this.configured || !this.webpush || !userId) return;

    const user = await this.userModel
      .findById(userId)
      .select('push_subscriptions')
      .lean();
    const subs = user?.push_subscriptions ?? [];
    if (subs.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url || '/',
    });

    const wp = this.webpush;
    if (!wp) return;

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await wp.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
            },
            body,
          );
        } catch (err: unknown) {
          const status = (err as { statusCode?: number })?.statusCode;
          if (status === 404 || status === 410) {
            await this.userModel.updateOne(
              { _id: userId },
              { $pull: { push_subscriptions: { endpoint: sub.endpoint } } },
            );
          } else {
            this.logger.warn(`event=web_push_failed user=${userId} status=${status ?? 'unknown'}`);
          }
        }
      }),
    );
  }

  /** Fire-and-forget "your turn" alert for background PWA tabs. */
  notifyYourTurn(userId: string, game: string, roomId: string): void {
    const gameLabel = game.replace(/-/g, ' ');
    void this.notifyUser(userId, {
      title: 'Play4Cash',
      body: `Your turn in ${gameLabel}`,
      url: `/play/${game}?room=${roomId}`,
    }).catch(() => {
      /* fire-and-forget */
    });
  }
}
