import { Controller, Get, Headers } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { GreetingService } from './greeting.service';

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
}
