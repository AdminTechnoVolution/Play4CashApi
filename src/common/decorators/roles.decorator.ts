import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restrict a route to one or more roles. Used with `RolesGuard`.
 * Example: `@Roles('admin')`
 */
export const Roles = (...roles: Array<'admin' | 'user'>) => SetMetadata(ROLES_KEY, roles);
