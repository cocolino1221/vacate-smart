import { Module } from '@nestjs/common';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { HotelsBookingProvider } from './hotels.booking';

@Module({
  controllers: [HotelsController],
  providers: [HotelsService, HotelsBookingProvider],
  exports: [HotelsService, HotelsBookingProvider],
})
export class HotelsModule {}
