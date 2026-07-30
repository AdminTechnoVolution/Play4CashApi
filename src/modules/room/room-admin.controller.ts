import { Controller, Delete, Param, UseGuards } from '@nestjs/common';
import { AdminRoute } from '../../common/decorators/admin-route.decorator';
import { AdminAuthGuard } from '../admin-auth/admin-auth.guard';
import { RoomService } from './room.service';

@Controller('admin/rooms')
@AdminRoute()
@UseGuards(AdminAuthGuard)
export class RoomAdminController {
  constructor(private readonly rooms: RoomService) {}

  @Delete(':id')
  async deleteRoom(@Param('id') id: string) {
    await this.rooms.deleteRoom(id);
    return { success: true, messages: ['SUCCESS_DELETE'], data: null };
  }
}
