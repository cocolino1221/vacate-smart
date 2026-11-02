import { Body, Controller, Get, Param, ParseIntPipe, Post, Query } from '@nestjs/common';
import { toHttpError } from '../../ratehawk/ratehawk.client';
import { HotelsService } from './hotels.service';
import { HotelSearchDto, StayDto } from './hotels.dto';

@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotels: HotelsService) {}

  private async wrap<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      throw toHttpError(e);
    }
  }

  @Get('suggest')
  suggest(@Query('q') q: string, @Query('lang') lang?: string) {
    if (!q || q.trim().length < 2) return { regions: [], hotels: [] };
    return this.wrap(() => this.hotels.suggest(q.trim().slice(0, 80), lang));
  }

  @Post('search')
  search(@Body() dto: HotelSearchDto) {
    return this.wrap(() => this.hotels.search(dto));
  }

  @Get(':hid')
  details(@Param('hid', ParseIntPipe) hid: number, @Query('lang') lang?: string) {
    return this.wrap(() => this.hotels.hotelDetails(hid, lang));
  }

  @Post(':hid/rates')
  rates(@Param('hid', ParseIntPipe) hid: number, @Body() dto: StayDto) {
    return this.wrap(() => this.hotels.rates(hid, dto));
  }
}
