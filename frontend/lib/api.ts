/** URL backend: pe server (SSR) apelăm direct containerul API, în browser mergem prin /api. */
export const apiBase = () => (typeof window === 'undefined' ? process.env.API_INTERNAL_URL ?? 'http://localhost:4000' : '');

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(data.message) ? data.message.join(', ') : data.message;
    throw new Error(msg ?? `Eroare ${res.status}`);
  }
  return data as T;
}

export interface Room {
  adults: number;
  children: number[];
}

/** Camerele în URL: "2|2:5,8" = cameră cu 2 adulți | cameră cu 2 adulți + copii de 5 și 8 ani */
export function parseRooms(s?: string | null): Room[] {
  if (!s) return [{ adults: 2, children: [] }];
  return s.split('|').slice(0, 6).map((r) => {
    const [a, c] = r.split(':');
    return {
      adults: Math.min(6, Math.max(1, parseInt(a, 10) || 2)),
      children: c ? c.split(',').map((x) => parseInt(x, 10)).filter((x) => x >= 0 && x <= 17) : [],
    };
  });
}

export function formatRooms(rooms: Room[]): string {
  return rooms.map((r) => (r.children.length ? `${r.adults}:${r.children.join(',')}` : `${r.adults}`)).join('|');
}

export const money = (n: number, cur: string) =>
  new Intl.NumberFormat('ro-RO', { style: 'currency', currency: cur }).format(n);

export const nights = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));

export const fmtDate = (d: string) =>
  new Date(d).toLocaleString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const MEALS: Record<string, string> = {
  nomeal: 'Fără masă',
  breakfast: 'Mic dejun inclus',
  'half-board': 'Demipensiune',
  'full-board': 'Pensiune completă',
  'all-inclusive': 'All inclusive',
};
