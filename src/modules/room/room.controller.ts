import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { RoomService } from './room.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AdminGuard } from '../../common/guards/admin.guard';
import { UseGuards } from '@nestjs/common';
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
  constructor(private readonly roomService: RoomService) {}

  // GET /api/rooms/stats — public live stats (no auth needed)
  @Get('stats')
  @ApiOperation({ summary: 'Get live stats: online players, active games, total bets' })
  getLiveStats() {
    return this.roomService.getLiveStats();
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

  @Post()
  @ApiOperation({ summary: 'Create a new room' })
  createRoom(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRoomDto,
    @Headers('accept-language') lang: string,
  ) {
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
