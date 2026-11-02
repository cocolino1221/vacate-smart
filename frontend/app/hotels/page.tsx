import Link from 'next/link';
import { api, money, nights, parseRooms } from '@/lib/api';

interface SearchResult {
  total: number;
  hotels: {
    hid: number; name: string; starRating: number; address?: string; image?: string;
    minPrice: number; currency: string; hasFreeCancellation: boolean; hasBreakfast: boolean;
  }[];
}

type SP = Promise<Record<string, string | undefined>>;

export default async function Results({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { checkin = '', checkout = '', regionId, name } = sp;
  const rooms = parseRooms(sp.rooms);
  let data: SearchResult | null = null;
  let error = '';
  try {
    data = await api<SearchResult>('/hotels/search', {
      method: 'POST',
      body: JSON.stringify({ checkin, checkout, regionId: Number(regionId), guests: rooms, limit: 30 }),
    });
  } catch (e) {
    error = (e as Error).message;
  }
  const qs = new URLSearchParams({ checkin, checkout, rooms: sp.rooms ?? '2' }).toString();
  const n = nights(checkin, checkout);

  return (
    <>
      <h1 style={{ marginTop: 32 }}>{name ?? 'Rezultate'}</h1>
      <p className="muted">
        {checkin} → {checkout} · {n} {n === 1 ? 'noapte' : 'nopți'} · {rooms.length} {rooms.length === 1 ? 'cameră' : 'camere'}
        {' · '}<Link href="/">Modifică căutarea</Link>
      </p>
      {error && <p className="error">{error}</p>}
      {data && data.hotels.length === 0 && <p>Nu am găsit hoteluri disponibile pentru aceste date.</p>}
      <div className="list">
        {data?.hotels.map((h) => (
          <Link key={h.hid} href={`/hotels/${h.hid}?${qs}`} className="card hotel" style={{ color: 'inherit' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={h.image ?? ''} alt={h.name} loading="lazy" />
            <div className="body">
              <h3 style={{ margin: '0 0 4px' }}>{h.name}</h3>
              {h.starRating > 0 && <div className="stars">{'★'.repeat(h.starRating)}</div>}
              <p className="muted small">{h.address}</p>
              {h.hasFreeCancellation && <span className="badge">Anulare gratuită</span>}
              {h.hasBreakfast && <span className="badge">Mic dejun disponibil</span>}
            </div>
            <div className="price">
              <span className="muted small">de la</span>
              <strong>{money(h.minPrice, h.currency)}</strong>
              <span className="muted small">total {n} {n === 1 ? 'noapte' : 'nopți'}</span>
              <span className="btn">Vezi camere</span>
            </div>
          </Link>
        ))}
      </div>
      {data && data.total > data.hotels.length && (
        <p className="muted small">Afișăm cele mai ieftine {data.hotels.length} din {data.total} hoteluri.</p>
      )}
    </>
  );
}
