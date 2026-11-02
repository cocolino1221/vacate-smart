/** Tipuri (parțiale) pentru răspunsurile RateHawk Hotels API v3. */

export interface RhTax {
  name: string;
  included_by_supplier: boolean;
  amount: string;
  currency_code: string;
}

export interface RhPenaltyPolicy {
  start_at: string | null;
  end_at: string | null;
  amount_charge: string;
  amount_show: string;
}

export interface RhPaymentType {
  amount: string;
  show_amount: string;
  currency_code: string;
  show_currency_code: string;
  by: string | null;
  is_need_credit_card_data: boolean;
  is_need_cvc: boolean;
  type: 'deposit' | 'now' | 'hotel' | string;
  tax_data?: { taxes?: RhTax[] };
  cancellation_penalties?: {
    policies?: RhPenaltyPolicy[];
    free_cancellation_before?: string | null;
  };
}

export interface RhRate {
  match_hash?: string;
  book_hash?: string;
  room_name: string;
  meal: string;
  meal_data?: { value?: string; has_breakfast?: boolean; no_child_meal?: boolean };
  daily_prices?: string[];
  allotment?: number;
  amenities_data?: string[];
  rg_ext?: Record<string, number>;
  room_data_trans?: { main_name?: string; bedding_type?: string | null };
  payment_options: { payment_types: RhPaymentType[] };
}

export interface RhSerpHotel {
  id: string;
  hid: number;
  rates: RhRate[];
}

export interface RhSerpResponse {
  hotels: RhSerpHotel[];
  total_hotels?: number;
}

export interface RhPrebookResponse {
  hotels: RhSerpHotel[];
  changes?: { price_changed?: boolean };
}

export interface RhBookingFormResponse {
  order_id: number;
  partner_order_id: string;
  item_id: number;
  is_gender_specification_required?: boolean;
  payment_types: RhPaymentType[];
}

export interface RhHotelInfo {
  id: string;
  hid: number;
  name: string;
  address?: string;
  star_rating?: number;
  latitude?: number;
  longitude?: number;
  check_in_time?: string;
  check_out_time?: string;
  images?: string[];
  amenity_groups?: { group_name: string; amenities: string[] }[];
  description_struct?: { title: string; paragraphs: string[] }[];
  metapolicy_extra_info?: string;
  region?: { id: number; name: string; country_code: string; type?: string };
  phone?: string;
  email?: string;
}

export interface RhMulticomplete {
  regions: { id: number; name: string; type: string; country_code: string }[];
  hotels: { id: string; hid: number; name: string; region_id: number }[];
}
