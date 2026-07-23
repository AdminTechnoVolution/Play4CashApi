import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RoomService } from './room.service';
import { IdempotencyService } from '../../common/idempotency/idempotency.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';
import { BattleshipPlacementDto } from './dtos/battleship-placement.dto';

class CreateRoomDto {
  @ApiProperty() @IsString() game_id: string;
  @ApiProperty() @IsNumber() @Min(1) bet_amount: number;
  @ApiProperty() @IsBoolean() public: boolean;
  @ApiProperty({ required: false }) @IsOptional() @IsString() name?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsNumber() player_limit?: number;
}

class SetReadyDto {
  @ApiProperty() @IsBoolean() ready: boolean;
}

@ApiTags('Rooms')
@ApiBearerAuth()
@Controller('rooms')
export class RoomController {
  constructor(
    private readonly roomService: RoomService,
    private readonly idempotency: IdempotencyService,
  ) {}

  /**
   * Phase C: only honor well-formed UUID idempotency keys to keep the cache
   * cardinality bounded and prevent abuse (e.g. a client sending the literal
   * string "retry" and reusing the same cached response indefinitely).
   */
  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // GET /api/rooms/stats — public live stats (no auth needed)
  @Public()
  @Get('stats')
  @ApiOperation({ summary: 'Get live stats: online players, active games, sum of per-room stake (bet_amount), not × players' })
  getLiveStats() {
    return this.roomService.getLiveStats();
  }

  // Phase C: returns the user's currently active room (waiting or started), if any.
  // The PWA calls this on login/home so it can deep-link a player back into the
  // match they left without making them search the lobby.
  @Get('active')
  @ApiOperation({ summary: 'Get the current user\'s active room (waiting or started), if any' })
  getActiveRoom(
    @CurrentUser() user: JwtPayload,
    @Headers('accept-language') lang: string,
  ) {
    return this.roomService.getActiveRoomForUser(user.id, lang || 'en');
  }

  // GET /api/rooms/game/:game_id  — matches legacy router.get('/game/:game_id', ...)
  @Get('game/:game_id')
  @ApiOperation({ summary: 'Get all waiting/started rooms for a game' })
  @ApiParam({ name: 'game_id' })
  getRooms(
    @Param('game_id') gameId: string,
    @Headers('accept-language') lang: string,
  ) {
    return this.roomService.getRooms(gameId, lang || 'en');
  }

  // GET /api/rooms/:id  — NOTE: same param as above, kept for getRoom by ID
  // In the original Express router order, /:id/status comes AFTER /:game_id
  // NestJS resolves static segments first, so /:id/status is unambiguous

  @Get(':id/status')
  @ApiOperation({ summary: 'Get room status (lightweight poll endpoint)' })
  getRoomStatus(@Param('id') id: string) {
    return this.roomService.getRoomStatus(id);
  }

  @Get(':id/state')
  @ApiOperation({ summary: 'Get authoritative room state for the authenticated user' })
  getRoomState(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    return this.roomService.getRoomState(id, user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new room (supports Idempotency-Key for safe retries)' })
  async createRoom(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRoomDto,
    @Headers('accept-language') lang: string,
    @Headers('idempotency-key') idempKey?: string,
  ) {
    // Phase C: if the PWA sends a valid UUID Idempotency-Key, cache the response
    // so a transparent retry (slow network, timeout, app backgrounded) does NOT
    // create a second room and a second balance deduction. Falls through to the
    // direct call when the header is absent or malformed.
    if (idempKey && RoomController.UUID_RE.test(idempKey)) {
      const cacheKey = `idem:rooms:create:${user.id}:${idempKey}`;
      return this.idempotency.getOrSet(cacheKey, IdempotencyService.DEFAULT_TTL_SEC, () =>
        this.roomService.createRoom(user.id, dto.game_id, dto.bet_amount, dto.public, dto.name, dto.player_limit, lang || 'en'),
      );
    }
    return this.roomService.createRoom(user.id, dto.game_id, dto.bet_amount, dto.public, dto.name, dto.player_limit, lang || 'en');
  }

  @Post(':id/join')
  @ApiOperation({ summary: 'Join an existing room' })
  joinRoom(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('accept-language') lang: string,
  ) {
    return this.roomService.joinRoom(user.id, id, lang || 'en');
  }

  @Post(':id/spectate')
  @ApiOperation({ summary: 'Join a started room as a spectator' })
  spectateRoom(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('accept-language') lang: string,
  ) {
    return this.roomService.spectateRoom(user.id, id, lang || 'en');
  }

  @Post(':id/leave')
  @ApiOperation({ summary: 'Leave a room (waiting=remove, started=forfeit)' })
  leaveRoom(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Headers('accept-language') lang: string,
  ) {
    return this.roomService.leaveRoom(user.id, id, lang || 'en');
  }

  // PATCH /api/rooms/:id/ready  — original uses PATCH, not PUT
  @Patch(':id/ready')
  @ApiOperation({ summary: 'Set player ready status' })
  setReady(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SetReadyDto,
    @Headers('accept-language') lang: string,
  ) {
    return this.roomService.setReady(user.id, id, dto.ready, lang || 'en');
  }

  // DELETE /api/rooms/:id  — admin only
  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: delete a room' })
  async deleteRoom(@Param('id') id: string) {
    await this.roomService.deleteRoom(id);
    return { success: true, messages: ['SUCCESS_DELETE'], data: null };
  }

  @Post(':id/battleship/placement')
  @ApiOperation({ summary: 'Battleship: Submit ship placement' })
  async savePlacement(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: BattleshipPlacementDto,
    @Headers('accept-language') lang: string,
  ) {
    return this.roomService.saveBattleshipPlacement(user.id, id, dto.ships, lang || 'en');
  }
}
