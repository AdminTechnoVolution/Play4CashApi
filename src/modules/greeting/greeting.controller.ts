import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { GreetingService } from './greeting.service';
import { AdminGuard } from '../../common/guards/admin.guard';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional } from 'class-validator';

class CreateGreetingDto {
  @ApiProperty({
    example: { es: '¡Hola!', en: 'Hello!', fr: 'Bonjour!', de: 'Hallo!', it: 'Ciao!', pt: 'Olá!' },
  })
  @IsObject()
  text: Record<string, string>;
}

class UpdateGreetingDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  text?: Record<string, string>;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

@ApiTags('Greetings')
@ApiBearerAuth()
@Controller('greetings')
export class GreetingController {
  constructor(private readonly greetingService: GreetingService) {}

  // GET /api/greetings — returns 5 random greetings in the user's language
  @Get()
  @ApiOperation({ summary: 'Get 5 random greetings (localized)' })
  getRandom(@Headers('accept-language') lang: string) {
    return this.greetingService.getRandom(lang || 'en');
  }

  // GET /api/greetings/all — admin: get all greetings
  @Get('all')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '[Admin] Get all greetings' })
  getAll() {
    return this.greetingService.getAll();
  }

  // POST /api/greetings — admin: create a greeting
  @Post()
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '[Admin] Create a greeting' })
  create(@Body() dto: CreateGreetingDto) {
    return this.greetingService.create(dto);
  }

  // PATCH /api/greetings/:id — admin: update a greeting
  @Patch(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '[Admin] Update a greeting' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() dto: UpdateGreetingDto) {
    return this.greetingService.update(id, dto);
  }

  // DELETE /api/greetings/:id — admin: delete a greeting
  @Delete(':id')
  @UseGuards(AdminGuard)
  @ApiOperation({ summary: '[Admin] Delete a greeting' })
  @ApiParam({ name: 'id' })
  delete(@Param('id') id: string) {
    return this.greetingService.delete(id);
  }
}
