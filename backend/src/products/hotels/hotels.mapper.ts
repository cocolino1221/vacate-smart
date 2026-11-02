import { Markup, PricingService } from '../../pricing/pricing.service';
import { RhHotelInfo, RhPaymentType, RhRate } from './ratehawk-hotels.types';

/**
 * Tipul de plată pe care îl folosim la RateHawk: "deposit" = noi plătim din soldul agenției,
 * iar clientul ne plătește pe noi (suntem merchant of record).
 */
export const PREFERRED_PAYMENT_TYPE = 'deposit';

export function pickPaymentType(types: RhPaymentType[]): RhPaymentType | undefined {
  return types.find((t) => t.type === PREFERRED_PAYMENT_TYPE);
}

export interface MappedRate {
  bookHash: string;
  roomName: string;
  meal: string;
  hasBreakfast: boolean;
  allotment?: number;
  amenities: string[];
  currency: string;
  netAmount: number;
  sellAmount: number;
  /** Taxe care NU sunt incluse în preț și se plătesc la hotel (obligatoriu de afișat). */
  taxesAtHotel: { name: string; amount: number; currency: string }[];
  freeCancellationBefore: string | null;
  cancellationPolicies: { startAt: string | null; endAt: string | null; amount: number }[];
}

export function mapRate(rate: RhRate, markup: Markup): MappedRate | null {
  const pt = pickPaymentType(rate.payment_options?.payment_types ?? []);
  const hash = rate.book_hash ?? rate.match_hash;
  if (!pt || !hash) return null;
  const net = parseFloat(pt.show_amount);
  return {
    bookHash: hash,
    roomName: rate.room_name,
    meal: rate.meal_data?.value ?? rate.meal,
    hasBreakfast: rate.meal_data?.has_breakfast ?? rate.meal !== 'nomeal',
    allotment: rate.allotment,
    amenities: rate.amenities_data ?? [],
    currency: pt.show_currency_code,
    netAmount: net,
    sellAmount: PricingService.apply(net, markup),
    taxesAtHotel: (pt.tax_data?.taxes ?? [])
      .filter((t) => !t.included_by_supplier)
      .map((t) => ({ name: t.name, amount: parseFloat(t.amount), currency: t.currency_code })),
    freeCancellationBefore: pt.cancellation_penalties?.free_cancellation_before ?? null,
    cancellationPolicies: (pt.cancellation_penalties?.policies ?? []).map((p) => ({
      startAt: p.start_at,
      endAt: p.end_at,
      amount: PricingService.apply(parseFloat(p.amount_show), markup),
    })),
  };
}

export interface HotelSummary {
  hid: number;
  id: string;
  name: string;
  starRating: number;
  address?: string;
  image?: string;
  latitude?: number;
  longitude?: number;
}

export function imageUrl(tpl: string | undefined, size = '640x400'): string | undefined {
  return tpl?.replace('{size}', size);
}

export function summarizeHotel(info: RhHotelInfo): HotelSummary {
  return {
    hid: info.hid,
    id: info.id,
    name: info.name,
    starRating: info.star_rating ?? 0,
    address: info.address,
    image: imageUrl(info.images?.[0]),
    latitude: info.latitude,
    longitude: info.longitude,
  };
}
