import { Controller, Get, Injectable, Module, NotImplementedException } from '@nestjs/common';
import { OrderItem, ProductType } from '@prisma/client';
import { RateHawkClient } from '../../ratehawk/ratehawk.client';
import { BookingProvider, BookingResult } from '../../common/types';

/**
 * Zboruri prin RateHawk – SCHELET.
 * TODO: completați endpoint-urile după documentația API Zboruri primită de la account managerul RateHawk.
 * Structura urmează același flux ca la hoteluri: search -> (prebook/verificare) -> plată -> finish -> status.
 */
@Injectable()
export class FlightsBookingProvider implements BookingProvider {
  readonly product = ProductType.FLIGHT;
  constructor(private readonly rh: RateHawkClient) {}

  async finish(_item: OrderItem): Promise<BookingResult> {
    throw new NotImplementedException('Zboruri: integrarea RateHawk nu este încă implementată');
  }
  async checkStatus(_item: OrderItem): Promise<BookingResult> {
    throw new NotImplementedException('Zboruri: integrarea RateHawk nu este încă implementată');
  }
  async cancel(_item: OrderItem): Promise<void> {
    throw new NotImplementedException('Zboruri: integrarea RateHawk nu este încă implementată');
  }
}

@Controller('flights')
export class FlightsController {
  @Get('status')
  status() {
    return { product: ProductType.FLIGHT, available: false, message: 'Zboruri – în curând' };
  }
}

@Module({
  controllers: [FlightsController],
  providers: [FlightsBookingProvider],
  exports: [FlightsBookingProvider],
})
export class FlightsModule {}
