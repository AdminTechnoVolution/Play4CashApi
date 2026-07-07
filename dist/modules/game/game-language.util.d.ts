import type { LanguageField } from './schemas/game.schema';
export declare const GAME_LANGS: readonly ["es", "en", "fr", "de", "it", "pt"];
export type GameLang = (typeof GAME_LANGS)[number];
export declare function normalizeLanguageField(value: unknown, fieldLabel: string): LanguageField;
export declare function normalizeRulesField(value: unknown): LanguageField[];
export declare function toAdminGameRecord(game: Record<string, any>, activeRooms?: number): Record<string, unknown>;
