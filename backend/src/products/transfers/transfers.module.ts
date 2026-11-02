import { Controller, Get, Injectable, Module, NotImplementedException } from '@nestjs/common';
import { OrderItem, ProductType } from '@prisma/client';
import { RateHawkClient } from '../../ratehawk/ratehawk.client';
import { BookingProvider, BookingResult } from '../../common/types';

/**
 * Transferuri prin RateHawk – SCHELET.
 * TODO: completați endpoint-urile după documentația API Transferuri primită de la account managerul RateHawk.
 * Structura urmează același flux ca la hoteluri: search -> (prebook/verificare) -> plată -> finish -> status.
 */
@Injectable()
export class TransfersBookingProvider implements BookingProvider {
  readonly product = ProductType.TRANSFER;
  constructor(private readonly rh: RateHawkClient) {}

  async finish(_item: OrderItem): Promise<BookingResult> {
    throw new NotImplementedException('Transferuri: integrarea RateHawk nu este încă implementată');
  }
  async checkStatus(_item: OrderItem): Promise<BookingResult> {
    throw new NotImplementedException('Transferuri: integrarea RateHawk nu este încă implementată');
  }
  async cancel(_item: OrderItem): Promise<void> {
    throw new NotImplementedException('Transferuri: integrarea RateHawk nu este încă implementată');
  }
}

@Controller('transfers')
export class TransfersController {
  @Get('status')
  status() {
    return { product: ProductType.TRANSFER, available: false, message: 'Transferuri – în curând' };
  }
}

@Module({
  controllers: [TransfersController],
  providers: [TransfersBookingProvider],
  exports: [TransfersBookingProvider],
})
export class TransfersModule {}
