import { GreetingService } from './greeting.service';
declare class CreateGreetingDto {
    text: Record<string, string>;
}
declare class UpdateGreetingDto {
    text?: Record<string, string>;
    active?: boolean;
}
export declare class GreetingController {
    private readonly greetingService;
    constructor(greetingService: GreetingService);
    getRandom(lang: string): Promise<any>;
    getAll(): Promise<any>;
    create(dto: CreateGreetingDto): Promise<any>;
    update(id: string, dto: UpdateGreetingDto): Promise<any>;
    delete(id: string): Promise<any>;
}
export {};
