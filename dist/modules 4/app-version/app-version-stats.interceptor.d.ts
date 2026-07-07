import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { AppVersionStatsService } from './app-version-stats.service';
export declare class AppVersionStatsInterceptor implements NestInterceptor {
    private readonly stats;
    constructor(stats: AppVersionStatsService);
    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown>;
}
