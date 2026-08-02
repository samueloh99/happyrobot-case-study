import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { SearchLoadsDto } from './dto/search-loads.dto';
import { BookLoadDto } from './dto/book-load.dto';
import { BookingResult, Load, TmsService } from './tms.service';

@Controller('loads')
export class TmsController {
  constructor(private readonly tms: TmsService) {}

  @Post('search')
  async search(@Body() dto: SearchLoadsDto): Promise<{ data: Load[]; total: number }> {
    const fields: Record<string, string | number> = {};
    if (dto.origin_city) fields.ORIG_CITY = dto.origin_city;
    if (dto.origin_state) fields.ORIG_STATE = dto.origin_state;
    if (dto.origin_zip) fields.ORIG_ZIP = dto.origin_zip;
    if (dto.destination_city) fields.DEST_CITY = dto.destination_city;
    if (dto.destination_state) fields.DEST_STATE = dto.destination_state;
    if (dto.destination_zip) fields.DEST_ZIP = dto.destination_zip;
    if (dto.equipment_type) fields.EQTYPE = dto.equipment_type;
    if (dto.max_results) fields.MAX_RESULTS = dto.max_results;

    const loads = await this.tms.search(fields);
    return { data: loads, total: loads.length };
  }

  @Get(':loadId')
  async detail(@Param('loadId') loadId: string): Promise<Load> {
    return this.tms.get(loadId);
  }

  @Post('book')
  async book(@Body() dto: BookLoadDto): Promise<BookingResult> {
    return this.tms.book(dto.load_id, dto.mc_num, dto.agreed_rate);
  }
}
