import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
export declare class AuthGuard implements CanActivate {
    private readonly reflector;
    private readonly config;
    private readonly redis;
    constructor(reflector: Reflector, config: ConfigService, redis: any);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
