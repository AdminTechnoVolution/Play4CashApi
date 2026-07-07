import type { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
export declare function createAppVersionHeadersMiddleware(config: ConfigService): (req: Request, res: Response, next: NextFunction) => void;
