import { Model } from 'mongoose';
import { GracePeriodDocument } from './grace-period.schema';
export type GracePeriodHandler = (playerId: string, roomId: string) => Promise<void>;
export declare class GracePeriodService {
    private readonly graceModel;
    private readonly logger;
    private readonly handlers;
    static readonly MIN_GRACE_SECS = 30;
    constructor(graceModel: Model<GracePeriodDocument>);
    registerHandler(gameName: string, handler: GracePeriodHandler): void;
    start(gameName: string, playerId: string, roomId: string, ttlSec: number): Promise<void>;
    cancel(gameName: string, playerId: string): Promise<void>;
    sweep(): Promise<void>;
}
