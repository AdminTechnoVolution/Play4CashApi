/** MVP tournament format: exactly 50 players in 5 groups of 10. */
export const TOURNAMENT_MVP_PLAYER_COUNT = 50;
export const TOURNAMENT_GROUP_COUNT = 5;
export const TOURNAMENT_GROUP_SIZE = 10;

/** 1v1 games eligible for tournament rooms in MVP. */
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

export enum TournamentTransactionType {
  REGISTRATION_DEBIT = 'registration_debit',
  REGISTRATION_REFUND = 'registration_refund',
  HOUSE_FEE = 'house_fee',
  FIRST_PLACE_PRIZE = 'first_place_prize',
  SECOND_PLACE_PRIZE = 'second_place_prize',
}

export enum TournamentPhase {
  GROUPS = 'groups',
  FINALS = 'finals',
}
