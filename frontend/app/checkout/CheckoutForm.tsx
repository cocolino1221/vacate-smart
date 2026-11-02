'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, money, parseRooms } from '@/lib/api';

interface Guest { firstName: string; lastName: string; isChild?: boolean; age?: number }

export default function CheckoutForm() {
  const sp = useSearchParams();
  const rooms = parseRooms(sp.get('rooms'));
  const price = Number(sp.get('price'));
  const currency = sp.get('currency') ?? 'EUR';

  const [customer, setCustomer] = useState({ firstName: '', lastName: '', email: '', phone: '', comment: '' });
  const [guests, setGuests] = useState<Guest[][]>(
    rooms.map((r) => [
      ...Array.from({ length: r.adults }, () => ({ firstName: '', lastName: '' })),
      ...r.children.map((age) => ({ firstName: '', lastName: '', isChild: true, age })),
    ]),
  );
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<'link' | 'merchant'>('link');

  useEffect(() => {
    api<{ salesMode: 'link' | 'merchant' }>('/config').then((c) => setMode(c.salesMode)).catch(() => {});
  }, []);

  const setGuest = (ri: number, gi: number, g: Partial<Guest>) =>
    setGuests(guests.map((room, i) => (i !== ri ? room : room.map((x, j) => (j === gi ? { ...x, ...g } : x)))));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      // dacă numele oaspetelui principal lipsește, îl completăm cu datele clientului
      const filled = guests.map((room, ri) =>
        room.map((g, gi) =>
          ri === 0 && gi === 0 && !g.firstName ? { ...g, firstName: customer.firstName, lastName: customer.lastName } : g,
        ),
      );
      const res = await api<{ checkoutUrl: string; priceChanged: boolean; amount: number }>('/orders/hotel', {
        method: 'POST',
        body: JSON.stringify({
          bookHash: sp.get('bookHash'),
          hid: Number(sp.get('hid')),
          checkin: sp.get('checkin'),
          checkout: sp.get('checkout'),
          rooms: filled.map((g) => ({ guests: g })),
          customer: { ...customer, comment: customer.comment || undefined },
        }),
      });
      if (res.priceChanged && !confirm(`Prețul s-a modificat: ${money(res.amount, currency)}. Continui spre plată?`)) {
        setBusy(false);
        return;
      }
      window.location.href = res.checkoutUrl;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const field = (k: keyof typeof customer, label: string, type = 'text', required = true) => (
    <div>
      <label htmlFor={k}>{label}</label>
      <input id={k} type={type} required={required} value={customer[k]} onChange={(e) => setCustomer({ ...customer, [k]: e.target.value })} />
    </div>
  );

  return (
    <form onSubmit={submit}>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>{sp.get('hotel')}</h3>
        <p className="muted" style={{ margin: 0 }}>{sp.get('room')} · {sp.get('checkin')} → {sp.get('checkout')}</p>
        <p style={{ marginBottom: 0 }}>Total: <strong>{money(price, currency)}</strong></p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Datele tale</h3>
        <div className="grid">
          {field('firstName', 'Prenume')}
          {field('lastName', 'Nume')}
          {field('email', 'Email', 'email')}
          {field('phone', 'Telefon', 'tel')}
        </div>
        <div style={{ marginTop: 12 }}>
          <label htmlFor="comment">Cereri speciale (opțional, nu sunt garantate)</label>
          <textarea id="comment" rows={2} maxLength={500} value={customer.comment} onChange={(e) => setCustomer({ ...customer, comment: e.target.value })} />
        </div>
      </div>

      {guests.map((room, ri) => (
        <div className="card" key={ri} style={{ marginBottom: 16 }}>
          <h3 style={{ marginTop: 0 }}>Oaspeți camera {ri + 1}</h3>
          {room.map((g, gi) => (
            <div className="grid" key={gi} style={{ marginBottom: 8 }}>
              <div>
                <label>{g.isChild ? `Copil (${g.age} ani) – prenume` : `Adult ${gi + 1} – prenume`}</label>
                <input required={!(ri === 0 && gi === 0)} placeholder={ri === 0 && gi === 0 ? 'ca mai sus' : ''} value={g.firstName}
                  onChange={(e) => setGuest(ri, gi, { firstName: e.target.value })} />
              </div>
              <div>
                <label>Nume</label>
                <input required={!(ri === 0 && gi === 0)} placeholder={ri === 0 && gi === 0 ? 'ca mai sus' : ''} value={g.lastName}
                  onChange={(e) => setGuest(ri, gi, { lastName: e.target.value })} />
              </div>
            </div>
          ))}
          <p className="small muted" style={{ marginBottom: 0 }}>Numele trebuie scrise cu litere latine, ca în actul de identitate.</p>
        </div>
      ))}

      {mode === 'link' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <b>Cum funcționează</b>
          <ol className="small" style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            <li>Trimiți cererea – nu plătești nimic acum.</li>
            <li>Verificăm disponibilitatea și îți trimitem pe email un <b>link securizat de plată</b>.</li>
            <li>Plătești cu cardul direct către furnizorul de servicii turistice și primești confirmarea.</li>
          </ol>
          <p className="small muted" style={{ marginBottom: 0 }}>
            Vacate Smart acționează ca intermediar. Prețul final este cel din linkul de plată.
          </p>
        </div>
      )}

      <label style={{ display: 'flex', gap: 8, alignItems: 'start', color: 'var(--text)' }}>
        <input type="checkbox" style={{ width: 'auto', marginTop: 4 }} checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
        <span>Am citit și accept <a href="/termeni" target="_blank">Termenii și condițiile</a>, politica de anulare a tarifului și <a href="/confidentialitate" target="_blank">Politica de confidențialitate</a>.</span>
      </label>
      {error && <p className="error">{error}</p>}
      <button className="btn" style={{ marginTop: 16, width: '100%' }} disabled={busy || !agree}>
        {busy
          ? 'Verificăm disponibilitatea…'
          : mode === 'link'
            ? 'Trimite cererea de rezervare'
            : `Plătește ${money(price, currency)}`}
      </button>
    </form>
  );
}
