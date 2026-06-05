import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ContactUsService } from './contact-us.service';
import { SubmitContactDto } from './dtos/submit-contact.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { JwtPayload } from '../../common/decorators/current-user.decorator';
import { I18nService } from '../../common/i18n/i18n.service';

@ApiTags('Contact Us')
@ApiBearerAuth()
@Controller('contact-us')
export class ContactUsController {
  constructor(
    private readonly contactUsService: ContactUsService,
    private readonly i18n: I18nService,
  ) {}

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a contact message (comment, suggestion, or error report)' })
  async submit(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SubmitContactDto,
    @Headers('accept-language') lang: string,
  ) {
    const result = await this.contactUsService.submit(user, dto, lang || 'en');
    const message = this.i18n.translate('SUCCESS_CONTACT_SUBMITTED', lang);
    return { ...result, messages: [message] };
  }
}
