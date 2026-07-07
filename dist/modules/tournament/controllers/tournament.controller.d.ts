import type { JwtPayload } from '../../../common/decorators/current-user.decorator';
import { TournamentStateService } from '../services/tournament-state.service';
import { TournamentRegistrationService } from '../services/tournament-registration.service';
import { TournamentAdminService } from '../services/tournament-admin.service';
export declare class TournamentController {
    private readonly stateService;
    private readonly registrationService;
    private readonly adminService;
    constructor(stateService: TournamentStateService, registrationService: TournamentRegistrationService, adminService: TournamentAdminService);
    list(user: JwtPayload, lang: string): Promise<{
        success: boolean;
        messages: never[];
        data: {
            serverNow: string;
            startsAt: string;
            remainingMs: number;
            pauseRemainingMs: number | null;
            currentPhase: string;
            currentRoundIndex: number;
            status: string;
            id: string;
            title: string;
            description: string;
            gameSocketCode: string;
            gameId: string;
            buyIn: number;
            maxPlayers: number;
            minPlayers: number;
            registeredCount: number;
            groupCount: number;
            turnTimerSeconds: number;
            betweenRoundsPauseSeconds: number;
            houseFeePercent: number;
            firstPlacePercent: number;
            secondPlacePercent: number;
            grossPrizePool: number;
            firstPlaceAmount: number;
            secondPlaceAmount: number;
            winnerUserId: string | null;
            runnerUpUserId: string | null;
            myRegistration: {
                status: string;
                seed?: number;
                groupNumber?: number;
            } | null;
            myActiveMatch: {
                matchId: string;
                status: import("../constants/tournament.constants").TournamentMatchStatus;
                roomId: string | null;
                roundName: import("../constants/tournament.constants").TournamentMatchRoundName;
                opponentUsername: string | null;
                presenceCheckAt: string | null;
                canJoin: boolean;
                needsLobby: boolean;
            } | null;
        }[];
    }>;
    history(user: JwtPayload, lang: string): Promise<{
        success: boolean;
        messages: never[];
        data: {
            id: string;
            title: string;
            gameSocketCode: string;
            status: import("../constants/tournament.constants").TournamentStatus;
            buyIn: number;
            maxPlayers: number;
            registeredCount: number;
            grossPrizePool: number;
            houseFeePercent: number;
            firstPlacePercent: number;
            firstPlaceAmount: number;
            secondPlaceAmount: number;
            participantStatus: import("../constants/tournament.constants").TournamentParticipantStatus;
            finalRank: number | null;
            prizeAmount: number;
            finishedAt: string | null;
            startedAt: string;
        }[];
    }>;
    mine(user: JwtPayload, lang: string): Promise<{
        success: boolean;
        messages: never[];
        data: {
            serverNow: string;
            startsAt: string;
            remainingMs: number;
            pauseRemainingMs: number | null;
            currentPhase: string;
            currentRoundIndex: number;
            status: string;
            id: string;
            title: string;
            description: string;
            gameSocketCode: string;
            gameId: string;
            buyIn: number;
            maxPlayers: number;
            minPlayers: number;
            registeredCount: number;
            groupCount: number;
            turnTimerSeconds: number;
            betweenRoundsPauseSeconds: number;
            houseFeePercent: number;
            firstPlacePercent: number;
            secondPlacePercent: number;
            grossPrizePool: number;
            firstPlaceAmount: number;
            secondPlaceAmount: number;
            winnerUserId: string | null;
            runnerUpUserId: string | null;
            myRegistration: {
                status: string;
                seed?: number;
                groupNumber?: number;
            } | null;
            myActiveMatch: {
                matchId: string;
                status: import("../constants/tournament.constants").TournamentMatchStatus;
                roomId: string | null;
                roundName: import("../constants/tournament.constants").TournamentMatchRoundName;
                opponentUsername: string | null;
                presenceCheckAt: string | null;
                canJoin: boolean;
                needsLobby: boolean;
            } | null;
        }[];
    }>;
    getOne(id: string, user: JwtPayload, lang: string): Promise<{
        success: boolean;
        messages: never[];
        data: {
            serverNow: string;
            startsAt: string;
            remainingMs: number;
            pauseRemainingMs: number | null;
            currentPhase: string;
            currentRoundIndex: number;
            status: string;
            id: string;
            title: string;
            description: string;
            gameSocketCode: string;
            gameId: string;
            buyIn: number;
            maxPlayers: number;
            minPlayers: number;
            registeredCount: number;
            groupCount: number;
            turnTimerSeconds: number;
            betweenRoundsPauseSeconds: number;
            houseFeePercent: number;
            firstPlacePercent: number;
            secondPlacePercent: number;
            grossPrizePool: number;
            firstPlaceAmount: number;
            secondPlaceAmount: number;
            winnerUserId: string | null;
            runnerUpUserId: string | null;
            myRegistration: {
                status: string;
                seed?: number;
                groupNumber?: number;
            } | null;
            myActiveMatch: {
                matchId: string;
                status: import("../constants/tournament.constants").TournamentMatchStatus;
                roomId: string | null;
                roundName: import("../constants/tournament.constants").TournamentMatchRoundName;
                opponentUsername: string | null;
                presenceCheckAt: string | null;
                canJoin: boolean;
                needsLobby: boolean;
            } | null;
        };
    }>;
    getState(id: string, user: JwtPayload, lang: string): Promise<{
        success: boolean;
        messages: never[];
        data: {
            serverNow: string;
            startsAt: string;
            remainingMs: number;
            pauseRemainingMs: number | null;
            currentPhase: string;
            currentRoundIndex: number;
            status: string;
            id: string;
            title: string;
            description: string;
            gameSocketCode: string;
            gameId: string;
            buyIn: number;
            maxPlayers: number;
            minPlayers: number;
            registeredCount: number;
            groupCount: number;
            turnTimerSeconds: number;
            betweenRoundsPauseSeconds: number;
            houseFeePercent: number;
            firstPlacePercent: number;
            secondPlacePercent: number;
            grossPrizePool: number;
            firstPlaceAmount: number;
            secondPlaceAmount: number;
            winnerUserId: string | null;
            runnerUpUserId: string | null;
            myRegistration: {
                status: string;
                seed?: number;
                groupNumber?: number;
            } | null;
            myActiveMatch: {
                matchId: string;
                status: import("../constants/tournament.constants").TournamentMatchStatus;
                roomId: string | null;
                roundName: import("../constants/tournament.constants").TournamentMatchRoundName;
                opponentUsername: string | null;
                presenceCheckAt: string | null;
                canJoin: boolean;
                needsLobby: boolean;
            } | null;
        };
    }>;
    getBracket(id: string): Promise<{
        success: boolean;
        messages: never[];
        data: {
            groups: {
                groupNumber: number;
                status: string;
                winnerUserId: string | null;
                participants: {
                    userId: string;
                    username: string;
                    seed?: number;
                    status: string;
                }[];
            }[];
            groupMatches: {
                id: string;
                groupNumber: number | null;
                phase: import("../constants/tournament.constants").TournamentPhase;
                roundName: import("../constants/tournament.constants").TournamentMatchRoundName;
                roundIndex: number;
                matchIndex: number;
                status: import("../constants/tournament.constants").TournamentMatchStatus;
                playerA: {
                    userId: string;
                    username: string;
                } | null;
                playerB: {
                    userId: string;
                    username: string;
                } | null;
                winnerUserId: string | null;
                roomId: string | null;
                isBye: boolean;
            }[];
            finalsMatches: {
                id: string;
                groupNumber: number | null;
                phase: import("../constants/tournament.constants").TournamentPhase;
                roundName: import("../constants/tournament.constants").TournamentMatchRoundName;
                roundIndex: number;
                matchIndex: number;
                status: import("../constants/tournament.constants").TournamentMatchStatus;
                playerA: {
                    userId: string;
                    username: string;
                } | null;
                playerB: {
                    userId: string;
                    username: string;
                } | null;
                winnerUserId: string | null;
                roomId: string | null;
                isBye: boolean;
            }[];
        };
    }>;
    register(id: string, user: JwtPayload, idempotencyKey: string): Promise<{
        success: boolean;
        messages: never[];
        data: {
            registered: boolean;
            participantId: string;
            alreadyRegistered: boolean;
            seed?: undefined;
            groupNumber?: undefined;
            registeredCount?: undefined;
            status?: undefined;
        } | {
            registered: boolean;
            participantId: string;
            seed: number;
            groupNumber: number;
            registeredCount: number;
            status: import("../constants/tournament.constants").TournamentStatus.OPEN | import("../constants/tournament.constants").TournamentStatus.FULL | import("../constants/tournament.constants").TournamentStatus.COUNTDOWN;
            alreadyRegistered?: undefined;
        };
    }>;
    unregister(id: string, user: JwtPayload, idempotencyKey: string): Promise<{
        success: boolean;
        messages: never[];
        data: {
            unregistered: boolean;
            registeredCount: number;
            status: import("../constants/tournament.constants").TournamentStatus.OPEN;
        };
    }>;
}
