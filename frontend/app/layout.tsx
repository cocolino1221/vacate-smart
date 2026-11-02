import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vacate Smart – hoteluri, zboruri, transferuri și trenuri',
  description: 'Rezervă hoteluri, zboruri, transferuri și bilete de tren la cele mai bune prețuri.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ro">
      <body>
        <header className="site">
          <div className="container">
            <Link href="/" className="logo">Vacate<span>Smart</span></Link>
            <nav className="main">
              <Link href="/?tab=hotels">Hoteluri</Link>
              <Link href="/?tab=flights">Zboruri</Link>
              <Link href="/?tab=transfers">Transferuri</Link>
              <Link href="/?tab=rail">Trenuri</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
        <footer className="site">
          <div className="container">
            <span>© {new Date().getFullYear()} Vacate Smart · Intermediar de servicii turistice. Serviciile sunt furnizate și plătite direct la partenerii noștri.</span>
            <span>
              <Link href="/termeni">Termeni și condiții</Link> · <Link href="/confidentialitate">Confidențialitate</Link> ·{' '}
              <a href="https://anpc.ro" target="_blank" rel="noreferrer">ANPC</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
