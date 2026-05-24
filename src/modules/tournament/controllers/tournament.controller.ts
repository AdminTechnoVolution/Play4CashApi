import {
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../../common/decorators/current-user.decorator';
import { TournamentStateService } from '../services/tournament-state.service';
import { TournamentRegistrationService } from '../services/tournament-registration.service';
import { TournamentAdminService } from '../services/tournament-admin.service';

@ApiTags('Tournaments')
@ApiBearerAuth()
@Controller('tournaments')
export class TournamentController {
  constructor(
    private readonly stateService: TournamentStateService,
    private readonly registrationService: TournamentRegistrationService,
    private readonly adminService: TournamentAdminService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List visible tournaments' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Headers('accept-language') lang: string,
  ) {
    const list = await this.stateService.listVisible();
    const data = await Promise.all(
      list.map((t) => this.stateService.toPublicDetail(t, user?.id, lang)),
    );
    return { success: true, messages: [], data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Tournament detail' })
  @ApiParam({ name: 'id' })
  async getOne(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Headers('accept-language') lang: string,
  ) {
    const t = await this.adminService.findById(id);
    const data = await this.stateService.toPublicDetail(t, user.id, lang);
    return { success: true, messages: [], data };
  }

  @Get(':id/state')
  @ApiOperation({ summary: 'Compact tournament state + official time' })
  async getState(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Headers('accept-language') lang: string,
  ) {
    const t = await this.adminService.findById(id);
    const detail = await this.stateService.toPublicDetail(t, user.id, lang);
    return { success: true, messages: [], data: detail };
  }

  @Get(':id/bracket')
  @ApiOperation({ summary: 'Bracket (5 groups + finals)' })
  async getBracket(@Param('id') id: string) {
    const data = await this.stateService.getBracket(id);
    return { success: true, messages: [], data };
  }

  @Post(':id/register')
  @ApiOperation({ summary: 'Register for tournament (Idempotency-Key required)' })
  async register(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const data = await this.registrationService.register(id, user.id, idempotencyKey);
    return { success: true, messages: [], data };
  }

  @Post(':id/unregister')
  @ApiOperation({ summary: 'Unregister before locking (Idempotency-Key required)' })
  async unregister(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Headers('idempotency-key') idempotencyKey: string,
  ) {
    const data = await this.registrationService.unregister(id, user.id, idempotencyKey);
    return { success: true, messages: [], data };
  }
}
