import type { ConfigService } from '@nestjs/config';
export declare function createStripUntrustedGatewayUserMiddleware(config: ConfigService): (req: Record<string, unknown>, _res: unknown, next: () => void) => void;
