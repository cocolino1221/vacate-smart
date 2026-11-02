export default () => ({
  env: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '4000', 10),
  publicUrl: process.env.PUBLIC_URL ?? 'http://localhost:3000',
  ratehawk: {
    baseUrl: process.env.RATEHAWK_BASE_URL ?? 'https://api.worldota.net/api/b2b/v3',
    keyId: process.env.RATEHAWK_KEY_ID ?? '',
    apiKey: process.env.RATEHAWK_API_KEY ?? '',
    timeoutMs: parseInt(process.env.RATEHAWK_TIMEOUT_MS ?? '30000', 10),
    residency: process.env.RATEHAWK_DEFAULT_RESIDENCY ?? 'ro',
  },
  defaults: {
    currency: process.env.DEFAULT_CURRENCY ?? 'EUR',
    language: process.env.DEFAULT_LANGUAGE ?? 'ro',
  },
  markup: {
    HOTEL: parseFloat(process.env.MARKUP_HOTEL_PERCENT ?? '10'),
    FLIGHT: parseFloat(process.env.MARKUP_FLIGHT_PERCENT ?? '3'),
    TRANSFER: parseFloat(process.env.MARKUP_TRANSFER_PERCENT ?? '12'),
    RAIL: parseFloat(process.env.MARKUP_RAIL_PERCENT ?? '5'),
  },
  /**
   * link     = intermediar: clientul trimite cererea, agentul creează în RateHawk un link de plată
   *            (pay-by-link, cu comisionul ales) și îl trimite din admin. Banii NU trec prin firmă.
   * merchant = clientul plătește la noi (Stripe), noi plătim RateHawk din linia de credit. Necesită licență.
   */
  salesMode: process.env.SALES_MODE === 'merchant' ? 'merchant' : 'link',
  payments: {
    provider: process.env.PAYMENT_PROVIDER ?? 'stripe', // stripe | test
    stripeSecretKey: process.env.STRIPE_SECRET_KEY ?? '',
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? '',
  },
  mail: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'Vacate Smart <rezervari@example.com>',
    adminEmail: process.env.ADMIN_EMAIL ?? '',
  },
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  adminToken: process.env.ADMIN_TOKEN ?? '',
});
