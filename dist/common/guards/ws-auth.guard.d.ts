import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
export declare class WsAuthGuard implements CanActivate {
    private readonly config;
    private readonly redis;
    constructor(config: ConfigService, redis: any);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
