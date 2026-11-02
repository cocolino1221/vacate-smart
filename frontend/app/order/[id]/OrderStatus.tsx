'use client';

import { useEffect, useState } from 'react';
import { MEALS, api, fmtDate, money } from '@/lib/api';

interface Order {
  id: string; reference: string; status: string; currency: string; total: number;
  mode: 'link' | 'merchant'; paymentLink: string | null;
  customer: { firstName: string; email: string };
  items: { product: string; status: string; price: number; supplierOrderId: string | null; details: Record<string, any> }[];
}

const LABELS: Record<string, [string, string]> = {
  AWAITING_LINK: ['Cerere primită – îți trimitem linkul de plată pe email în cel mai scurt timp', 'var(--warn)'],
  LINK_SENT: ['Camera e disponibilă – finalizează plata', 'var(--warn)'],
  PENDING_PAYMENT: ['Așteaptă plata', 'var(--warn)'],
  PAID: ['Plată primită – confirmăm rezervarea…', 'var(--warn)'],
  CONFIRMED: ['Rezervare confirmată ✓', 'var(--accent)'],
  PARTIALLY_FAILED: ['Parțial confirmată – te contactăm', 'var(--warn)'],
  FAILED: ['Rezervarea nu a putut fi finalizată', 'var(--danger)'],
  REFUNDED: ['Rezervare eșuată – suma a fost rambursată', 'var(--danger)'],
  CANCELLED: ['Anulată', 'var(--muted)'],
  EXPIRED: ['Expirată (neplătită)', 'var(--muted)'],
};
const FINAL = new Set(['CONFIRMED', 'PARTIALLY_FAILED', 'FAILED', 'REFUNDED', 'CANCELLED', 'EXPIRED']);

export default function OrderStatus({ id, token, cancelled }: { id: string; token: string; cancelled: boolean }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      try {
        const o = await api<Order>(`/orders/${id}?token=${encodeURIComponent(token)}`);
        if (stop) return;
        setOrder(o);
        if (!FINAL.has(o.status) && !(cancelled && o.status === 'PENDING_PAYMENT')) timer = setTimeout(load, 4000);
      } catch (e) {
        setError((e as Error).message);
      }
    };
    load();
    return () => { stop = true; clearTimeout(timer); };
  }, [id, token, cancelled]);

  if (error) return <p className="error">{error}</p>;
  if (!order) return <p>Se încarcă…</p>;
  const [label, color] = LABELS[order.status] ?? [order.status, 'var(--text)'];

  return (
    <>
      <p className="status" style={{ color }}>{cancelled && order.status === 'PENDING_PAYMENT' ? 'Plata a fost anulată.' : label}</p>
      {order.paymentLink && (
        <p>
          <a className="btn" href={order.paymentLink} target="_blank" rel="noopener noreferrer">Plătește în siguranță</a>
          <br /><span className="small muted">Plata se face direct către furnizorul de servicii turistice. Vacate Smart acționează ca intermediar.</span>
        </p>
      )}
      <p className="muted">Referință: <b>{order.reference}</b> · Confirmarea se trimite la {order.customer.email}</p>
      {order.items.map((i, k) => (
        <div className="card" key={k} style={{ marginBottom: 12 }}>
          <h3 style={{ marginTop: 0 }}>{i.details.title}</h3>
          <p className="muted">{i.details.address}</p>
          <p>{i.details.roomName} · {MEALS[i.details.meal] ?? i.details.meal}</p>
          <p>Check-in: <b>{i.details.checkin}</b> {i.details.checkInTime && `de la ${i.details.checkInTime}`}<br />
            Check-out: <b>{i.details.checkout}</b> {i.details.checkOutTime && `până la ${i.details.checkOutTime}`}</p>
          {i.supplierOrderId && <p>Nr. confirmare: <b>{i.supplierOrderId}</b></p>}
          {i.details.freeCancellationBefore
            ? <p className="small">Anulare gratuită până la {fmtDate(i.details.freeCancellationBefore)}</p>
            : <p className="small">Tarif nerambursabil</p>}
          {i.details.taxesAtHotel?.length > 0 && (
            <p className="small muted">De plătit la hotel: {i.details.taxesAtHotel.map((t: any) => `${t.name.replace(/_/g, " ")} ${money(t.amount, t.currency)}`).join(', ')}</p>
          )}
        </div>
      ))}
      <p>Total: <strong>{money(order.total, order.currency)}</strong></p>
    </>
  );
}
