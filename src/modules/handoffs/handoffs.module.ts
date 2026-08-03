import { Module } from '@nestjs/common';
import { HandoffsController } from './handoffs.controller';
import { HandoffsService } from './handoffs.service';

@Module({
  controllers: [HandoffsController],
  providers: [HandoffsService],
})
export class HandoffsModule {}
