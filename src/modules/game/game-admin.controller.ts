import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { GameService } from './game.service';
import { CreateGameDto, UpdateGameDto } from './dtos/game-admin.dto';

@ApiTags('Admin · Games')
@ApiBearerAuth()
@Controller('admin/games')
@UseGuards(RolesGuard)
@Roles('admin')
export class GameAdminController {
  constructor(private readonly gameService: GameService) {}

  @Get()
  @ApiOperation({ summary: 'List all games with full multilingual name, description, and rules' })
  async findAll() {
    const data = await this.gameService.findAllAdmin();
    return { success: true, messages: [], data };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one game with full multilingual fields' })
  @ApiParam({ name: 'id' })
  async findById(@Param('id') id: string) {
    const data = await this.gameService.findByIdAdmin(id);
    return { success: true, messages: [], data };
  }

  @Post()
  @ApiOperation({ summary: 'Create a game (multilingual name, description, rules)' })
  async create(@Body() body: CreateGameDto) {
    const data = await this.gameService.create(body);
    return { success: true, messages: [], data };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a game (multilingual name, description, rules)' })
  @ApiParam({ name: 'id' })
  async update(@Param('id') id: string, @Body() body: UpdateGameDto) {
    const data = await this.gameService.update(id, body);
    return { success: true, messages: [], data };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a game' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string) {
    await this.gameService.remove(id);
    return { success: true, messages: ['SUCCESS_DELETE'], data: null };
  }
}
