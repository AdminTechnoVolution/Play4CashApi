import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { GreetingService } from './greeting.service';

@Controller('admin/greetings')
@AdminRoute()
@UseGuards(AdminAuthGuard)
export class GreetingAdminController {
  constructor(private readonly greetings: GreetingService) {}

  @Get()
  getAll() {
    return this.greetings.getAll();
  }

  @Post()
  create(@Body() body: { text: Record<string, string> }) {
    return this.greetings.create(body);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: { text?: Record<string, string>; active?: boolean },
  ) {
    return this.greetings.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.greetings.delete(id);
  }
}
