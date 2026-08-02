import { Module } from '@nestjs/common';
import { FmcsaController } from './fmcsa.controller';
import { FmcsaService } from './fmcsa.service';

@Module({
  controllers: [FmcsaController],
  providers: [FmcsaService],
  exports: [FmcsaService],
})
export class FmcsaModule {}
