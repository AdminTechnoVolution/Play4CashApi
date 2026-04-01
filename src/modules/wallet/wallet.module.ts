import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WalletEntry, WalletSchema } from './schemas/wallet.schema';

@Module({
  imports: [MongooseModule.forFeature([{ name: WalletEntry.name, schema: WalletSchema }])],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
