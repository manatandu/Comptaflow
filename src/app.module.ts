import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './common/prisma.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { LicenceModule } from './modules/licence/licence.module';
import { AuthModule } from './modules/auth/auth.module';
import { ComptabiliteModule } from './modules/comptabilite/comptabilite.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    TenantModule,
    LicenceModule,
    AuthModule,
    ComptabiliteModule,
  ],
})
export class AppModule {}
