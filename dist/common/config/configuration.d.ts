declare const _default: () => {
    port: number;
    mongoUri: string | undefined;
    redisUri: string | undefined;
    socketIoRedisAdapter: boolean;
    jwt: {
        secret: string | undefined;
        accessTtlSecs: number;
        refreshTtlSecs: number;
        issuer: string;
        audience: string;
    };
    auth: {
        refreshCookieName: string;
        refreshCookieSameSite: "lax" | "strict" | "none";
        refreshCookieSecure: boolean;
    };
    google: {
        clientId: string | undefined;
    };
    email: {
        service: string | undefined;
        from: string | undefined;
        pass: string | undefined;
        verificationExpiryMinutes: number;
    };
    binance: {
        apiKey: string | undefined;
        apiSecret: string | undefined;
    };
    withdrawal: {
        processingExpiryMinutes: number;
        verificationExpiryMinutes: number;
        minAmount: number;
        cronSchedule: string;
    };
    cors: {
        allowedOrigins: string[];
        socketOrigin: string;
    };
    admin: {
        emails: string[];
    };
    swagger: {
        enabled: boolean;
        password: string | undefined;
    };
    gateway: {
        trustSecret: string;
        trustHeaderName: string;
        trustedIps: string[];
    };
    webPush: {
        publicKey: string;
        privateKey: string;
        subject: string;
    };
    pwa: {
        minVersion: string;
        statsSampleRate: number;
        statsRetentionDays: number;
    };
};
export default _default;
