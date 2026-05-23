import { BusinessException } from '../../common/exceptions/business.exception';
import type { LanguageField } from './schemas/game.schema';

export const GAME_LANGS = ['es', 'en', 'fr', 'de', 'it', 'pt'] as const;
export type GameLang = (typeof GAME_LANGS)[number];

/** Normalize admin payload to a full LanguageField (all six locales filled). */
export function normalizeLanguageField(value: unknown, fieldLabel: string): LanguageField {
  if (value == null || value === '') {
    throw new BusinessException(`ERROR_GAME_${fieldLabel}_REQUIRED`, 400);
  }

  let partial: Partial<Record<GameLang, string>> = {};

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      throw new BusinessException(`ERROR_GAME_${fieldLabel}_REQUIRED`, 400);
    }
    partial = { en: trimmed, es: trimmed };
  } else if (typeof value === 'object' && !Array.isArray(value)) {
    for (const lang of GAME_LANGS) {
      const raw = (value as Record<string, unknown>)[lang];
      if (typeof raw === 'string' && raw.trim()) {
        partial[lang] = raw.trim();
      }
    }
  } else {
    throw new BusinessException(`ERROR_GAME_${fieldLabel}_INVALID`, 400);
  }

  const fallback = partial.en || partial.es;
  if (!fallback) {
    throw new BusinessException(`ERROR_GAME_${fieldLabel}_REQUIRED`, 400);
  }

  return {
    en: partial.en ?? fallback,
    es: partial.es ?? fallback,
    fr: partial.fr ?? fallback,
    de: partial.de ?? fallback,
    it: partial.it ?? fallback,
    pt: partial.pt ?? fallback,
  };
}

export function normalizeRulesField(value: unknown): LanguageField[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new BusinessException('ERROR_GAME_RULES_INVALID', 400);
  }
  return value.map((rule, index) =>
    normalizeLanguageField(rule, `RULE_${index + 1}`),
  );
}

/** Admin read model: full i18n objects, never flattened by Accept-Language. */
export function toAdminGameRecord(game: Record<string, any>, activeRooms?: number): Record<string, unknown> {
  const id = game._id?.toString?.() ?? game.id;
  return {
    id,
    _id: game._id ?? id,
    name: game.name ?? {},
    description: game.description ?? {},
    rules: Array.isArray(game.rules) ? game.rules : [],
    active: game.active,
    min_players: game.min_players,
    max_players: game.max_players,
    min_bet: game.min_bet,
    default_bets: game.default_bets ?? [],
    house_edge: game.house_edge,
    houseEdge: game.house_edge,
    socket_code: game.socket_code,
    turn_timer_seconds: game.turn_timer_seconds,
    uno_match_target: game.uno_match_target,
    unoMatchTarget: game.uno_match_target,
    ...(activeRooms !== undefined ? { activeRooms } : {}),
  };
}
