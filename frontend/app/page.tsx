import SearchForm from '@/components/SearchForm';

export default async function Home({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  const t = (['hotels', 'flights', 'transfers', 'rail'].includes(tab ?? '') ? tab : 'hotels') as
    'hotels' | 'flights' | 'transfers' | 'rail';
  return (
    <>
      <section className="hero">
        <h1>Călătorește inteligent</h1>
        <p>Peste 2,5 milioane de hoteluri, plus zboruri, transferuri și trenuri. Totul într-un singur loc.</p>
        <SearchForm initialTab={t} />
      </section>
      <section className="grid" style={{ marginTop: 24 }}>
        <div className="card"><b>Plată sigură</b><p className="muted small">Plătești cu cardul prin procesator certificat PCI-DSS.</p></div>
        <div className="card"><b>Confirmare instant</b><p className="muted small">Primești confirmarea rezervării pe email în câteva minute.</p></div>
        <div className="card"><b>Suport în română</b><p className="muted small">Te ajutăm înainte, în timpul și după călătorie.</p></div>
      </section>
    </>
  );
}
