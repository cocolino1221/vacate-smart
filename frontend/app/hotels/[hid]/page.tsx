import Link from 'next/link';
import { MEALS, api, fmtDate, money, nights, parseRooms } from '@/lib/api';

interface Details {
  hid: number; name: string; starRating: number; address?: string; images: string[];
  checkInTime?: string; checkOutTime?: string;
  amenityGroups: { group_name: string; amenities: string[] }[];
  description: { title: string; paragraphs: string[] }[];
  policies?: string;
}
interface Rate {
  bookHash: string; roomName: string; meal: string; hasBreakfast: boolean; allotment?: number;
  currency: string; sellAmount: number;
  taxesAtHotel: { name: string; amount: number; currency: string }[];
  freeCancellationBefore: string | null;
  cancellationPolicies: { startAt: string | null; endAt: string | null; amount: number }[];
}

export default async function HotelPage({
  params, searchParams,
}: { params: Promise<{ hid: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { hid } = await params;
  const sp = await searchParams;
  const { checkin = '', checkout = '' } = sp;
  const rooms = parseRooms(sp.rooms);
  const [details, rates] = await Promise.all([
    api<Details>(`/hotels/${hid}`).catch(() => null),
    api<Rate[]>(`/hotels/${hid}/rates`, {
      method: 'POST',
      body: JSON.stringify({ checkin, checkout, guests: rooms }),
    }).catch((e: Error) => e),
  ]);
  const n = nights(checkin, checkout);

  return (
    <>
      <h1 style={{ marginTop: 32, marginBottom: 4 }}>{details?.name ?? `Hotel ${hid}`}</h1>
      {details && details.starRating > 0 && <div className="stars">{'★'.repeat(details.starRating)}</div>}
      <p className="muted">{details?.address}</p>

      {details && details.images.length > 0 && (
        <div className="gallery">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {details.images.slice(0, 8).map((src, i) => <img key={i} src={src} alt="" loading="lazy" />)}
        </div>
      )}

      <h2>Camere disponibile</h2>
      <p className="muted small">{checkin} → {checkout} · {n} {n === 1 ? 'noapte' : 'nopți'} · <Link href="/">Modifică</Link></p>
      {rates instanceof Error && <p className="error">{rates.message}</p>}
      {Array.isArray(rates) && rates.length === 0 && <p>Nu mai sunt camere disponibile pentru aceste date.</p>}
      <div className="list">
        {Array.isArray(rates) &&
          rates.map((r) => {
            const q = new URLSearchParams({
              hid, bookHash: r.bookHash, checkin, checkout, rooms: sp.rooms ?? '2',
              room: r.roomName, price: String(r.sellAmount), currency: r.currency, hotel: details?.name ?? '',
            });
            return (
              <div key={r.bookHash} className="card rate">
                <div>
                  <h3 style={{ margin: '0 0 6px' }}>{r.roomName}</h3>
                  <span className="badge">{MEALS[r.meal] ?? r.meal}</span>
                  {r.freeCancellationBefore ? (
                    <span className="badge">Anulare gratuită până la {fmtDate(r.freeCancellationBefore)}</span>
                  ) : (
                    <span className="badge warn">Nerambursabil</span>
                  )}
                  {r.allotment !== undefined && r.allotment <= 3 && <span className="badge warn">Doar {r.allotment} disponibile</span>}
                  {r.taxesAtHotel.length > 0 && (
                    <p className="small muted" style={{ marginBottom: 0 }}>
                      De plătit la hotel: {r.taxesAtHotel.map((t) => `${t.name.replace(/_/g, ' ')} ${money(t.amount, t.currency)}`).join(', ')}
                    </p>
                  )}
                </div>
                <div className="price" style={{ padding: 0 }}>
                  <strong>{money(r.sellAmount, r.currency)}</strong>
                  <span className="muted small">total, taxe incluse*</span>
                  <Link className="btn" href={`/checkout?${q}`}>Rezervă</Link>
                </div>
              </div>
            );
          })}
      </div>
      <p className="muted small">* cu excepția taxelor locale menționate ca plătibile la hotel.</p>

      {details?.description.map((d, i) => (
        <section key={i}>
          <h3>{d.title}</h3>
          {d.paragraphs.map((p, j) => <p key={j}>{p}</p>)}
        </section>
      ))}
      {details && (details.checkInTime || details.checkOutTime) && (
        <p>Check-in de la <b>{details.checkInTime}</b> · Check-out până la <b>{details.checkOutTime}</b></p>
      )}
      {details && details.amenityGroups.length > 0 && (
        <section>
          <h3>Facilități</h3>
          <div className="grid">
            {details.amenityGroups.map((g) => (
              <div key={g.group_name}><b>{g.group_name}</b><p className="small muted">{g.amenities.join(', ')}</p></div>
            ))}
          </div>
        </section>
      )}
      {details?.policies && (<section><h3>Politici hotel</h3><p className="small">{details.policies}</p></section>)}
    </>
  );
}
