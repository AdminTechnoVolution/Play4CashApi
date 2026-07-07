import type { ConfigService } from '@nestjs/config';
import type { VerifyOptions } from 'jsonwebtoken';
export declare function jwtVerifyOptions(config: ConfigService): VerifyOptions;
export declare function isAccessTokenPayload(payload: unknown): payload is Record<string, unknown> & {
    typ: 'access';
};
export declare function isRefreshTokenPayload(payload: unknown): payload is Record<string, unknown> & {
    typ: 'refresh';
};
