'use client';

import { useCallback, useEffect, useState } from 'react';
import { money } from '@/lib/api';

/* Panou admin minimal: cereri de rezervare + trimitere link de plată RateHawk. */

interface Item { product: string; status: string; netAmount: string; sellAmount: string; currency: string; supplierOrderId: string | null; details: Record<string, any> }
interface Order {
  id: string; partnerOrderId: string; status: string; salesMode: string; currency: string;
  netAmount: string; sellAmount: string; customerEmail: string; customerPhone: string;
  customerFirstName: string; customerLastName: string; customerComment: string | null;
  paymentLink: string | null; adminNote: string | null; createdAt: string; items: Item[];
}

const STATUS: Record<string, string> = {
  AWAITING_LINK: '🟠 Așteaptă link', LINK_SENT: '🔵 Link trimis', PENDING_PAYMENT: 'Așteaptă plata', PAID: 'Plătită',
  CONFIRMED: '🟢 Confirmată', CANCELLED: '⚪ Anulată', FAILED: '🔴 Eșuată', REFUNDED: 'Rambursată',
  PARTIALLY_FAILED: 'Parțial eșuată', EXPIRED: 'Expirată',
};
const FILTERS = ['', 'AWAITING_LINK', 'LINK_SENT', 'CONFIRMED', 'CANCELLED'];

function getToken() {
  try { return sessionStorage.getItem('vs_admin') ?? ''; } catch { return ''; }
}

export default function Admin() {
  const [token, setToken] = useState('');
  const [input, setInput] = useState('');
  const [filter, setFilter] = useState('AWAITING_LINK');
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState('');

  useEffect(() => setToken(getToken()), []);

  const call = useCallback(async <T,>(path: string, body?: unknown): Promise<T> => {
    const res = await fetch(`/api/admin${path}`, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) { try { sessionStorage.removeItem('vs_admin'); } catch {} setToken(''); }
    if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message ?? `Eroare ${res.status}`);
    return data as T;
  }, [token]);

  const load = useCallback(async () => {
    if (!token) return;
    setError('');
    try {
      const r = await call<{ orders: Order[] }>(`/orders${filter ? `?status=${filter}` : ''}`);
      setOrders(r.orders);
    } catch (e) { setError((e as Error).message); }
  }, [token, filter, call]);

  useEffect(() => { load(); const t = setInterval(load, 30_000); return () => clearInterval(t); }, [load]);

  if (!token) {
    return (
      <form style={{ maxWidth: 420, margin: '64px auto' }} className="card"
        onSubmit={(e) => { e.preventDefault(); try { sessionStorage.setItem('vs_admin', input); } catch {} setToken(input); }}>
        <h2 style={{ marginTop: 0 }}>Admin</h2>
        <label htmlFor="tok">Token admin</label>
        <input id="tok" type="password" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn" style={{ marginTop: 12 }}>Intră</button>
      </form>
    );
  }

  const act = async (fn: () => Promise<unknown>) => {
    try { await fn(); await load(); } catch (e) { alert((e as Error).message); }
  };

  return (
    <div style={{ margin: '32px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ margin: 0 }}>Cereri de rezervare</h1>
        <button className="btn secondary" onClick={() => { try { sessionStorage.removeItem('vs_admin'); } catch {} setToken(''); }}>Ieșire</button>
      </div>
      <div className="tabs" style={{ marginTop: 16 }}>
        {FILTERS.map((f) => (
          <button key={f} className={`tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{f ? STATUS[f] : 'Toate'}</button>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
      {orders.length === 0 && <p className="muted">Nicio comandă.</p>}
      <div className="list">
        {orders.map((o) => <OrderCard key={o.id} o={o} act={act} call={call} />)}
      </div>
    </div>
  );
}

function OrderCard({ o, act, call }: { o: Order; act: (fn: () => Promise<unknown>) => void; call: <T>(p: string, b?: unknown) => Promise<T> }) {
  const [link, setLink] = useState(o.paymentLink ?? '');
  const [conf, setConf] = useState('');
  const sell = Number(o.sellAmount);
  const net = Number(o.netAmount);
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <b>#{o.partnerOrderId}</b>
        <span>{STATUS[o.status] ?? o.status} · <span className="muted small">{new Date(o.createdAt).toLocaleString('ro-RO')}</span></span>
      </div>
      <p style={{ margin: '8px 0' }}>
        {o.customerFirstName} {o.customerLastName} · <a href={`mailto:${o.customerEmail}`}>{o.customerEmail}</a> · <a href={`tel:${o.customerPhone}`}>{o.customerPhone}</a>
      </p>
      {o.customerComment && <p className="small">💬 {o.customerComment}</p>}
      {o.items.map((i, k) => (
        <div key={k} className="small" style={{ borderTop: '1px solid var(--line)', paddingTop: 8, marginTop: 8 }}>
          <b>{i.details.title}</b> <span className="muted">(hid {i.details.hid})</span><br />
          {i.details.roomName} · {i.details.meal} · {i.details.checkin} → {i.details.checkout}<br />
          {(i.details.rooms ?? []).map((r: any, j: number) => (
            <div key={j}>Camera {j + 1}: {r.guests.map((g: any) => `${g.firstName} ${g.lastName}${g.isChild ? ` (${g.age} ani)` : ''}`).join(', ')}</div>
          ))}
          {i.details.freeCancellationBefore ? `Anulare gratuită până la ${i.details.freeCancellationBefore}` : 'Nerambursabil'}
          {i.supplierOrderId && <div>Nr. RateHawk: <b>{i.supplierOrderId}</b></div>}
        </div>
      ))}
      <p className="small" style={{ marginBottom: 0 }}>
        Preț afișat clientului: <b>{money(sell, o.currency)}</b> · net RateHawk: {money(net, o.currency)} ·
        comision recomandat în link: <b>{money(sell - net, o.currency)}</b> ({net ? (((sell - net) / net) * 100).toFixed(1) : 0}%)
      </p>
      {o.adminNote && <p className="small muted">Notă: {o.adminNote}</p>}

      {o.salesMode === 'link' && (o.status === 'AWAITING_LINK' || o.status === 'LINK_SENT') && (
        <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input style={{ flex: '1 1 260px' }} placeholder="Lipește linkul de plată din RateHawk (https://…)" value={link} onChange={(e) => setLink(e.target.value)} />
            <button className="btn" onClick={() => act(() => call(`/orders/${o.id}/payment-link`, { url: link.trim() }))}>
              {o.status === 'LINK_SENT' ? 'Retrimite linkul' : 'Trimite linkul clientului'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input style={{ flex: '1 1 200px' }} placeholder="Nr. comandă RateHawk (după plată)" value={conf} onChange={(e) => setConf(e.target.value)} />
            <button className="btn secondary" onClick={() => act(() => call(`/orders/${o.id}/confirm`, { supplierOrderId: conf.trim() }))}>Marchează plătită / confirmată</button>
            <button className="btn secondary" style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
              onClick={() => { const r = prompt('Motivul (îl primește clientul pe email):', 'Camera nu mai este disponibilă la acest preț.'); if (r) act(() => call(`/orders/${o.id}/reject`, { reason: r })); }}>
              Respinge
            </button>
          </div>
        </div>
      )}
      {o.status === 'CONFIRMED' && (
        <button className="btn secondary" style={{ marginTop: 12 }}
          onClick={() => { if (confirm('Marchezi comanda ca anulată? (în modul link anularea se face și în RateHawk)')) act(() => call(`/orders/${o.id}/cancel`, {})); }}>
          Marchează anulată
        </button>
      )}
    </div>
  );
}
