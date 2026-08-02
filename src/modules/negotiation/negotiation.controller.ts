import { Body, Controller, Post } from '@nestjs/common';
import { EvaluateOfferDto } from './dto/evaluate-offer.dto';
import { EvaluateResult, NegotiationService } from './negotiation.service';

@Controller('negotiate')
export class NegotiationController {
  constructor(private readonly service: NegotiationService) {}

  @Post('evaluate')
  evaluate(@Body() dto: EvaluateOfferDto): Promise<EvaluateResult> {
    return this.service.evaluate({
      call_id: dto.call_id,
      load_id: dto.load_id,
      mc_num: dto.mc_num,
      offer: dto.offer,
    });
  }

  @Post('reset')
  reset(@Body() dto: { call_id: string }): { reset: true } {
    this.service.reset(dto.call_id);
    return { reset: true };
  }
}
