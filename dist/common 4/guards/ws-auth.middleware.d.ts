import { ConfigService } from '@nestjs/config';
import { Server } from 'socket.io';
export declare function applyWsAuth(server: Server, config: ConfigService, redis: any): void;
