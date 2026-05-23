import { Body, Controller, Delete, Get, Headers, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { GameService } from './game.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Param } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { CreateGameDto, UpdateGameDto } from './dtos/game-admin.dto';

@ApiTags('Games')
@ApiBearerAuth()
@Controller('games')
export class GameController {
  constructor(
    private readonly gameService: GameService,
    private readonly config: ConfigService,
  ) {}

  // GET /api/games  — player catalog (localized by Accept-Language)
  @Get()
  @ApiOperation({ summary: 'List all active games (localized)' })
  findAll(@Headers('accept-language') lang: string) {
    return this.gameService.findAll(lang || 'en');
  }

  // GET /api/games/all  — admin: full i18n for every game (must be before :id)
  @Get('all')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '[Admin] List all games with full multilingual fields' })
  async findAllAdmin() {
    const data = await this.gameService.findAllAdmin();
    return { success: true, messages: [], data };
  }

  // GET /api/games/:id  — localized for players; full i18n when caller is admin
  @Get(':id')
  @ApiOperation({ summary: 'Get game by ID (localized, or full i18n for admins)' })
  async findById(
    @Param('id') id: string,
    @Headers('accept-language') lang: string,
    @CurrentUser() user: JwtPayload,
  ) {
    if (this.isAdmin(user)) {
      const data = await this.gameService.findByIdAdmin(id);
      return { success: true, messages: [], data };
    }
    return this.gameService.findById(id, lang || 'en');
  }

  // POST /api/games  — admin only
  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '[Admin] Create a game (multilingual name, description, rules)' })
  async create(@Body() body: CreateGameDto) {
    const data = await this.gameService.create(body);
    return { success: true, messages: [], data };
  }

  // PATCH /api/games/:id  — admin only
  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '[Admin] Update a game (multilingual name, description, rules)' })
  async update(@Param('id') id: string, @Body() body: UpdateGameDto) {
    const data = await this.gameService.update(id, body);
    return { success: true, messages: [], data };
  }

  // DELETE /api/games/:id  — admin only
  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '[Admin] Delete a game' })
  async remove(@Param('id') id: string) {
    await this.gameService.remove(id);
    return { success: true, messages: ['SUCCESS_DELETE'], data: null };
  }

  private isAdmin(user: JwtPayload | undefined): boolean {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const adminEmails = (this.config.get<string[]>('admin.emails') || []).map((e) =>
      e.toLowerCase(),
    );
    const email = (user.email || '').toLowerCase();
    return !!email && adminEmails.includes(email);
  }
}
