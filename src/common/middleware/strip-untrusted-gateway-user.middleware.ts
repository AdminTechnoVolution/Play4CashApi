import type { ConfigService } from '@nestjs/config';

/**
 * Removes spoofable `x-gateway-user` unless the request is trusted:
 * - Matching `GATEWAY_INTERNAL_SECRET` on header `GATEWAY_TRUST_HEADER_NAME` (default x-gateway-internal), or
 * - Client IP in `TRUSTED_GATEWAY_IPS`.
 *
 * If neither secret nor IPs are configured, **always** strips `x-gateway-user` (direct API access).
 * Always removes the internal trust header before the rest of the pipeline runs.
 */
export function createStripUntrustedGatewayUserMiddleware(config: ConfigService) {
  return (req: Record<string, unknown>, _res: unknown, next: () => void): void => {
    const headers = req.headers as Record<string, string | string[] | undefined>;
    const trustHeaderName = config.get<string>('gateway.trustHeaderName') || 'x-gateway-internal';
    const secret = config.get<string>('gateway.trustSecret') || '';
    const trustedIps = config.get<string[]>('gateway.trustedIps') || [];

    const incomingTrust = headers[trustHeaderName];
    const trustToken = Array.isArray(incomingTrust) ? incomingTrust[0] : incomingTrust;

    let trusted = false;
    if (secret && trustToken === secret) {
      trusted = true;
    } else if (trustedIps.length > 0) {
      const ip =
        (req as { ip?: string }).ip ||
        (req as { socket?: { remoteAddress?: string } }).socket?.remoteAddress ||
        '';
      trusted = trustedIps.some((allowed) => allowed === ip);
    }

    const hasTrustConfig = !!secret || trustedIps.length > 0;
    if (!hasTrustConfig || !trusted) {
      delete headers['x-gateway-user'];
      delete (req as Record<string, unknown>).gatewayTrusted;
      delete (req as Record<string, unknown>).gatewayUser;
      delete (req as Record<string, unknown>).user;
    } else {
      const gatewayUser = parseGatewayUser(headers['x-gateway-user']);
      if (gatewayUser) {
        (req as Record<string, unknown>).gatewayTrusted = true;
        (req as Record<string, unknown>).gatewayUser = gatewayUser;
        (req as Record<string, unknown>).user = gatewayUser;
      }
    }

    delete headers[trustHeaderName];
    next();
  };
}

function parseGatewayUser(value: string | string[] | undefined): Record<string, unknown> | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined;
    return parsed as Record<string, unknown>;
  } catch {
    return undefined;
  }
}
