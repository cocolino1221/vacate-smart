import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { ItemStatus, Order, OrderItem, OrderStatus, Prisma, ProductType } from '@prisma/client';
import { randomBytes, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { MailService } from '../notifications/mail.service';
import { HotelsService } from '../products/hotels/hotels.service';
import { CreateHotelOrderDto } from '../products/hotels/hotels.dto';
import { BOOKING_PROVIDERS, BookingProvider } from '../common/types';
import { round2 } from '../common/utils';
import { toHttpError } from '../ratehawk/ratehawk.client';

const ORDER_INCLUDE = { items: true, payments: true } as const;
type FullOrder = Prisma.OrderGetPayload<{ include: typeof ORDER_INCLUDE }>;

/** O rezervare la furnizor care nu se confirmă în acest interval e tratată ca eșuată. */
const BOOKING_TIMEOUT_MS = 20 * 60 * 1000;
/** Comenzile neplătite expiră (tarifele RateHawk nu rămân valabile la nesfârșit). */
const PAYMENT_TIMEOUT_MS = 35 * 60 * 1000;

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  private readonly providers: Map<ProductType, BookingProvider>;
  private polling = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly payments: PaymentsService,
    private readonly mail: MailService,
    private readonly hotels: HotelsService,
    private readonly config: ConfigService,
    @Inject(BOOKING_PROVIDERS) providers: BookingProvider[],
  ) {
    this.providers = new Map(providers.map((p) => [p.product, p]));
  }

  private newPartnerOrderId() {
    const d = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    return `VS${d}${randomBytes(4).toString('hex').toUpperCase()}`;
  }

  // ---------------- creare comandă ----------------

  async createHotelOrder(dto: CreateHotelOrderDto, userIp: string) {
    try {
      const language = dto.language ?? this.config.get<string>('defaults.language')!;
      const { rate, priceChanged } = await this.hotels.prebook(dto.bookHash);
      const info = await this.hotels.getHotelInfo(dto.hid, language).catch(() => null);

      const partnerOrderId = this.newPartnerOrderId();
      const supplierRef = `${partnerOrderId}-H1`;
      const form = await this.hotels.bookingForm(supplierRef, rate.bookHash, language, userIp);

      const order = await this.prisma.order.create({
        data: {
          partnerOrderId,
          accessToken: randomBytes(24).toString('hex'),
          currency: rate.currency,
          netAmount: rate.netAmount,
          sellAmount: rate.sellAmount,
          customerEmail: dto.customer.email,
          customerPhone: dto.customer.phone,
          customerFirstName: dto.customer.firstName,
          customerLastName: dto.customer.lastName,
          customerComment: dto.customer.comment,
          language,
          userIp,
          items: {
            create: {
              product: ProductType.HOTEL,
              supplierRef,
              supplierOrderId: form.orderId,
              supplierItemId: form.itemId,
              bookHash: rate.bookHash,
              paymentType: form.paymentType.type,
              netAmount: rate.netAmount,
              sellAmount: rate.sellAmount,
              currency: rate.currency,
              travellers: dto.rooms as unknown as Prisma.InputJsonValue,
              details: {
                title: info?.name ?? `Hotel ${dto.hid}`,
                subtitle: `${rate.roomName}, ${dto.checkin} → ${dto.checkout}`,
                hid: dto.hid,
                address: info?.address,
                checkin: dto.checkin,
                checkout: dto.checkout,
                checkInTime: info?.check_in_time,
                checkOutTime: info?.check_out_time,
                roomName: rate.roomName,
                meal: rate.meal,
                taxesAtHotel: rate.taxesAtHotel,
                freeCancellationBefore: rate.freeCancellationBefore,
                cancellationPolicies: rate.cancellationPolicies,
                rooms: dto.rooms,
                supplierPayment: {
                  type: form.paymentType.type,
                  amount: form.paymentType.amount,
                  currency_code: form.paymentType.currency_code,
                },
              } as unknown as Prisma.InputJsonValue,
            },
          },
        },
      });

      const checkout = await this.payments.createCheckout(order, `${info?.name ?? 'Hotel'} – ${rate.roomName}`);
      await this.prisma.payment.create({
        data: {
          orderId: order.id,
          provider: checkout.provider,
          providerRef: checkout.ref,
          amount: order.sellAmount,
          currency: order.currency,
        },
      });

      if (checkout.provider === 'test') {
        // sandbox: simulăm plata reușită
        setImmediate(() => this.onPaid(checkout.ref).catch((e) => this.logger.error(e)));
      }

      return {
        orderId: order.id,
        token: order.accessToken,
        checkoutUrl: checkout.url,
        priceChanged,
        amount: rate.sellAmount,
        currency: rate.currency,
      };
    } catch (e) {
      throw toHttpError(e);
    }
  }

  // ---------------- plată ----------------

  /** Apelat din webhook-ul de plată. Idempotent. */
  async onPaid(paymentRef: string, raw?: unknown) {
    const payment = await this.prisma.payment.findUnique({ where: { providerRef: paymentRef } });
    if (!payment) throw new NotFoundException(`Plată necunoscută ${paymentRef}`);

    const updated = await this.prisma.order.updateMany({
      where: { id: payment.orderId, status: { in: [OrderStatus.PENDING_PAYMENT, OrderStatus.EXPIRED] } },
      data: { status: OrderStatus.PAID },
    });
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'SUCCEEDED', raw: (raw ?? undefined) as Prisma.InputJsonValue | undefined },
    });
    if (updated.count === 0) return; // deja procesată
    await this.fulfill(payment.orderId);
  }

  /** Finalizează rezervările la furnizor pentru fiecare produs din comandă. */
  private async fulfill(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    for (const item of order.items.filter((i) => i.status === ItemStatus.PENDING)) {
      await this.prisma.orderItem.update({ where: { id: item.id }, data: { status: ItemStatus.BOOKING } });
      try {
        const r = await this.provider(item).finish(item, order);
        await this.applyResult(item, r.status, r.error);
      } catch (e) {
        this.logger.error(`finish ${item.supplierRef}: ${(e as Error).message}`);
        // rămâne BOOKING – statusul se verifică la următorul poll; dacă nu se confirmă, expiră
      }
    }
    await this.finalize(orderId);
  }

  private provider(item: OrderItem) {
    const p = this.providers.get(item.product);
    if (!p) throw new Error(`Niciun provider pentru ${item.product}`);
    return p;
  }

  private async applyResult(item: OrderItem, status: 'CONFIRMED' | 'BOOKING' | 'FAILED', error?: string) {
    if (status === 'BOOKING') return;
    await this.prisma.orderItem.update({
      where: { id: item.id },
      data: { status: status === 'CONFIRMED' ? ItemStatus.CONFIRMED : ItemStatus.FAILED, errorMessage: error ?? null },
    });
  }

  /** Verifică periodic rezervările aflate în procesare la RateHawk. */
  @Interval(10_000)
  async pollBookings() {
    if (this.polling) return;
    this.polling = true;
    try {
      const items = await this.prisma.orderItem.findMany({
        where: { status: ItemStatus.BOOKING },
        include: { order: true },
        take: 50,
      });
      const touched = new Set<string>();
      for (const item of items) {
        try {
          const r = await this.provider(item).checkStatus(item, item.order);
          if (r.status === 'BOOKING' && Date.now() - item.updatedAt.getTime() > BOOKING_TIMEOUT_MS) {
            await this.applyResult(item, 'FAILED', 'timeout_confirmare');
            await this.mail.adminAlert('Rezervare neconfirmată', `Verifică manual în RateHawk: ${item.supplierRef}`);
          } else {
            await this.applyResult(item, r.status, r.error);
          }
          touched.add(item.orderId);
        } catch (e) {
          this.logger.warn(`status ${item.supplierRef}: ${(e as Error).message}`);
        }
      }
      for (const id of touched) await this.finalize(id);
    } finally {
      this.polling = false;
    }
  }

  /** Stabilește statusul final al comenzii și rambursează ce nu s-a putut rezerva. */
  private async finalize(orderId: string) {
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (order.status !== OrderStatus.PAID) return;
    const items = order.items;
    if (items.some((i) => i.status === ItemStatus.BOOKING || i.status === ItemStatus.PENDING)) return;

    const failed = items.filter((i) => i.status === ItemStatus.FAILED);
    if (!failed.length) {
      await this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.CONFIRMED } });
      await this.mail.orderConfirmed(order, items);
      return;
    }

    const allFailed = failed.length === items.length;
    const refundAmount = allFailed ? Number(order.sellAmount) : round2(failed.reduce((s, i) => s + Number(i.sellAmount), 0));
    const payment = order.payments.find((p) => p.status === 'SUCCEEDED');
    let refundOk = false;
    if (payment) {
      try {
        await this.payments.refund(payment.provider, payment.providerRef, allFailed ? undefined : refundAmount);
        refundOk = true;
      } catch (e) {
        this.logger.error(`Rambursare eșuată ${order.id}: ${(e as Error).message}`);
      }
    }
    await this.prisma.order.update({
      where: { id: orderId },
      data: { status: allFailed ? (refundOk ? OrderStatus.REFUNDED : OrderStatus.FAILED) : OrderStatus.PARTIALLY_FAILED },
    });
    if (refundOk) await this.mail.orderFailed(order, refundAmount);
    await this.mail.adminAlert(
      `Comandă ${allFailed ? 'eșuată' : 'parțial eșuată'} ${order.partnerOrderId}`,
      `Erori: ${failed.map((f) => `${f.supplierRef}: ${f.errorMessage}`).join(', ')}\nRambursare: ${refundOk ? refundAmount : 'EȘUATĂ – manual!'}`,
    );
  }

  /** Comenzile neplătite expiră după PAYMENT_TIMEOUT_MS. */
  @Interval(60_000)
  async expireUnpaid() {
    await this.prisma.order.updateMany({
      where: { status: OrderStatus.PENDING_PAYMENT, createdAt: { lt: new Date(Date.now() - PAYMENT_TIMEOUT_MS) } },
      data: { status: OrderStatus.EXPIRED },
    });
  }

  // ---------------- citire / anulare ----------------

  async getForCustomer(id: string, token: string) {
    const order = await this.prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!order || !token) throw new NotFoundException('Comanda nu există');
    const a = Buffer.from(order.accessToken);
    const b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException();
    return this.publicView(order);
  }

  publicView(order: Order & { items: OrderItem[] }) {
    return {
      id: order.id,
      reference: order.partnerOrderId,
      status: order.status,
      currency: order.currency,
      total: Number(order.sellAmount),
      customer: { firstName: order.customerFirstName, lastName: order.customerLastName, email: order.customerEmail },
      createdAt: order.createdAt,
      items: order.items.map((i) => {
        // nu expunem datele interne (preț net, plata către furnizor)
        const { supplierPayment: _sp, ...details } = i.details as Record<string, unknown>;
        return {
          product: i.product,
          status: i.status,
          price: Number(i.sellAmount),
          supplierOrderId: i.status === ItemStatus.CONFIRMED ? i.supplierOrderId : null,
          details,
        };
      }),
    };
  }

  async list(params: { status?: OrderStatus; q?: string; take?: number; skip?: number }) {
    const where: Prisma.OrderWhereInput = {
      ...(params.status ? { status: params.status } : {}),
      ...(params.q
        ? { OR: [{ partnerOrderId: { contains: params.q } }, { customerEmail: { contains: params.q, mode: 'insensitive' } }] }
        : {}),
    };
    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_INCLUDE,
        orderBy: { createdAt: 'desc' },
        take: Math.min(params.take ?? 50, 200),
        skip: params.skip ?? 0,
      }),
    ]);
    return { total, orders };
  }

  /** Anulare la furnizor (admin). Rambursarea către client se decide manual în funcție de penalități. */
  async cancel(orderId: string): Promise<FullOrder> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_INCLUDE });
    if (!order) throw new NotFoundException();
    const confirmed = order.items.filter((i) => i.status === ItemStatus.CONFIRMED);
    if (!confirmed.length) throw new BadRequestException('Nu există rezervări confirmate de anulat');
    for (const item of confirmed) {
      try {
        await this.provider(item).cancel(item, order);
      } catch (e) {
        throw toHttpError(e);
      }
      await this.prisma.orderItem.update({ where: { id: item.id }, data: { status: ItemStatus.CANCELLED } });
    }
    return this.prisma.order.update({ where: { id: orderId }, data: { status: OrderStatus.CANCELLED }, include: ORDER_INCLUDE });
  }
}
