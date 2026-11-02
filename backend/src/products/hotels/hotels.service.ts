import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ProductType } from '@prisma/client';
import { RateHawkClient } from '../../ratehawk/ratehawk.client';
import { CacheService } from '../../cache/cache.service';
import { PrismaService } from '../../prisma/prisma.service';
import { PricingService } from '../../pricing/pricing.service';
import { mapLimit } from '../../common/utils';
import { HotelSearchDto, StayDto } from './hotels.dto';
import { HotelSummary, MappedRate, imageUrl, mapRate, pickPaymentType, summarizeHotel } from './hotels.mapper';
import {
  RhBookingFormResponse, RhHotelInfo, RhMulticomplete, RhPrebookResponse, RhSerpResponse,
} from './ratehawk-hotels.types';

@Injectable()
export class HotelsService {
  private readonly logger = new Logger(HotelsService.name);

  constructor(
    private readonly rh: RateHawkClient,
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly config: ConfigService,
  ) {}

  private stayParams(dto: StayDto) {
    return {
      checkin: dto.checkin,
      checkout: dto.checkout,
      residency: dto.residency ?? this.config.get('ratehawk.residency'),
      language: (dto.language ?? this.config.get<string>('defaults.language'))!,
      currency: dto.currency ?? this.config.get('defaults.currency'),
      guests: dto.guests.map((g) => ({ adults: g.adults, children: g.children ?? [] })),
    };
  }

  /** Autocomplete destinații + hoteluri. */
  async suggest(query: string, language?: string) {
    const lang = language ?? this.config.get('defaults.language');
    return this.cache.wrap(`rh:mc:${lang}:${query.toLowerCase()}`, 3600, () =>
      this.rh.call<RhMulticomplete>('/search/multicomplete/', { query, language: lang }),
    );
  }

  /** Căutare hoteluri cu prețuri (SERP). */
  async search(dto: HotelSearchDto) {
    const params = this.stayParams(dto);
    let endpoint: string;
    let body: Record<string, unknown>;
    if (dto.hids?.length) {
      endpoint = '/search/serp/hotels/';
      body = { ...params, hids: dto.hids };
    } else if (dto.latitude !== undefined && dto.longitude !== undefined) {
      endpoint = '/search/serp/geo/';
      body = { ...params, latitude: dto.latitude, longitude: dto.longitude, radius: dto.radius ?? 5000 };
    } else if (dto.regionId) {
      endpoint = '/search/serp/region/';
      body = { ...params, region_id: dto.regionId, hotels_limit: 300 };
    } else {
      throw new NotFoundException('Specifică regionId, hids sau coordonate.');
    }

    const key = `rh:serp:${endpoint}:${JSON.stringify(body)}`;
    const serp = await this.cache.wrap(key, 300, () => this.rh.call<RhSerpResponse>(endpoint, body));
    const markup = await this.pricing.getMarkup(ProductType.HOTEL);

    // cel mai mic preț per hotel, doar tarife plătibile din depozit
    const priced = serp.hotels
      .map((h) => {
        const rates = h.rates.map((r) => mapRate(r, markup)).filter((r): r is MappedRate => !!r);
        if (!rates.length) return null;
        const cheapest = rates.reduce((a, b) => (a.sellAmount <= b.sellAmount ? a : b));
        return {
          hid: h.hid,
          minPrice: cheapest.sellAmount,
          currency: cheapest.currency,
          hasFreeCancellation: rates.some((r) => !!r.freeCancellationBefore),
          hasBreakfast: rates.some((r) => r.hasBreakfast),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.minPrice - b.minPrice);

    const offset = dto.offset ?? 0;
    const page = priced.slice(offset, offset + (dto.limit ?? 30));
    const infos = await this.getSummaries(page.map((p) => p.hid), params.language);
    return {
      total: priced.length,
      offset,
      hotels: page.map((p) => ({ ...p, ...(infos.get(p.hid) ?? { name: `Hotel ${p.hid}`, starRating: 0 }) })),
    };
  }

  /** Toate camerele și tarifele unui hotel (hotel page). */
  /** Tarifele pentru client: fără prețul net (marja noastră nu se expune public). */
  async rates(hid: number, dto: StayDto): Promise<Omit<MappedRate, 'netAmount'>[]> {
    const body = { ...this.stayParams(dto), hid };
    const data = await this.cache.wrap(`rh:hp:${JSON.stringify(body)}`, 180, () =>
      this.rh.call<RhSerpResponse>('/search/hp/', body),
    );
    const markup = await this.pricing.getMarkup(ProductType.HOTEL);
    return (data.hotels[0]?.rates ?? [])
      .map((r) => mapRate(r, markup))
      .filter((r): r is MappedRate => !!r)
      .sort((a, b) => a.sellAmount - b.sellAmount)
      .map(({ netAmount: _net, ...pub }) => pub);
  }

  /** Verifică disponibilitatea și prețul final înainte de rezervare. */
  async prebook(bookHash: string) {
    const data = await this.rh.call<RhPrebookResponse>('/hotel/prebook/', {
      hash: bookHash,
      price_increase_percent: 0,
    });
    const rate = data.hotels?.[0]?.rates?.[0];
    if (!rate) throw new NotFoundException('Tariful nu mai este disponibil.');
    const markup = await this.pricing.getMarkup(ProductType.HOTEL);
    const mapped = mapRate(rate, markup);
    if (!mapped) throw new NotFoundException('Tariful nu poate fi plătit prin depozit.');
    return { rate: mapped, priceChanged: !!data.changes?.price_changed };
  }

  /** Pasul 1 din rezervare: creează comanda la RateHawk (fără să o finalizeze). */
  async bookingForm(partnerOrderId: string, bookHash: string, language: string, userIp: string) {
    const data = await this.rh.call<RhBookingFormResponse>('/hotel/order/booking/form/', {
      partner_order_id: partnerOrderId,
      book_hash: bookHash,
      language,
      user_ip: userIp,
    });
    const pt = pickPaymentType(data.payment_types);
    if (!pt) throw new NotFoundException('Plata prin depozit nu este disponibilă pentru acest tarif.');
    return { orderId: String(data.order_id), itemId: String(data.item_id), paymentType: pt };
  }

  // ---------- date statice ----------

  async getHotelInfo(hid: number, language = 'ro'): Promise<RhHotelInfo> {
    const row = await this.prisma.hotel.findUnique({ where: { hid } });
    const fresh = row && Date.now() - row.updatedAt.getTime() < 7 * 24 * 3600 * 1000;
    if (row && fresh) return row.data as unknown as RhHotelInfo;
    const info = await this.rh.call<RhHotelInfo>('/hotel/info/', { hid, language });
    await this.saveHotel(info);
    return info;
  }

  async saveHotel(info: RhHotelInfo) {
    const values = {
      id: info.id,
      name: info.name,
      starRating: info.star_rating ?? 0,
      regionId: info.region?.id ?? null,
      countryCode: info.region?.country_code ?? null,
      latitude: info.latitude ?? null,
      longitude: info.longitude ?? null,
      data: info as unknown as Prisma.InputJsonValue,
    };
    await this.prisma.hotel.upsert({ where: { hid: info.hid }, create: { hid: info.hid, ...values }, update: values });
  }

  async hotelDetails(hid: number, language?: string) {
    const info = await this.getHotelInfo(hid, language ?? this.config.get('defaults.language'));
    return {
      ...summarizeHotel(info),
      images: (info.images ?? []).slice(0, 20).map((i) => imageUrl(i, '1024x768')),
      checkInTime: info.check_in_time,
      checkOutTime: info.check_out_time,
      amenityGroups: info.amenity_groups ?? [],
      description: info.description_struct ?? [],
      policies: info.metapolicy_extra_info,
      region: info.region,
    };
  }

  private async getSummaries(hids: number[], language: string): Promise<Map<number, HotelSummary>> {
    const out = new Map<number, HotelSummary>();
    const rows = await this.prisma.hotel.findMany({ where: { hid: { in: hids } } });
    for (const r of rows) out.set(r.hid, summarizeHotel(r.data as unknown as RhHotelInfo));
    const missing = hids.filter((h) => !out.has(h));
    // completăm din API ce lipsește din dump (concurență mică – rate limit)
    await mapLimit(missing, 5, async (hid) => {
      try {
        out.set(hid, summarizeHotel(await this.getHotelInfo(hid, language)));
      } catch (e) {
        this.logger.warn(`hotel/info ${hid}: ${(e as Error).message}`);
      }
    });
    return out;
  }
}
