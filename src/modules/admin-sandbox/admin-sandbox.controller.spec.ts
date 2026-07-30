import { IS_ADMIN_ROUTE_KEY } from '../../common/decorators/admin-route.decorator';
import { ADMIN_SANDBOX_ENDPOINTS } from './admin-sandbox.catalog';
import { AdminSandboxController } from './admin-sandbox.controller';

describe('AdminSandboxController', () => {
  it('is restricted to administrators', () => {
    expect(Reflect.getMetadata(IS_ADMIN_ROUTE_KEY, AdminSandboxController)).toBe(true);
  });

  it('returns the authoritative read-only catalog', () => {
    const result = new AdminSandboxController().getEndpoints();
    expect(result.read_only).toBe(true);
    expect(result.generated_at).toEqual(expect.any(String));
    expect(result.endpoints).toBe(ADMIN_SANDBOX_ENDPOINTS);
  });
});
