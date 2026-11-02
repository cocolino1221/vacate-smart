export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Rulează promisiuni cu concurență limitată (pentru a respecta rate-limit-ul furnizorului). */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}
