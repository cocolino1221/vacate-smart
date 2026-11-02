import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Ip, Logger, Param, Post, Query, RawBodyRequest, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { PaymentsService } from '../payments/payments.service';
import { CreateHotelOrderDto } from '../products/hotels/hotels.dto';

@Controller()
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(
    private readonly orders: OrdersService,
    private readonly payments: PaymentsService,
  ) {}

  @Post('orders/hotel')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  createHotel(@Body() dto: CreateHotelOrderDto, @Ip() ip: string) {
    return this.orders.createHotelOrder(dto, ip.replace(/^::ffff:/, ''));
  }

  @Get('orders/:id')
  get(@Param('id') id: string, @Query('token') token: string) {
    return this.orders.getForCustomer(id, token);
  }

  @Post('payments/stripe/webhook')
  @HttpCode(200)
  async stripeWebhook(@Req() req: RawBodyRequest<Request>, @Headers('stripe-signature') sig: string) {
    if (!req.rawBody || !sig) throw new BadRequestException('Lipsește semnătura');
    const event = this.payments.parseWebhook(req.rawBody, sig);
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object;
      if (session.payment_status === 'paid') {
        await this.orders.onPaid(session.id, { eventId: event.id, paymentIntent: session.payment_intent });
      }
    }
    return { received: true };
  }
}
