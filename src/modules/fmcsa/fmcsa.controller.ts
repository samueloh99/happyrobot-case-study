import { Body, Controller, Post } from '@nestjs/common';
import { VerifyCarrierDto } from './dto/verify-carrier.dto';
import { FmcsaService, VerifyResult } from './fmcsa.service';

@Controller('carriers')
export class FmcsaController {
  constructor(private readonly fmcsa: FmcsaService) {}

  @Post('verify')
  verify(@Body() dto: VerifyCarrierDto): Promise<VerifyResult> {
    return this.fmcsa.verify(dto.mc_num);
  }
}
