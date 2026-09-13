import type { ReactNode } from 'react';
import './AuthLayout.css';

type Props = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
};

// Halaman masuk & daftar: panel merah bermerek di kiri, formulir di kanan.
export function AuthLayout({ title, subtitle, children, footer }: Props) {
  return (
    <div className="auth">
      <aside className="brand">
        <img className="logo" src="/Toyota.png" alt="Toyota" />
        <div className="brand-text">
          <h1>TalkTask</h1>
          <p>
            Chat internal & pekerjaan lapangan dalam satu tempat. Versi web untuk
            dipakai dari komputer kantor.
          </p>
        </div>
        <span className="mark">Chat Internal</span>
      </aside>

      <main className="panel">
        <div className="form">
          <h2>{title}</h2>
          <p className="muted subtitle">{subtitle}</p>
          {children}
          <div className="footer">{footer}</div>
        </div>
      </main>
    </div>
  );
}
