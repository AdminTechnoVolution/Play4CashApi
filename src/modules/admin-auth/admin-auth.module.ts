import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthGuard } from './admin-auth.guard';
import { AdminAuthService } from './admin-auth.service';
import { AdminRepository } from './admin.repository';
import { Admin, AdminSchema } from './schemas/admin.schema';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([{ name: Admin.name, schema: AdminSchema }]),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminAuthGuard, AdminRepository],
  exports: [AdminAuthService, AdminAuthGuard, AdminRepository, MongooseModule],
})
export class AdminAuthModule {}
