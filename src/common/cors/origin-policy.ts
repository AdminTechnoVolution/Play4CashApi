export function parseOriginList(raw: string | undefined): string[] {
  return (raw || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function createOriginChecker(
  allowedOrigins: string[],
  options: { failClosedWhenEmpty?: boolean } = {},
): (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void {
  const failClosedWhenEmpty = options.failClosedWhenEmpty ?? false;

  return (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.length === 0) {
      callback(null, !failClosedWhenEmpty);
      return;
    }

    callback(null, allowedOrigins.includes(origin));
  };
}

export function buildWebSocketCorsOptions(
  rawOrigins = process.env.ALLOWED_ORIGINS,
  nodeEnv = process.env.NODE_ENV || 'development',
): {
  origin: boolean | string[] | ((origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => void);
  credentials: boolean;
} {
  const allowedOrigins = parseOriginList(rawOrigins);

  if (nodeEnv === 'production' && allowedOrigins.length === 0) {
    throw new Error(
      'API: ALLOWED_ORIGINS must list at least one origin when NODE_ENV=production (credentials are enabled).',
    );
  }

  return {
    origin: createOriginChecker(allowedOrigins, { failClosedWhenEmpty: nodeEnv === 'production' }),
    credentials: true,
  };
}
