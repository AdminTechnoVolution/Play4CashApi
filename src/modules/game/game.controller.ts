import { Body, Controller, Delete, Get, Headers, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GameService } from './game.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { Public } from '../../common/decorators/public.decorator';
import { Param } from '@nestjs/common';

@ApiTags('Games')
@ApiBearerAuth()
@Controller('games')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  // GET /api/games  — requires auth (matches original)
  @Get()
  @ApiOperation({ summary: 'List all active games' })
  findAll(@Headers('accept-language') lang: string) {
    return this.gameService.findAll(lang || 'en');
  }

  // GET /api/games/:id  — requires auth (matches original — no @Public in Express)
  @Get(':id')
  @ApiOperation({ summary: 'Get game by ID' })
  findById(@Param('id') id: string, @Headers('accept-language') lang: string) {
    return this.gameService.findById(id, lang || 'en');
  }

  // POST /api/games  — admin only
  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: create a game' })
  create(@Body() body: any) {
    return this.gameService.create(body);
  }

  // PATCH /api/games/:id  — admin only (was PUT, original uses PATCH)
  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: update a game' })
  update(@Param('id') id: string, @Body() body: any) {
    return this.gameService.update(id, body);
  }

  // DELETE /api/games/:id  — admin only (was missing)
  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: 'Admin: delete a game' })
  async remove(@Param('id') id: string) {
    await this.gameService.remove(id);
    return { success: true, messages: ['SUCCESS_DELETE'], data: null };
  }
}
