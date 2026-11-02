import { Suspense } from 'react';
import CheckoutForm from './CheckoutForm';

export default function CheckoutPage() {
  return (
    <div style={{ maxWidth: 760, margin: '32px auto' }}>
      <h1>Finalizează rezervarea</h1>
      <Suspense fallback={<p>Se încarcă…</p>}>
        <CheckoutForm />
      </Suspense>
    </div>
  );
}
