import { Global, Module } from '@nestjs/common';
import { PaymentsAdminController } from './payments-admin.controller';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { EmailModule } from '../../common/email/email.module';
import { LedgerService } from './ledger.service';
import { PaymentsService } from './payments.service';
import { PaymentsPolicy } from './payments-policy.service';
import { NowPaymentsClient } from './nowpayments.client';
import { PaymentsController } from './payments.controller';
@Global()
@Module({ imports: [EmailModule, AdminAuthModule], controllers: [PaymentsController, PaymentsAdminController],
  providers: [LedgerService, PaymentsService, PaymentsPolicy, NowPaymentsClient],
  exports: [LedgerService], })
export class PaymentsModule {}
