import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { ADMIN_SANDBOX_ENDPOINTS } from './admin-sandbox.catalog';
import { AdminHealthController } from '../admin-health/admin-health.controller';
import { AppConfigAdminController } from '../app-config/app-config-admin.controller';
import { AppVersionController } from '../app-version/app-version.controller';
import { ContactUsAdminController } from '../contact-us/contact-us-admin.controller';
import { GameAuditController } from '../game-audit/game-audit.controller';
import { GameAdminController } from '../game/game-admin.controller';
import { GreetingAdminController } from '../greeting/greeting-admin.controller';
import { HouseTreasuryController } from '../house-treasury/house-treasury.controller';
import { PaymentsDashboardController } from '../payments/payments-dashboard.controller';
import { RoomAdminController } from '../room/room-admin.controller';
import { TournamentAdminController } from '../tournament/controllers/tournament-admin.controller';
import { UserAdminController } from '../user/user-admin.controller';
import { WalletAdminController } from '../wallet/wallet-admin.controller';

const controllers = [
  AdminHealthController,
  AppConfigAdminController,
  AppVersionController,
  ContactUsAdminController,
  GameAuditController,
  GameAdminController,
  GreetingAdminController,
  HouseTreasuryController,
  PaymentsDashboardController,
  RoomAdminController,
  TournamentAdminController,
  UserAdminController,
  WalletAdminController,
];

function joinRoute(controllerPath: string, methodPath: string): string {
  const joined = [controllerPath, methodPath].filter(Boolean).join('/');
  return `/api/${joined}`
    .replace(/\/+/g, '/')
    .replace(/\/$/, '')
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function registeredGetRoutes(): Set<string> {
  const routes = new Set<string>();
  for (const controller of controllers) {
    const controllerPath = Reflect.getMetadata(PATH_METADATA, controller) || '';
    for (const property of Object.getOwnPropertyNames(controller.prototype)) {
      const handler = controller.prototype[property];
      if (typeof handler !== 'function') continue;
      if (Reflect.getMetadata(METHOD_METADATA, handler) !== RequestMethod.GET) continue;
      const methodPath = Reflect.getMetadata(PATH_METADATA, handler) || '';
      routes.add(joinRoute(controllerPath, methodPath));
    }
  }
  return routes;
}

describe('admin sandbox catalog', () => {
  it('contains only unique read-only GET endpoints', () => {
    expect(ADMIN_SANDBOX_ENDPOINTS.length).toBeGreaterThan(0);
    expect(ADMIN_SANDBOX_ENDPOINTS.every((endpoint) => endpoint.method === 'GET')).toBe(true);
    expect(new Set(ADMIN_SANDBOX_ENDPOINTS.map((endpoint) => endpoint.id)).size)
      .toBe(ADMIN_SANDBOX_ENDPOINTS.length);
    expect(new Set(ADMIN_SANDBOX_ENDPOINTS.map((endpoint) => endpoint.path)).size)
      .toBe(ADMIN_SANDBOX_ENDPOINTS.length);
    expect(ADMIN_SANDBOX_ENDPOINTS.every((endpoint) =>
      endpoint.authentication === 'admin' && endpoint.path.startsWith('/api/admin/'),
    )).toBe(true);
  });

  it('maps every catalog entry to a registered NestJS GET route', () => {
    const routes = registeredGetRoutes();
    const missing = ADMIN_SANDBOX_ENDPOINTS
      .map((endpoint) => endpoint.path)
      .filter((path) => !routes.has(path));
    expect(missing).toEqual([]);
  });

  it('does not expose mutation routes or sensitive operation names', () => {
    const serialized = JSON.stringify(ADMIN_SANDBOX_ENDPOINTS).toLowerCase();
    expect(serialized).not.toMatch(/reversal|withdrawals|adjustments|delete|update|patch|post|put/);
  });
});
