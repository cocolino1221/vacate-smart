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

  // ---------- mod intermediar ----------

  private itemsHtml(items: OrderItem[]) {
    return items
      .map((i) => {
        const d = i.details as Record<string, any>;
        const guests = (d.rooms ?? [])
          .map((r: any, k: number) => `Camera ${k + 1}: ${r.guests.map((g: any) => `${esc(g.firstName)} ${esc(g.lastName)}${g.isChild ? ` (copil ${g.age} ani)` : ''}`).join(', ')}`)
          .join('<br/>');
        return `<li><b>${esc(d.title)}</b> (hid ${esc(d.hid)})<br/>${esc(d.roomName)} · ${esc(d.meal)}<br/>
          ${esc(d.checkin)} → ${esc(d.checkout)}<br/>${guests}<br/>Preț afișat clientului: <b>${Number(i.sellAmount).toFixed(2)} ${esc(i.currency)}</b>
          (net RateHawk: ${Number(i.netAmount).toFixed(2)})</li>`;
      })
      .join('');
  }

  async linkRequestReceived(order: Order & { items: OrderItem[] }) {
    await this.send(
      order.customerEmail,
      `Am primit cererea ta de rezervare #${order.partnerOrderId}`,
      `<p>Bună, ${esc(order.customerFirstName)}!</p>
       <p>Am primit cererea ta. Verificăm disponibilitatea și îți trimitem în cel mai scurt timp <b>linkul securizat de plată</b>.</p>
       <p>Plata se face direct către furnizorul de servicii turistice; Vacate Smart acționează ca intermediar.</p>
       <p><a href="${this.orderLink(order)}">Urmărește cererea</a></p>`,
    );
  }

  async adminNewLinkRequest(order: Order & { items: OrderItem[] }) {
    const admin = `${this.config.get('publicUrl')}/admin`;
    await this.send(
      this.config.get<string>('mail.adminEmail') ?? '',
      `[Vacate Smart] Cerere nouă #${order.partnerOrderId} – generează link de plată`,
      `<p><b>Client:</b> ${esc(order.customerFirstName)} ${esc(order.customerLastName)} · ${esc(order.customerEmail)} · ${esc(order.customerPhone)}</p>
       ${order.customerComment ? `<p><b>Mențiuni:</b> ${esc(order.customerComment)}</p>` : ''}
       <ul>${this.itemsHtml(order.items)}</ul>
       <p>1) Creează rezervarea în RateHawk cu plata prin link și comisionul vostru.<br/>
          2) Lipește linkul în <a href="${admin}">panoul de admin</a> – clientul îl primește automat pe email.</p>`,
    );
  }

  async paymentLink(order: Order, items: OrderItem[]) {
    const d = (items[0]?.details ?? {}) as Record<string, any>;
    await this.send(
      order.customerEmail,
      `Link de plată pentru rezervarea #${order.partnerOrderId}`,
      `<p>Bună, ${esc(order.customerFirstName)}!</p>
       <p>Camera ta la <b>${esc(d.title)}</b> (${esc(d.checkin)} → ${esc(d.checkout)}) este disponibilă.</p>
       <p><a href="${esc(order.paymentLink)}" style="display:inline-block;padding:12px 20px;background:#0b6bcb;color:#fff;border-radius:8px;text-decoration:none">Plătește în siguranță</a></p>
       <p>Plata se face direct către furnizorul de servicii turistice (Emerging Travel Group / RateHawk). Linkul are valabilitate limitată – te rugăm să plătești cât mai curând, altfel tariful se poate modifica.</p>
       <p><a href="${this.orderLink(order)}">Vezi cererea</a></p>`,
    );
  }

  async requestRejected(order: Order, reason: string) {
    await this.send(
      order.customerEmail,
      `Cererea #${order.partnerOrderId} nu a putut fi onorată`,
      `<p>Bună, ${esc(order.customerFirstName)}!</p><p>Ne pare rău, cererea ta nu a putut fi onorată: ${esc(reason)}</p>
       <p>Nu ți s-a debitat nicio sumă. Te așteptăm să alegi o altă ofertă pe site.</p>`,
    );
  }
}
