import { SetMetadata } from '@nestjs/common';

export const IS_ADMIN_ROUTE_KEY = 'isAdminRoute';

/** Marks an endpoint as requiring the isolated administrative identity domain. */
export const AdminRoute = () => SetMetadata(IS_ADMIN_ROUTE_KEY, true);
