import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Order } from '@prisma/client';
import Stripe from 'stripe';

export interface CheckoutSession {
  provider: string;
  ref: string;
  url: string;
}

/**
 * Plăți client -> noi. Stripe Checkout (cardul nu ajunge niciodată pe serverul nostru, deci fără PCI scope).
 * PAYMENT_PROVIDER=test marchează comanda ca plătită imediat – DOAR pentru sandbox / dezvoltare.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe | null;
  readonly provider: 'stripe' | 'test';

  constructor(private readonly config: ConfigService) {
    const key = config.get<string>('payments.stripeSecretKey');
    this.stripe = key ? new Stripe(key) : null;
    this.provider = config.get('payments.provider') === 'test' ? 'test' : 'stripe';
    if (this.provider === 'test' && config.get('env') === 'production') {
      throw new Error('PAYMENT_PROVIDER=test nu este permis în producție');
    }
  }

  async createCheckout(order: Order, title: string): Promise<CheckoutSession> {
    const base = this.config.get<string>('publicUrl');
    const successUrl = `${base}/order/${order.id}?token=${order.accessToken}`;
    if (this.provider === 'test') {
      return { provider: 'test', ref: `test_${order.id}`, url: successUrl };
    }
    if (!this.stripe) throw new BadRequestException('Plățile nu sunt configurate (STRIPE_SECRET_KEY).');
    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      customer_email: order.customerEmail,
      client_reference_id: order.id,
      metadata: { orderId: order.id },
      payment_intent_data: { metadata: { orderId: order.id } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: order.currency.toLowerCase(),
            unit_amount: Math.round(Number(order.sellAmount) * 100),
            product_data: { name: title.slice(0, 250) },
          },
        },
      ],
      success_url: successUrl,
      cancel_url: `${base}/order/${order.id}?token=${order.accessToken}&cancelled=1`,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    });
    return { provider: 'stripe', ref: session.id, url: session.url! };
  }

  /** Verifică semnătura webhook-ului Stripe. */
  parseWebhook(rawBody: Buffer, signature: string): Stripe.Event {
    if (!this.stripe) throw new BadRequestException('Stripe neconfigurat');
    const secret = this.config.get<string>('payments.stripeWebhookSecret')!;
    try {
      return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch (e) {
      throw new BadRequestException(`Webhook invalid: ${(e as Error).message}`);
    }
  }

  /** Rambursare (totală dacă amount lipsește). paymentRef = ID-ul sesiunii Stripe. */
  async refund(provider: string, paymentRef: string, amount?: number): Promise<void> {
    if (provider === 'test') {
      this.logger.log(`[test] rambursare ${amount ?? 'totală'} pentru ${paymentRef}`);
      return;
    }
    if (!this.stripe) throw new Error('Stripe neconfigurat');
    const session = await this.stripe.checkout.sessions.retrieve(paymentRef);
    const pi = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
    if (!pi) throw new Error(`Sesiunea ${paymentRef} nu are payment_intent`);
    await this.stripe.refunds.create({
      payment_intent: pi,
      ...(amount !== undefined ? { amount: Math.round(amount * 100) } : {}),
    });
  }
}
