import type { Socket } from 'socket.io';
import {
  GAME_LANGS,
  normalizeLanguageField,
  type GameLang,
} from '../game/game-language.util';
import type { LanguageField } from '../game/schemas/game.schema';
import type { TournamentDocument } from './schemas/tournament.schema';

export { normalizeLanguageField, GAME_LANGS };

const SUPPORTED = new Set<string>(GAME_LANGS);

export function normalizeOptionalLanguageField(value: unknown): LanguageField {
  if (value == null || value === '') {
    return { en: '', es: '', fr: '', de: '', it: '', pt: '' };
  }
  return normalizeLanguageField(value, 'DESCRIPTION');
}

export function resolveRequestLang(langHeader?: string): GameLang {
  const raw = (langHeader ?? 'en').split(',')[0]?.trim().toLowerCase().slice(0, 2);
  return SUPPORTED.has(raw) ? (raw as GameLang) : 'en';
}

export function resolveWsLang(client: Socket): GameLang {
  const queryLang = client.handshake?.query?.lang as string | undefined;
  if (queryLang && SUPPORTED.has(queryLang.toLowerCase())) {
    return queryLang.toLowerCase() as GameLang;
  }
  const authLang = (client.handshake?.auth as { lang?: string } | undefined)?.lang;
  if (authLang && SUPPORTED.has(authLang.toLowerCase())) {
    return authLang.toLowerCase() as GameLang;
  }
  if (client.data?.lang && SUPPORTED.has(client.data.lang)) {
    return client.data.lang as GameLang;
  }
  const headerLang = client.handshake.headers['accept-language'] as string | undefined;
  if (headerLang) {
    const tag = headerLang.split(',')[0]?.trim().toLowerCase().slice(0, 2);
    if (tag && SUPPORTED.has(tag)) return tag as GameLang;
  }
  return 'en';
}

/** Legacy string fields (pre-i18n) and LanguageField both supported. */
export function pickLocalizedField(
  field: LanguageField | string | undefined | null,
  lang: string,
): string {
  if (typeof field === 'string') return field;
  if (!field || typeof field !== 'object') return '';
  const l = SUPPORTED.has(lang) ? lang : 'en';
  const lf = field as LanguageField;
  return lf[l as GameLang] ?? lf.en ?? lf.es ?? '';
}

export function toAdminLanguageField(
  field: LanguageField | string | undefined | null,
  fieldLabel: string,
): LanguageField {
  if (field == null || field === '') {
    return { en: '', es: '', fr: '', de: '', it: '', pt: '' };
  }
  if (typeof field === 'string') {
    return normalizeLanguageField(field, fieldLabel);
  }
  return {
    en: field.en ?? '',
    es: field.es ?? '',
    fr: field.fr ?? '',
    de: field.de ?? '',
    it: field.it ?? '',
    pt: field.pt ?? '',
  };
}

export function toAdminTournamentRecord(t: TournamentDocument) {
  return {
    id: t._id.toString(),
    title: toAdminLanguageField(t.title, 'TITLE'),
    description: toAdminLanguageField(t.description, 'DESCRIPTION'),
    gameId: t.game_id.toString(),
    gameSocketCode: t.game_socket_code,
    status: t.status,
    buyIn: t.buy_in,
    maxPlayers: t.max_players,
    minPlayers: t.min_players,
    groupCount: t.group_count,
    groupSize: t.group_size,
    registeredCount: t.registered_count,
    startsAt: t.starts_at.toISOString(),
    registrationOpensAt: t.registration_opens_at?.toISOString() ?? null,
    registrationClosesAt: t.registration_closes_at?.toISOString() ?? null,
    turnTimerSeconds: t.turn_timer_seconds,
    betweenRoundsPauseSeconds: t.between_rounds_pause_seconds,
    presenceWindowSeconds: t.presence_window_seconds,
    rematchDelaySeconds: t.rematch_delay_seconds,
    houseFeePercent: t.house_fee_percent,
    firstPlacePercent: t.first_place_percent,
    secondPlacePercent: t.second_place_percent,
    grossPrizePool: t.gross_prize_pool,
    houseAmount: t.house_amount,
    firstPlaceAmount: t.first_place_amount,
    secondPlaceAmount: t.second_place_amount,
    winnerUserId: t.winner_user_id?.toString() ?? null,
    runnerUpUserId: t.runner_up_user_id?.toString() ?? null,
    bracketSeed: t.bracket_seed ?? null,
    currentPhase: t.current_phase,
    currentRoundIndex: t.current_round_index,
    betweenRoundsEndsAt: t.between_rounds_ends_at?.toISOString() ?? null,
    presenceWindowEndsAt: t.presence_window_ends_at?.toISOString() ?? null,
    prizesSettled: t.prizes_settled,
    finishedAt: t.finished_at?.toISOString() ?? null,
  };
}
