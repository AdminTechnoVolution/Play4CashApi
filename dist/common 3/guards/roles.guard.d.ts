import { CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
export declare class RolesGuard implements CanActivate {
    private readonly reflector;
    private readonly config;
    constructor(reflector: Reflector, config: ConfigService);
    canActivate(context: ExecutionContext): boolean;
}
