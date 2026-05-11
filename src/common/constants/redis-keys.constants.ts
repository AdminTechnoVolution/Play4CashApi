export const REDIS_KEY_ACCESS_TOKEN = 'accessTokens:';
export const REDIS_KEY_REFRESH_TOKEN = 'refreshTokens:';
/** Stores active refresh jti per session family, plus userId. JSON: { userId, currentJti } */
export const REDIS_KEY_SESSION_FAMILY = 'sessionFamilies:';
/** Set of all refresh tokens issued under a family (for cascade revoke on reuse). */
export const REDIS_KEY_FAMILY_REFRESHES = 'familyRefreshes:';
/** Set of all access tokens issued under a family (for cascade revoke on reuse). */
export const REDIS_KEY_FAMILY_ACCESSES = 'familyAccesses:';
