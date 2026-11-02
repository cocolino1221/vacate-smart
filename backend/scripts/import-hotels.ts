/**
 * Importă dump-ul complet de date statice RateHawk (nume, poze, facilități) în PostgreSQL.
 * Rulați o dată pe săptămână (cron pe server):  npm run import:hotels -- ro
 *
 * Dump-ul este JSON Lines comprimat cu Zstandard; Node 22.15+ are suport zstd nativ în zlib.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Readable } from 'stream';
import { createInterface } from 'readline';
import * as zlib from 'zlib';
import { AppModule } from '../src/app.module';
import { RateHawkClient } from '../src/ratehawk/ratehawk.client';
import { HotelsService } from '../src/products/hotels/hotels.service';

async function main() {
  const language = process.argv[2] ?? 'ro';
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const rh = app.get(RateHawkClient);
  const hotels = app.get(HotelsService);

  const { url } = await rh.call<{ url: string }>('/hotel/info/dump/', { inventory: 'all', language });
  console.log(`Descarc dump: ${url}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Download eșuat: HTTP ${res.status}`);

  const createZstd = (zlib as any).createZstdDecompress;
  if (!createZstd) throw new Error('Node fără suport zstd – folosiți Node >= 22.15');

  const lines = createInterface({ input: Readable.fromWeb(res.body as any).pipe(createZstd()), crlfDelay: Infinity });
  let n = 0;
  let batch: Promise<void>[] = [];
  for await (const line of lines) {
    if (!line.trim()) continue;
    batch.push(hotels.saveHotel(JSON.parse(line)));
    if (batch.length >= 200) {
      await Promise.all(batch);
      batch = [];
      n += 200;
      if (n % 10_000 === 0) console.log(`${n} hoteluri importate`);
    }
  }
  await Promise.all(batch);
  console.log(`Gata: ${n + batch.length} hoteluri`);
  await app.close();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
