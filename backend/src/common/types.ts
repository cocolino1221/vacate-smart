import { OrderItem, Order, ProductType } from '@prisma/client';

export interface GuestRoom {
  adults: number;
  children?: number[]; // vârstele copiilor
}

export interface Traveller {
  firstName: string;
  lastName: string;
  isChild?: boolean;
  age?: number;
}

export interface BookingResult {
  status: 'CONFIRMED' | 'BOOKING' | 'FAILED';
  supplierOrderId?: string;
  error?: string;
}

/**
 * Contract comun pentru fiecare produs (hotel, zbor, transfer, tren).
 * OrdersService orchestrează plata și apoi apelează provider-ul fiecărui item.
 */
export interface BookingProvider {
  readonly product: ProductType;
  /** Finalizează rezervarea la furnizor după ce clientul a plătit. */
  finish(item: OrderItem, order: Order): Promise<BookingResult>;
  /** Verifică statusul unei rezervări aflate în procesare. */
  checkStatus(item: OrderItem, order: Order): Promise<BookingResult>;
  /** Anulează rezervarea la furnizor. */
  cancel(item: OrderItem, order: Order): Promise<void>;
}

export const BOOKING_PROVIDERS = Symbol('BOOKING_PROVIDERS');
