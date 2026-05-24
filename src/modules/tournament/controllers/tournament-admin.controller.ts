import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { TournamentAdminService } from '../services/tournament-admin.service';
import { TournamentStateService } from '../services/tournament-state.service';
import { CreateTournamentDto, UpdateTournamentDto } from '../dtos/tournament.dto';
import { TournamentLedgerService } from '../services/tournament-ledger.service';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TournamentParticipant,
  TournamentParticipantDocument,
} from '../schemas/tournament-participant.schema';

@ApiTags('Admin · Tournaments')
@ApiBearerAuth()
@Controller('admin/tournaments')
@UseGuards(RolesGuard)
@Roles('admin')
export class TournamentAdminController {
  constructor(
    private readonly adminService: TournamentAdminService,
    private readonly stateService: TournamentStateService,
    private readonly ledger: TournamentLedgerService,
    @InjectModel(TournamentParticipant.name)
    private readonly participantModel: Model<TournamentParticipantDocument>,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all tournaments' })
  async findAll() {
    const list = await this.adminService.findAll();
    const data = await Promise.all(list.map((t) => this.stateService.toPublicDetail(t)));
    return { success: true, messages: [], data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get tournament detail (admin)' })
  @ApiParam({ name: 'id' })
  async findOne(@Param('id') id: string) {
    const t = await this.adminService.findById(id);
    const data = await this.stateService.toPublicDetail(t);
    return { success: true, messages: [], data };
  }

  @Post()
  @ApiOperation({ summary: 'Create tournament (draft)' })
  async create(@Body() body: CreateTournamentDto) {
    const t = await this.adminService.create(body);
    const data = await this.stateService.toPublicDetail(t);
    return { success: true, messages: [], data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update draft tournament' })
  async update(@Param('id') id: string, @Body() body: UpdateTournamentDto) {
    const t = await this.adminService.update(id, body);
    const data = await this.stateService.toPublicDetail(t);
    return { success: true, messages: [], data };
  }

  @Post(':id/open')
  @ApiOperation({ summary: 'Open tournament for registration' })
  async open(@Param('id') id: string) {
    const t = await this.adminService.open(id);
    const data = await this.stateService.toPublicDetail(t);
    return { success: true, messages: [], data };
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel tournament and refund registrations' })
  async cancel(@Param('id') id: string) {
    const t = await this.adminService.cancel(id);
    const parts = await this.participantModel.find({ tournament_id: t._id });
    await this.ledger.refundAllRegistered(
      t._id as any,
      parts.map((p) => ({ user_id: p.user_id as any, amount: t.buy_in })),
    );
    const data = await this.stateService.toPublicDetail(t);
    return { success: true, messages: [], data };
  }

  @Post(':id/start')
  @ApiOperation({ summary: 'Force start tournament (admin override)' })
  async forceStart(@Param('id') id: string) {
    const t = await this.adminService.findById(id);
    t.starts_at = new Date();
    await t.save();
    const data = await this.stateService.toPublicDetail(t);
    return { success: true, messages: [], data };
  }
}
