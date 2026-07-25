import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { ADMIN_SANDBOX_ENDPOINTS } from './admin-sandbox.catalog';
import { AdminSandboxController } from './admin-sandbox.controller';

describe('AdminSandboxController', () => {
  it('is restricted to administrators', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminSandboxController)).toEqual(['admin']);
  });

  it('returns the authoritative read-only catalog', () => {
    const result = new AdminSandboxController().getEndpoints();
    expect(result.read_only).toBe(true);
    expect(result.generated_at).toEqual(expect.any(String));
    expect(result.endpoints).toBe(ADMIN_SANDBOX_ENDPOINTS);
  });
});
