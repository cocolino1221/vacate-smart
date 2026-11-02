import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { BOOKING_PROVIDERS } from '../common/types';
import { HotelsModule } from '../products/hotels/hotels.module';
import { HotelsBookingProvider } from '../products/hotels/hotels.booking';
import { FlightsBookingProvider, FlightsModule } from '../products/flights/flights.module';
import { TransfersBookingProvider, TransfersModule } from '../products/transfers/transfers.module';
import { RailBookingProvider, RailModule } from '../products/rail/rail.module';

@Module({
  imports: [HotelsModule, FlightsModule, TransfersModule, RailModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    {
      provide: BOOKING_PROVIDERS,
      useFactory: (...p) => p,
      inject: [HotelsBookingProvider, FlightsBookingProvider, TransfersBookingProvider, RailBookingProvider],
    },
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
