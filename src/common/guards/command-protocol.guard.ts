import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';
/** Reject entry/ready operations before funds are charged if the client cannot recover commands. */
@Injectable()
export class CommandProtocolGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.FINANCE_V2_ENABLED === 'true'
      && context.switchToHttp().getRequest().headers['x-p4c-command-protocol'] !== '1') {
      throw new HttpException('RELIABLE_COMMANDS_UPGRADE_REQUIRED', 426);
    }
    return true;
  }
}
