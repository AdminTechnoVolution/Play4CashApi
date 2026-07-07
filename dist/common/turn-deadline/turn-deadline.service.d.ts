import { Model } from 'mongoose';
import { TurnDeadlineDocument } from './turn-deadline.schema';
export type TurnDeadlineHandler = (playerId: string, roomId: string) => Promise<void>;
export declare class TurnDeadlineService {
    private readonly model;
    private readonly logger;
    private readonly handlers;
    constructor(model: Model<TurnDeadlineDocument>);
    registerHandler(gameName: string, handler: TurnDeadlineHandler): void;
    schedule(gameName: string, roomId: string, playerId: string, ttlSec: number): Promise<void>;
    cancel(gameName: string, roomId: string): Promise<void>;
    sweep(): Promise<void>;
}
