import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppConfigController } from './app-config.controller';
import { AppConfigService } from './app-config.service';
import { AppConfig, AppConfigSchema } from './schemas/app-config.schema';
import { AppConfigAdminController } from './app-config-admin.controller';

@Module({
  imports: [MongooseModule.forFeature([{ name: AppConfig.name, schema: AppConfigSchema }])],
  controllers: [AppConfigController, AppConfigAdminController],
  providers: [AppConfigService],
  exports: [AppConfigService],
})
export class AppConfigModule {}
