import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { ReverseGameBalanceDto, RunGameAuditDto } from './dtos/game-audit.dto';
import { GameAuditService } from './game-audit.service';

@ApiTags('Admin · Game Audit')
@ApiBearerAuth()
@Controller('admin/game-audits')
@AdminRoute()
@UseGuards(AdminAuthGuard)
export class GameAuditController {
  constructor(private readonly service: GameAuditService) {}

  @Post('runs')
  run(@CurrentUser() admin: JwtPayload, @Body() dto: RunGameAuditDto) {
    return this.service.run(admin.id, dto.room_id, dto.review_filter || 'all');
  }

  @Get('runs/:id')
  getRun(@Param('id') id: string) { return this.service.getRun(id); }

  @Get('runs/:id/results')
  results(
    @Param('id') id: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.listResults(id, status, Number(page), Number(limit));
  }

  @Get('rooms/:roomId')
  detail(@Param('roomId') roomId: string) { return this.service.getRoomDetail(roomId); }

  @Post('rooms/:roomId/reversals')
  reverse(
    @CurrentUser() admin: JwtPayload,
    @Param('roomId') roomId: string,
    @Body() dto: ReverseGameBalanceDto,
  ) {
    return this.service.reverse(
      roomId,
      dto.player_id,
      admin.id,
      dto.reason,
      !!dto.inconclusive_override,
      dto.code,
    );
  }
}
