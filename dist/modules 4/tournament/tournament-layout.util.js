"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TOURNAMENT_MAX_PLAYERS = exports.TOURNAMENT_MIN_PLAYERS = exports.TOURNAMENT_GROUP_SIZE = void 0;
exports.isPowerOfTwo = isPowerOfTwo;
exports.assertPowerOfTwoPlayerCount = assertPowerOfTwoPlayerCount;
exports.resolveTournamentLayout = resolveTournamentLayout;
const common_1 = require("@nestjs/common");
const tournament_constants_1 = require("./constants/tournament.constants");
Object.defineProperty(exports, "TOURNAMENT_GROUP_SIZE", { enumerable: true, get: function () { return tournament_constants_1.TOURNAMENT_GROUP_SIZE; } });
Object.defineProperty(exports, "TOURNAMENT_MAX_PLAYERS", { enumerable: true, get: function () { return tournament_constants_1.TOURNAMENT_MAX_PLAYERS; } });
Object.defineProperty(exports, "TOURNAMENT_MIN_PLAYERS", { enumerable: true, get: function () { return tournament_constants_1.TOURNAMENT_MIN_PLAYERS; } });
function isPowerOfTwo(value) {
    return Number.isInteger(value) && value >= 2 && (value & (value - 1)) === 0;
}
function assertPowerOfTwoPlayerCount(value, field) {
    if (!isPowerOfTwo(value)) {
        throw new common_1.BadRequestException(`${field} must be a power of 2 (e.g. 2, 4, 8, 16, 32…) for bracket sizing`);
    }
}
function resolveTournamentLayout(maxPlayers, minPlayers, groupSize, groupCount) {
    if (maxPlayers < tournament_constants_1.TOURNAMENT_MIN_PLAYERS || maxPlayers > tournament_constants_1.TOURNAMENT_MAX_PLAYERS) {
        throw new common_1.BadRequestException(`maxPlayers must be between ${tournament_constants_1.TOURNAMENT_MIN_PLAYERS} and ${tournament_constants_1.TOURNAMENT_MAX_PLAYERS}`);
    }
    assertPowerOfTwoPlayerCount(maxPlayers, 'maxPlayers');
    assertPowerOfTwoPlayerCount(minPlayers, 'minPlayers');
    if (minPlayers < tournament_constants_1.TOURNAMENT_MIN_PLAYERS) {
        throw new common_1.BadRequestException(`minPlayers must be at least ${tournament_constants_1.TOURNAMENT_MIN_PLAYERS}`);
    }
    if (minPlayers > maxPlayers) {
        throw new common_1.BadRequestException('minPlayers cannot exceed maxPlayers');
    }
    const size = groupSize ?? tournament_constants_1.TOURNAMENT_GROUP_SIZE;
    if (size !== tournament_constants_1.TOURNAMENT_GROUP_SIZE) {
        throw new common_1.BadRequestException(`groupSize must be ${tournament_constants_1.TOURNAMENT_GROUP_SIZE}`);
    }
    const derivedGroupCount = maxPlayers / tournament_constants_1.TOURNAMENT_GROUP_SIZE;
    const count = groupCount ?? derivedGroupCount;
    if (count !== derivedGroupCount) {
        throw new common_1.BadRequestException(`groupCount must be maxPlayers / ${tournament_constants_1.TOURNAMENT_GROUP_SIZE} (${derivedGroupCount} for ${maxPlayers} players)`);
    }
    if (count * size !== maxPlayers) {
        throw new common_1.BadRequestException('groupCount × groupSize must equal maxPlayers');
    }
    return { maxPlayers, minPlayers, groupSize: size, groupCount: count };
}
//# sourceMappingURL=tournament-layout.util.js.map