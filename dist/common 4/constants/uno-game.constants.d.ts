export declare const UNO_SOCKET_CODE = "uno";
export declare const UNO_MATCH_TARGET_MIN = 50;
export declare const UNO_MATCH_TARGET_MAX = 500;
export declare const UNO_MATCH_TARGET_DEFAULT = 200;
export declare const UNO_ALLOWED_PLAYER_COUNTS: readonly number[];
export declare function isValidUnoPlayerCount(n: number): boolean;
export declare function clampUnoMatchTarget(n: number): number;
export declare function resolveUnoMatchTarget(catalogTarget: unknown, envRaw: string | undefined): number;
