import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';
@Injectable()
export class PaymentGeoInterceptor implements NestInterceptor {
  constructor(@InjectConnection() private readonly db: Connection) {}
  async intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() === 'http' && process.env.FINANCE_V2_ENABLED === 'true') {
      const request = context.switchToHttp().getRequest();
      // The internal middleware only assigns this property for a trusted gateway.
      if (request.user?.id && /^[A-Z]{2}$/.test(request.gatewayGeoCountry ?? '')) {
        await this.db.collection('finance_eligibility').updateOne({ userId: request.user.id },
          { $set: { observedCountry: request.gatewayGeoCountry, observedAt: new Date() } });
      }
    }
    return next.handle();
  }
}
