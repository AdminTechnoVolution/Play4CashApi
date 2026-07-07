import { Model } from 'mongoose';
import { GreetingDocument } from './schemas/greeting.schema';
export declare class GreetingService {
    private readonly greetingModel;
    private readonly logger;
    constructor(greetingModel: Model<GreetingDocument>);
    getRandom(lang?: string): Promise<any>;
    create(dto: {
        text: Record<string, string>;
    }): Promise<any>;
    update(id: string, dto: {
        text?: Record<string, string>;
        active?: boolean;
    }): Promise<any>;
    getAll(): Promise<any>;
    delete(id: string): Promise<any>;
}
