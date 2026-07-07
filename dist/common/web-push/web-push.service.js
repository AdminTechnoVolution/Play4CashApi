"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var WebPushService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebPushService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mongoose_1 = require("@nestjs/mongoose");
const mongoose_2 = require("mongoose");
const user_schema_1 = require("../../modules/user/schemas/user.schema");
function loadWebPush() {
    try {
        return require('web-push');
    }
    catch {
        return null;
    }
}
let WebPushService = WebPushService_1 = class WebPushService {
    config;
    userModel;
    logger = new common_1.Logger(WebPushService_1.name);
    configured = false;
    webpush;
    constructor(config, userModel) {
        this.config = config;
        this.userModel = userModel;
        this.webpush = loadWebPush();
        const publicKey = (config.get('webPush.publicKey') || '').trim();
        const privateKey = (config.get('webPush.privateKey') || '').trim();
        const subject = (config.get('webPush.subject') || 'mailto:support@play4cash.com').trim();
        if (this.webpush && publicKey && privateKey) {
            this.webpush.setVapidDetails(subject, publicKey, privateKey);
            this.configured = true;
        }
    }
    isConfigured() {
        return this.configured;
    }
    async notifyUser(userId, payload) {
        if (!this.configured || !this.webpush || !userId)
            return;
        const user = await this.userModel
            .findById(userId)
            .select('push_subscriptions')
            .lean();
        const subs = user?.push_subscriptions ?? [];
        if (subs.length === 0)
            return;
        const body = JSON.stringify({
            title: payload.title,
            body: payload.body,
            url: payload.url || '/',
        });
        const wp = this.webpush;
        if (!wp)
            return;
        await Promise.all(subs.map(async (sub) => {
            try {
                await wp.sendNotification({
                    endpoint: sub.endpoint,
                    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
                }, body);
            }
            catch (err) {
                const status = err?.statusCode;
                if (status === 404 || status === 410) {
                    await this.userModel.updateOne({ _id: userId }, { $pull: { push_subscriptions: { endpoint: sub.endpoint } } });
                }
                else {
                    this.logger.warn(`event=web_push_failed user=${userId} status=${status ?? 'unknown'}`);
                }
            }
        }));
    }
    notifyYourTurn(userId, game, roomId) {
        const gameLabel = game.replace(/-/g, ' ');
        void this.notifyUser(userId, {
            title: 'Play4Cash',
            body: `Your turn in ${gameLabel}`,
            url: `/play/${game}?room=${roomId}`,
        }).catch(() => {
        });
    }
};
exports.WebPushService = WebPushService;
exports.WebPushService = WebPushService = WebPushService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, mongoose_1.InjectModel)(user_schema_1.User.name)),
    __metadata("design:paramtypes", [config_1.ConfigService,
        mongoose_2.Model])
], WebPushService);
//# sourceMappingURL=web-push.service.js.map