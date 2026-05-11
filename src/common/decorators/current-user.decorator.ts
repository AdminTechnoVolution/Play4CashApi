import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
  id: string;
  sub?: string;
  email: string;
  username?: string;
  name?: string;
  role?: 'admin' | 'user';
  /** Identifies the session family used for refresh-reuse detection. */
  familyId?: string;
  /** Access tokens only (set by AuthService). */
  typ?: 'access';
  jti?: string;
  iat: number;
  exp: number;
}

/**
 * Extracts the JWT payload stored on req.user by AuthGuard.
 * Usage: @CurrentUser() user: JwtPayload
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
