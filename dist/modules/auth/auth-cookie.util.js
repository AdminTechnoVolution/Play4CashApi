"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCookieFromHeader = readCookieFromHeader;
exports.refreshCookieName = refreshCookieName;
exports.buildRefreshCookieOptions = buildRefreshCookieOptions;
exports.buildClearRefreshCookieOptions = buildClearRefreshCookieOptions;
exports.setRefreshCookie = setRefreshCookie;
exports.clearRefreshCookie = clearRefreshCookie;
function readCookieFromHeader(cookieHeader, name) {
    if (!cookieHeader)
        return undefined;
    for (const part of cookieHeader.split(';')) {
        const idx = part.indexOf('=');
        if (idx === -1)
            continue;
        const k = part.slice(0, idx).trim();
        if (k !== name)
            continue;
        return decodeURIComponent(part.slice(idx + 1).trim());
    }
    return undefined;
}
function refreshCookieName(config) {
    return config.get('auth.refreshCookieName');
}
function buildRefreshCookieOptions(config) {
    const refreshTtlSecs = config.get('jwt.refreshTtlSecs');
    const sameSite = config.get('auth.refreshCookieSameSite');
    let secure = config.get('auth.refreshCookieSecure');
    if (sameSite === 'none' && !secure) {
        secure = true;
    }
    return {
        httpOnly: true,
        secure,
        sameSite,
        maxAge: refreshTtlSecs * 1000,
        path: '/',
    };
}
function buildClearRefreshCookieOptions(config) {
    const sameSite = config.get('auth.refreshCookieSameSite');
    let secure = config.get('auth.refreshCookieSecure');
    if (sameSite === 'none' && !secure) {
        secure = true;
    }
    return {
        httpOnly: true,
        secure,
        sameSite,
        path: '/',
    };
}
function setRefreshCookie(res, config, refreshToken) {
    const name = refreshCookieName(config);
    res.cookie(name, refreshToken, buildRefreshCookieOptions(config));
}
function clearRefreshCookie(res, config) {
    const name = refreshCookieName(config);
    res.clearCookie(name, buildClearRefreshCookieOptions(config));
}
//# sourceMappingURL=auth-cookie.util.js.map