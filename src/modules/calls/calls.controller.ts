import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { LogCallDto } from './dto/log-call.dto';
import { CallsService, Stats, StoredCall } from './calls.service';

@Controller('calls')
export class CallsController {
  constructor(private readonly service: CallsService) {}

  @Post('log')
  log(@Body() dto: LogCallDto): Promise<StoredCall> {
    return this.service.log(dto);
  }

  @Get()
  list(@Query('limit') limit?: string): Promise<StoredCall[]> {
    const parsed = limit ? Number.parseInt(limit, 10) : 100;
    return this.service.list(Number.isFinite(parsed) ? parsed : 100);
  }

  @Get('stats')
  stats(): Promise<Stats> {
    return this.service.stats();
  }
}
