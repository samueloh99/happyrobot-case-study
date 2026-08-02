import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { BearerAuthGuard } from './common/auth.guard';
import { loadEnv } from './config/env';
import { TmsModule } from './modules/tms/tms.module';
import { FmcsaModule } from './modules/fmcsa/fmcsa.module';
import { OtpModule } from './modules/otp/otp.module';
import { NegotiationModule } from './modules/negotiation/negotiation.module';
import { CallsModule } from './modules/calls/calls.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: () => loadEnv(),
    }),
    TmsModule,
    FmcsaModule,
    OtpModule,
    NegotiationModule,
    CallsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: BearerAuthGuard }],
})
export class AppModule {}
