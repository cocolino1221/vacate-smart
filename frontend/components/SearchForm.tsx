'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Room, api, formatRooms } from '@/lib/api';

type Tab = 'hotels' | 'flights' | 'transfers' | 'rail';
const TABS: { id: Tab; label: string }[] = [
  { id: 'hotels', label: 'Hoteluri' },
  { id: 'flights', label: 'Zboruri' },
  { id: 'transfers', label: 'Transferuri' },
  { id: 'rail', label: 'Trenuri' },
];

interface Suggest {
  regions: { id: number; name: string; type: string; country_code: string }[];
  hotels: { hid: number; name: string }[];
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (n: number) => iso(new Date(Date.now() + n * 86_400_000));

export default function SearchForm({ initialTab = 'hotels' }: { initialTab?: Tab }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [query, setQuery] = useState('');
  const [dest, setDest] = useState<{ regionId?: number; hid?: number; name: string } | null>(null);
  const [sugg, setSugg] = useState<Suggest | null>(null);
  const [checkin, setCheckin] = useState(addDays(14));
  const [checkout, setCheckout] = useState(addDays(17));
  const [rooms, setRooms] = useState<Room[]>([{ adults: 2, children: [] }]);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setTab(initialTab), [initialTab]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (query.length < 2 || dest?.name === query) return setSugg(null);
    timer.current = setTimeout(() => {
      api<Suggest>(`/hotels/suggest?q=${encodeURIComponent(query)}`).then(setSugg).catch(() => setSugg(null));
    }, 250);
  }, [query, dest]);

  const setRoom = (i: number, r: Partial<Room>) => setRooms(rooms.map((x, j) => (j === i ? { ...x, ...r } : x)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!dest) return setError('Alege o destinație din listă.');
    if (checkout <= checkin) return setError('Data plecării trebuie să fie după data sosirii.');
    const q = new URLSearchParams({ checkin, checkout, rooms: formatRooms(rooms), name: dest.name });
    if (dest.hid) router.push(`/hotels/${dest.hid}?${q}`);
    else router.push(`/hotels?${q}&regionId=${dest.regionId}`);
  };

  return (
    <div className="card">
      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'hotels' ? (
        <p className="muted">
          {TABS.find((t) => t.id === tab)!.label} prin RateHawk – <b>în curând</b>. Integrarea este pregătită în
          platformă și se activează după primirea documentației API de la RateHawk.
        </p>
      ) : (
        <form onSubmit={submit}>
          <div className="grid">
            <div className="suggest" style={{ gridColumn: 'span 2' }}>
              <label htmlFor="dest">Destinație sau hotel</label>
              <input id="dest" autoComplete="off" placeholder="ex. Roma, Antalya, Hilton…" value={query}
                onChange={(e) => { setQuery(e.target.value); setDest(null); }} />
              {sugg && (sugg.regions.length > 0 || sugg.hotels.length > 0) && (
                <ul>
                  {sugg.regions.slice(0, 6).map((r) => (
                    <li key={`r${r.id}`} onClick={() => { const n = `${r.name}, ${r.country_code}`; setDest({ regionId: r.id, name: n }); setQuery(n); setSugg(null); }}>
                      📍 {r.name} <span className="muted small">{r.country_code} · {r.type}</span>
                    </li>
                  ))}
                  {sugg.hotels.slice(0, 5).map((h) => (
                    <li key={`h${h.hid}`} onClick={() => { setDest({ hid: h.hid, name: h.name }); setQuery(h.name); setSugg(null); }}>
                      🏨 {h.name}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <label htmlFor="ci">Sosire</label>
              <input id="ci" type="date" min={addDays(0)} value={checkin} onChange={(e) => setCheckin(e.target.value)} />
            </div>
            <div>
              <label htmlFor="co">Plecare</label>
              <input id="co" type="date" min={checkin} value={checkout} onChange={(e) => setCheckout(e.target.value)} />
            </div>
          </div>

          {rooms.map((r, i) => (
            <div className="grid" key={i} style={{ marginTop: 12 }}>
              <div>
                <label>Camera {i + 1} – adulți</label>
                <select value={r.adults} onChange={(e) => setRoom(i, { adults: +e.target.value })}>
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}
                </select>
              </div>
              <div>
                <label>Copii</label>
                <select value={r.children.length}
                  onChange={(e) => setRoom(i, { children: Array.from({ length: +e.target.value }, (_, k) => r.children[k] ?? 8) })}>
                  {[0, 1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}
                </select>
              </div>
              {r.children.map((age, k) => (
                <div key={k}>
                  <label>Vârsta copil {k + 1}</label>
                  <select value={age} onChange={(e) => setRoom(i, { children: r.children.map((a, j) => (j === k ? +e.target.value : a)) })}>
                    {Array.from({ length: 18 }, (_, n) => <option key={n} value={n}>{n} ani</option>)}
                  </select>
                </div>
              ))}
              {i > 0 && (
                <div><button type="button" className="btn secondary" onClick={() => setRooms(rooms.filter((_, j) => j !== i))}>Elimină</button></div>
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            {rooms.length < 6 && (
              <button type="button" className="btn secondary" onClick={() => setRooms([...rooms, { adults: 2, children: [] }])}>+ Cameră</button>
            )}
            <button className="btn" type="submit">Caută hoteluri</button>
          </div>
          {error && <p className="error">{error}</p>}
        </form>
      )}
    </div>
  );
}
