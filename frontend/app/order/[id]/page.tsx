import OrderStatus from './OrderStatus';

export default async function OrderPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<{ token?: string; cancelled?: string }> }) {
  const { id } = await params;
  const { token = '', cancelled } = await searchParams;
  return (
    <div style={{ maxWidth: 760, margin: '32px auto' }}>
      <h1>Rezervarea ta</h1>
      <OrderStatus id={id} token={token} cancelled={!!cancelled} />
    </div>
  );
}
