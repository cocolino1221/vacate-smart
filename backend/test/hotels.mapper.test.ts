import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PricingService } from '../src/pricing/pricing.service';
import { mapRate } from '../src/products/hotels/hotels.mapper';
import { RhRate } from '../src/products/hotels/ratehawk-hotels.types';

const rate: RhRate = {
  book_hash: 'h-123',
  room_name: 'Double Standard',
  meal: 'breakfast',
  meal_data: { value: 'breakfast', has_breakfast: true },
  payment_options: {
    payment_types: [
      { type: 'hotel', amount: '90', show_amount: '90', currency_code: 'EUR', show_currency_code: 'EUR', by: null, is_need_credit_card_data: false, is_need_cvc: false },
      {
        type: 'deposit', amount: '100.00', show_amount: '100.00', currency_code: 'EUR', show_currency_code: 'EUR', by: null,
        is_need_credit_card_data: false, is_need_cvc: false,
        tax_data: { taxes: [
          { name: 'city_tax', included_by_supplier: false, amount: '5.00', currency_code: 'EUR' },
          { name: 'vat', included_by_supplier: true, amount: '9.00', currency_code: 'EUR' },
        ] },
        cancellation_penalties: {
          free_cancellation_before: '2026-12-01T10:00:00',
          policies: [{ start_at: '2026-12-01T10:00:00', end_at: null, amount_charge: '100', amount_show: '100' }],
        },
      },
    ],
  },
};

test('adaosul se aplică și rotunjește în sus', () => {
  assert.equal(PricingService.apply(100, { percent: 10, fixed: 0 }), 110);
  assert.equal(PricingService.apply(99.99, { percent: 7.5, fixed: 1 }), 108.49);
  assert.ok(PricingService.apply(33.33, { percent: 0, fixed: 0 }) >= 33.33);
});

test('mapRate folosește doar plata "deposit" și expune taxele de la hotel', () => {
  const m = mapRate(rate, { percent: 10, fixed: 0 })!;
  assert.equal(m.bookHash, 'h-123');
  assert.equal(m.netAmount, 100);
  assert.equal(m.sellAmount, 110);
  assert.deepEqual(m.taxesAtHotel, [{ name: 'city_tax', amount: 5, currency: 'EUR' }]);
  assert.equal(m.freeCancellationBefore, '2026-12-01T10:00:00');
  assert.equal(m.cancellationPolicies[0].amount, 110);
  assert.equal(m.hasBreakfast, true);
});

test('mapRate ignoră tarifele fără plată prin depozit', () => {
  const r = { ...rate, payment_options: { payment_types: [rate.payment_options.payment_types[0]] } };
  assert.equal(mapRate(r, { percent: 10, fixed: 0 }), null);
});
