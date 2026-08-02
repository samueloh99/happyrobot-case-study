import { Module } from '@nestjs/common';
import { TmsModule } from '../tms/tms.module';
import { NegotiationController } from './negotiation.controller';
import { NegotiationService } from './negotiation.service';

@Module({
  imports: [TmsModule],
  controllers: [NegotiationController],
  providers: [NegotiationService],
  exports: [NegotiationService],
})
export class NegotiationModule {}
