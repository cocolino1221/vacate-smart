import { Injectable, Logger } from '@nestjs/common';
import { Order, OrderItem, ProductType } from '@prisma/client';
import { RateHawkClient } from '../../ratehawk/ratehawk.client';
import { BookingProvider, BookingResult } from '../../common/types';
import { RhPaymentType } from './ratehawk-hotels.types';

interface HotelItemDetails {
  supplierPayment: Pick<RhPaymentType, 'type' | 'amount' | 'currency_code'>;
  rooms: { guests: { firstName: string; lastName: string; isChild?: boolean; age?: number }[] }[];
}

/** Erori de status pentru care RateHawk recomandă să continuăm interogarea. */
const RETRYABLE = new Set(['processing', 'timeout', 'unknown']);

@Injectable()
export class HotelsBookingProvider implements BookingProvider {
  readonly product = ProductType.HOTEL;
  private readonly logger = new Logger(HotelsBookingProvider.name);

  constructor(private readonly rh: RateHawkClient) {}

  async finish(item: OrderItem, order: Order): Promise<BookingResult> {
    const d = item.details as unknown as HotelItemDetails;
    const res = await this.rh.post('/hotel/order/booking/finish/', {
      partner: {
        partner_order_id: item.supplierRef,
        comment: order.customerComment ?? undefined,
        amount_sell_b2b2c: Number(item.sellAmount).toFixed(2),
      },
      user: { email: order.customerEmail, phone: order.customerPhone, comment: order.customerComment ?? undefined },
      supplier_data: {
        first_name_original: order.customerFirstName,
        last_name_original: order.customerLastName,
        phone: order.customerPhone,
        email: order.customerEmail,
      },
      language: order.language,
      rooms: d.rooms.map((r) => ({
        guests: r.guests.map((g) => ({
          first_name: g.firstName,
          last_name: g.lastName,
          ...(g.isChild ? { is_child: true, age: g.age } : {}),
        })),
      })),
      payment_type: {
        type: d.supplierPayment.type,
        amount: d.supplierPayment.amount,
        currency_code: d.supplierPayment.currency_code,
      },
    });
    if (res.status !== 'ok' && !RETRYABLE.has(res.error ?? res.status)) {
      return { status: 'FAILED', error: res.error ?? res.status };
    }
    return { status: 'BOOKING', supplierOrderId: item.supplierOrderId ?? undefined };
  }

  async checkStatus(item: OrderItem): Promise<BookingResult> {
    const res = await this.rh.post<{ percent?: number }>('/hotel/order/booking/finish/status/', {
      partner_order_id: item.supplierRef,
    });
    if (res.status === 'ok' && !res.error) return { status: 'CONFIRMED', supplierOrderId: item.supplierOrderId ?? undefined };
    const code = res.error ?? res.status;
    if (RETRYABLE.has(code)) return { status: 'BOOKING' };
    this.logger.warn(`Rezervare ${item.supplierRef} eșuată: ${code}`);
    return { status: 'FAILED', error: code };
  }

  async cancel(item: OrderItem): Promise<void> {
    await this.rh.call('/hotel/order/cancel/', { partner_order_id: item.supplierRef });
  }
}
