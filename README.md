# Vacate Smart

Platformă de rezervări online (OTA) pentru hoteluri, zboruri, transferuri și trenuri, cu inventar de la **RateHawk (ETG API v3)**. Se hostează pe serverul propriu.

## Ce funcționează acum

| Produs | Stare |
|---|---|
| **Hoteluri** | ✅ complet: autocomplete destinații, căutare cu prețuri, pagină hotel, tarife, prebook, plată, rezervare, confirmare, anulare |
| Zboruri | 🟡 schelet pregătit (`backend/src/products/flights`), se implementează după documentația API RateHawk |
| Transferuri | 🟡 schelet pregătit (`backend/src/products/transfers`) |
| Trenuri | 🟡 schelet pregătit (`backend/src/products/rail`) |

## Cum circulă banii (model `deposit`, cu linia de credit RateHawk)

```
Client ──(preț vânzare = net + adaos)──► Stripe ──► contul vostru
Voi    ──(preț net)──► RateHawk, din linia de credit / factură
Profit = adaosul (configurabil pe produs)
```

Clientul nu plătește niciodată direct la RateHawk. Cardul este procesat de Stripe Checkout, deci datele de card nu ajung pe serverul vostru.

## Fluxul unei rezervări de hotel

1. `POST /api/hotels/search` apelează RateHawk `/search/serp/region/` (rezultate în cache Redis 5 min) și afișează prețul minim cu adaos.
2. `POST /api/hotels/:hid/rates` apelează `/search/hp/` și întoarce camerele, masa, politica de anulare și taxele de plătit la hotel.
3. `POST /api/orders/hotel` face trei lucruri:
   - apelează `/hotel/prebook/` (verifică prețul și disponibilitatea);
   - apelează `/hotel/order/booking/form/` (creează comanda la RateHawk);
   - creează sesiunea Stripe Checkout.
4. Clientul plătește, iar webhook-ul Stripe trimite la `POST /api/payments/stripe/webhook`.
5. Backend-ul apelează `/hotel/order/booking/finish/`, apoi interoghează la 10 s `/hotel/order/booking/finish/status/`.
6. La confirmare, comanda trece în `CONFIRMED` și clientul primește email. Dacă RateHawk refuză, banii se rambursează automat și primiți un email de alertă.

Comenzile neplătite expiră după 35 de minute.

## Structură

```
backend/    NestJS + Prisma (PostgreSQL) + Redis
  src/ratehawk/            client HTTP RateHawk (Basic auth), comun tuturor produselor
  src/products/hotels/     integrare completă hoteluri
  src/products/{flights,transfers,rail}/   schelete
  src/orders/              orchestrare comenzi, plăți, polling status
  src/payments/            Stripe Checkout + rambursări
  src/pricing/             adaos comercial
  src/admin/               API admin (comenzi, anulări, adaos, statistici)
  scripts/import-hotels.ts import dump date statice RateHawk
frontend/   Next.js 15 (App Router)
nginx/      reverse proxy + SSL
docker-compose.yml
```

## Pornire pe server

```bash
git clone <repo> && cd vacate-smart
cp .env.example .env        # completați cheile RateHawk, Stripe, SMTP, ADMIN_TOKEN, parola DB
# în nginx/default.conf înlocuiți vacatesmart.ro cu domeniul vostru
```

Certificatul SSL se generează o singură dată. Porniți temporar nginx doar pe portul 80 sau folosiți `certbot certonly --standalone`:

```bash
docker run --rm -p 80:80 -v $PWD/nginx/certs:/etc/letsencrypt certbot/certbot:v2.11.0 \
  certonly --standalone -d vacatesmart.ro -d www.vacatesmart.ro --agree-tos -m admin@vacatesmart.ro
```

```bash
docker compose up -d --build
```

Migrațiile bazei de date rulează automat la pornirea API-ului.

### Import date statice hoteluri (recomandat săptămânal)

```bash
docker compose exec api npm run import:hotels -- ro
```

Fără import, numele și pozele hotelurilor se iau la cerere din `/hotel/info/` și se salvează în baza de date. Merge, dar căutările sunt mai lente la început.

### Stripe

În Stripe Dashboard → Developers → Webhooks adăugați `https://DOMENIU/api/payments/stripe/webhook` cu evenimentele `checkout.session.completed` și `checkout.session.async_payment_succeeded`. Puneți signing secret-ul în `STRIPE_WEBHOOK_SECRET`.

## Dezvoltare locală / testare cu sandbox RateHawk

```bash
# Postgres + Redis local (sau doar serviciile db/redis din docker compose)
cd backend && npm install
export DATABASE_URL=postgresql://... REDIS_URL=redis://localhost:6379 \
       RATEHAWK_KEY_ID=... RATEHAWK_API_KEY=... PAYMENT_PROVIDER=test NODE_ENV=development
npx prisma migrate deploy && npm run start:dev
npm test
```

```bash
cd frontend && npm install && API_INTERNAL_URL=http://localhost:4000 npm run dev
```

`PAYMENT_PROVIDER=test` simulează plata ca să testați fluxul complet cu cheile sandbox. În sandbox rezervați doar hotelul de test RateHawk (`hid 8473727`, „test_hotel_do_not_book”).

## API admin

Toate cererile au header-ul `Authorization: Bearer <ADMIN_TOKEN>`.

| Metodă | Endpoint | Ce face |
|---|---|---|
| GET | `/api/admin/orders?status=&q=` | listă comenzi (căutare după referință / email) |
| POST | `/api/admin/orders/:id/cancel` | anulare la RateHawk (rambursarea către client se face manual, în funcție de penalități) |
| GET | `/api/admin/markup` | adaosul curent pe produs |
| PUT | `/api/admin/markup/HOTEL` | `{"percent": 12, "fixed": 0}` |
| GET | `/api/admin/stats` | încasări, cost, marjă pe status |

## Checklist înainte de producție

- [ ] **Certificare RateHawk.** Cereți checklist-ul de la account manager. Platforma afișează deja politica de anulare, taxele de plătit la hotel, masa și numele oaspeților.
- [ ] Chei de producție RateHawk; linia de credit este activă pe tipul de plată `deposit`.
- [ ] Licență de turism (completați numărul în footer, `frontend/app/layout.tsx`).
- [ ] Termeni și condiții, politica de confidențialitate (GDPR), cookie banner.
- [ ] Asigurare de insolvență, dacă vindeți pachete (zbor + hotel).
- [ ] Facturare automată (SmartBill / Oblio) la confirmarea comenzii. **Nu este încă implementată.**
- [ ] Backup zilnic PostgreSQL și monitorizare (Sentry / Uptime Kuma).
- [ ] Panou admin vizual. Momentan există doar API-ul de admin.

## Următorii pași

1. Zboruri, transferuri și trenuri: completați provider-ii din `backend/src/products/*` după documentația API RateHawk pentru fiecare produs. Coșul (`Order` cu mai multe `OrderItem`) suportă deja mai multe produse într-o singură plată.
2. Cont client (istoric rezervări), multi-limbă și multi-valută.
3. Google Hotel Center / Free Booking Links, SEO pe pagini de destinații.
