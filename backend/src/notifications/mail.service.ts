import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { Transporter } from 'nodemailer';
import { Order, OrderItem } from '@prisma/client';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;

  constructor(private readonly config: ConfigService) {
    const host = config.get<string>('mail.host');
    this.transport = host
      ? nodemailer.createTransport({
          host,
          port: config.get<number>('mail.port'),
          secure: config.get<number>('mail.port') === 465,
          auth: { user: config.get('mail.user'), pass: config.get('mail.pass') },
        })
      : null;
  }

  async send(to: string, subject: string, html: string) {
    if (!to) return;
    if (!this.transport) {
      this.logger.log(`[mail dezactivat] către ${to}: ${subject}`);
      return;
    }
    try {
      await this.transport.sendMail({ from: this.config.get('mail.from'), to, subject, html });
    } catch (e) {
      this.logger.error(`Email eșuat către ${to}: ${(e as Error).message}`);
    }
  }

  private orderLink(order: Order) {
    return `${this.config.get('publicUrl')}/order/${order.id}?token=${order.accessToken}`;
  }

  async orderConfirmed(order: Order, items: OrderItem[]) {
    const rows = items
      .map((i) => {
        const d = i.details as Record<string, any>;
        return `<li><b>${esc(d.title)}</b> – ${esc(d.subtitle)}<br/>Nr. rezervare: ${esc(i.supplierOrderId)}</li>`;
      })
      .join('');
    await this.send(
      order.customerEmail,
      `Rezervare confirmată #${order.partnerOrderId}`,
      `<p>Bună, ${esc(order.customerFirstName)}!</p>
       <p>Rezervarea ta a fost confirmată.</p><ul>${rows}</ul>
       <p>Total plătit: <b>${Number(order.sellAmount).toFixed(2)} ${esc(order.currency)}</b></p>
       <p><a href="${this.orderLink(order)}">Vezi detaliile rezervării</a></p>`,
    );
  }

  async orderFailed(order: Order, refunded: number) {
    await this.send(
      order.customerEmail,
      `Rezervarea #${order.partnerOrderId} nu a putut fi finalizată`,
      `<p>Ne pare rău, ${esc(order.customerFirstName)}, furnizorul nu a putut confirma rezervarea.</p>
       <p>Suma de ${refunded.toFixed(2)} ${esc(order.currency)} a fost rambursată pe card (poate dura 5–10 zile).</p>`,
    );
  }

  async adminAlert(subject: string, body: string) {
    await this.send(this.config.get<string>('mail.adminEmail') ?? '', `[Vacate Smart] ${subject}`, `<pre>${esc(body)}</pre>`);
  }
}
