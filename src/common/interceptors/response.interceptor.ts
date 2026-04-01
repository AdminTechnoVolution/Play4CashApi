import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ApiResponse<T> {
  success: boolean;
  messages: string[];
  data?: T;
}

/**
 * Wraps every successful response in { success: true, messages: [], data: ... }
 * matching the existing BaseResponse format.
 */
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        // If the service already returned a BaseResponse shape, pass through
        if (
          data &&
          typeof data === 'object' &&
          'success' in (data as object)
        ) {
          return data as any;
        }
        return { success: true, messages: [], data: data ?? null };
      }),
    );
  }
}
