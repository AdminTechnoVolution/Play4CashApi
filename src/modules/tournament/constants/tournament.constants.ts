/** Fixed group format: pairs of 2 players per group. */
export const TOURNAMENT_GROUP_SIZE = 2;

export const TOURNAMENT_MIN_PLAYERS = 2;
export const TOURNAMENT_MAX_PLAYERS = 1000;

/** @deprecated Legacy MVP reference — layout is validated via resolveTournamentLayout(). */
export const TOURNAMENT_MVP_PLAYER_COUNT = 50;
/** @deprecated Legacy MVP reference. */
export const TOURNAMENT_GROUP_COUNT = 5;

/** 1v1 games eligible for tournament rooms. */
export const TOURNAMENT_SUPPORTED_SOCKET_CODES = [
  'connect-four',
  'chess',
  'halma',
  'naval-battle',
  'battleship',
] as const;

export type TournamentSupportedSocketCode = (typeof TOURNAMENT_SUPPORTED_SOCKET_CODES)[number];

export enum TournamentStatus {
  DRAFT = 'draft',
  OPEN = 'open',
  FULL = 'full',
  COUNTDOWN = 'countdown',
  LOCKING = 'locking',
  RUNNING = 'running',
  BETWEEN_ROUNDS = 'between_rounds',
  FINALS_PENDING = 'finals_pending',
  FINALS_RUNNING = 'finals_running',
  FINISHED = 'finished',
  CANCELLED = 'cancelled',
}

export enum TournamentParticipantStatus {
  REGISTERED = 'registered',
  ACTIVE = 'active',
  ELIMINATED = 'eliminated',
  GROUP_WINNER = 'group_winner',
  FINALIST = 'finalist',
  WINNER = 'winner',
  RUNNER_UP = 'runner_up',
  FORFEITED = 'forfeited',
  REFUNDED = 'refunded',
}

export enum TournamentMatchStatus {
  PENDING = 'pending',
  READY = 'ready',
  WAITING_PRESENCE = 'waiting_presence',
  STARTED = 'started',
  FINISHED = 'finished',
  FORFEITED = 'forfeited',
  CANCELLED = 'cancelled',
}

export enum TournamentMatchRoundName {
  PRELIMINARY = 'preliminary',
  QUARTERFINAL = 'quarterfinal',
  SEMIFINAL = 'semifinal',
  GROUP_FINAL = 'group_final',
  FINALS_PLAYIN = 'finals_playin',
  FINALS_SEMIFINAL = 'finals_semifinal',
  GRAND_FINAL = 'grand_final',
}

export enum TournamentPhase {
  GROUPS = 'groups',
  FINALS = 'finals',
}

export enum TournamentTransactionType {
  REGISTRATION_DEBIT = 'registration_debit',
  REGISTRATION_REFUND = 'registration_refund',
  HOUSE_FEE = 'house_fee',
  FIRST_PLACE_PRIZE = 'first_place_prize',
  SECOND_PLACE_PRIZE = 'second_place_prize',
}
