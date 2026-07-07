import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ContactUsService } from './contact-us.service';
import { UpdateContactDto } from './dtos/update-contact.dto';
import { ContactMessageStatus } from './schemas/contact-message.schema';

@ApiTags('Admin · Contact Us')
@ApiBearerAuth()
@Controller('admin/contact-us')
@UseGuards(RolesGuard)
@Roles('admin')
export class ContactUsAdminController {
  constructor(private readonly contactUsService: ContactUsService) {}

  @Get()
  @ApiOperation({ summary: 'List contact messages (optional status filter)' })
  @ApiQuery({ name: 'status', required: false, enum: ContactMessageStatus })
  list(@Query('status') status?: ContactMessageStatus) {
    return this.contactUsService.list(status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contact message detail' })
  @ApiParam({ name: 'id' })
  getById(@Param('id') id: string) {
    return this.contactUsService.getById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update contact message status or admin notes' })
  @ApiParam({ name: 'id' })
  update(@Param('id') id: string, @Body() dto: UpdateContactDto) {
    return this.contactUsService.update(id, dto);
  }
}
