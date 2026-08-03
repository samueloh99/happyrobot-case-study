import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { EnqueueHandoffDto } from './dto/enqueue-handoff.dto';
import { EnqueueResult, HandoffsService } from './handoffs.service';

@Controller('handoffs')
export class HandoffsController {
  constructor(private readonly service: HandoffsService) {}

  @Post('enqueue')
  @HttpCode(202)
  enqueue(@Body() dto: EnqueueHandoffDto): EnqueueResult {
    return this.service.enqueue(dto);
  }
}
