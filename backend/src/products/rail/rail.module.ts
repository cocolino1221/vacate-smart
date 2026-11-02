import { Controller, Get, Injectable, Module, NotImplementedException } from '@nestjs/common';
import { OrderItem, ProductType } from '@prisma/client';
import { RateHawkClient } from '../../ratehawk/ratehawk.client';
import { BookingProvider, BookingResult } from '../../common/types';

/**
 * Trenuri prin RateHawk – SCHELET.
 * TODO: completați endpoint-urile după documentația API Trenuri primită de la account managerul RateHawk.
 * Structura urmează același flux ca la hoteluri: search -> (prebook/verificare) -> plată -> finish -> status.
 */
@Injectable()
export class RailBookingProvider implements BookingProvider {
  readonly product = ProductType.RAIL;
  constructor(private readonly rh: RateHawkClient) {}

  async finish(_item: OrderItem): Promise<BookingResult> {
    throw new NotImplementedException('Trenuri: integrarea RateHawk nu este încă implementată');
  }
  async checkStatus(_item: OrderItem): Promise<BookingResult> {
    throw new NotImplementedException('Trenuri: integrarea RateHawk nu este încă implementată');
  }
  async cancel(_item: OrderItem): Promise<void> {
    throw new NotImplementedException('Trenuri: integrarea RateHawk nu este încă implementată');
  }
}

@Controller('rail')
export class RailController {
  @Get('status')
  status() {
    return { product: ProductType.RAIL, available: false, message: 'Trenuri – în curând' };
  }
}

@Module({
  controllers: [RailController],
  providers: [RailBookingProvider],
  exports: [RailBookingProvider],
})
export class RailModule {}
