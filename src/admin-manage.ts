import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MongooseModule } from '@nestjs/mongoose';
import configuration from './common/config/configuration';
import { RedisModule } from './common/redis/redis.module';
import { AdminAuthModule } from './modules/admin-auth/admin-auth.module';
import { AdminRepository } from './modules/admin-auth/admin.repository';
import { AdminAuthService } from './modules/admin-auth/admin-auth.service';
import { AdminStatus } from './modules/admin-auth/schemas/admin.schema';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], envFilePath: '.env' }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ uri: config.get<string>('mongoUri') }),
    }),
    RedisModule,
    AdminAuthModule,
  ],
})
class AdminManageModule {}

function option(name: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function assertEmail(email: string): void {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid --email is required');
  }
}

async function main(): Promise<void> {
  const command = process.argv[2];
  const app = await NestFactory.createApplicationContext(AdminManageModule, { logger: false });
  try {
    const admins = app.get(AdminRepository);
    const auth = app.get(AdminAuthService);

    if (command === 'list') {
      const rows = await admins.list();
      console.table(rows.map((admin) => ({
        email: admin.email,
        display_name: admin.display_name,
        status: admin.status,
        google_linked: Boolean(admin.google_subject),
        last_login_at: admin.last_login_at?.toISOString() || '',
      })));
      return;
    }

    const email = option('email').toLowerCase();
    assertEmail(email);
    if (command === 'create') {
      const displayName = option('name');
      if (displayName.length < 2) throw new Error('--name must contain at least 2 characters');
      const admin = await admins.provision(email, displayName);
      console.log(`Admin ready: ${admin.email} (${admin.status})`);
      return;
    }

    if (command === 'enable' || command === 'disable') {
      const status = command === 'enable' ? AdminStatus.ACTIVE : AdminStatus.DISABLED;
      const admin = await admins.setStatus(email, status);
      if (!admin) throw new Error(`Admin not found: ${email}`);
      if (status === AdminStatus.DISABLED) {
        await auth.revokeAdminSessions(String(admin._id));
      }
      console.log(`Admin ${admin.email}: ${admin.status}`);
      return;
    }

    throw new Error(
      'Usage: admin:manage -- create --email <email> --name <name> | list | enable --email <email> | disable --email <email>',
    );
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
