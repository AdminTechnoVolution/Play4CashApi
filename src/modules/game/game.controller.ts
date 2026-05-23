import { Controller, Get, Headers, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { GameService } from './game.service';

@ApiTags('Games')
@ApiBearerAuth()
@Controller('games')
export class GameController {
  constructor(private readonly gameService: GameService) {}

  // GET /api/games — player catalog (localized by Accept-Language)
  @Get()
  @ApiOperation({ summary: 'List all active games (localized)' })
  findAll(@Headers('accept-language') lang: string) {
    return this.gameService.findAll(lang || 'en');
  }

  // GET /api/games/:id — always localized for players
  @Get(':id')
  @ApiOperation({ summary: 'Get game by ID (localized)' })
  findById(@Param('id') id: string, @Headers('accept-language') lang: string) {
    return this.gameService.findById(id, lang || 'en');
  }
}
