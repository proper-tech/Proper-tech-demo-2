'use client';

import Link from 'next/link';
import { useI18n } from '@/i18n/I18nProvider';

/** A missing page inside a language (an apartment or floor that isn't in the data, say): the header stays, and
 *  the way back is in the visitor's language. Addresses without a language go to global-not-found.tsx. A
 *  client component only to read the dictionary the layout already sends. */
export default function NotFound() {
  const { locale, t } = useI18n();
  return (
    <main className="status-page">
      <p className="status-code">404</p>
      <h1>{t.errors.notFound}</h1>
      <p className="lead">{t.errors.notFoundLine}</p>
      <Link className="pill pill-primary" href={`/${locale}`}>
        {t.errors.home}
      </Link>
    </main>
  );
}
