'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useI18n } from '@/i18n/I18nProvider';

/** A page that failed while rendering: the header stays, with a way to try again and a way home, instead of a
 *  blank screen. The 3D views have their own fallbacks (SafeCanvas); this catches the rest. */
export default function PageError({ error, retry }: { error: unknown; retry: () => void }) {
  const { locale, t } = useI18n();
  useEffect(() => {
    // the browser console is the only log a static site has; the digest matches a server-side error
    console.error(error);
  }, [error]);
  return (
    <main className="status-page">
      <h1>{t.errors.failed}</h1>
      <p className="lead">{t.errors.failedLine}</p>
      <div className="status-actions">
        <button type="button" className="pill pill-primary" onClick={() => retry()}>
          {t.errors.retry}
        </button>
        <Link className="button" href={`/${locale}`}>
          {t.errors.home}
        </Link>
      </div>
    </main>
  );
}
