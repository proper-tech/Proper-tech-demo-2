'use client';

import { getDict, htmlLang, locales } from '@/i18n/config';

// The last resort: the language layout itself failed, so this replaces the whole document. The site's styles may
// not have loaded with it, so it carries its own few, and it can't know the language, so it speaks all three.
export default function GlobalError({ retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeContent: 'center', gap: '1.5rem', padding: '2rem', fontFamily: 'system-ui, sans-serif', color: '#14233b', background: '#ffffff', textAlign: 'center' }}>
        <title>Sebotse</title>
        {locales.map((l) => {
          const t = getDict(l);
          return (
            <div key={l} lang={htmlLang[l]}>
              <h1 style={{ margin: '0 0 0.25rem', fontSize: '1.5rem' }}>{t.errors.failed}</h1>
              <button type="button" onClick={() => retry()} style={{ minHeight: 44, padding: '0 1.25rem', border: 0, borderRadius: 999, background: '#f2b632', color: '#14233b', font: 'inherit', fontWeight: 600, cursor: 'pointer' }}>
                {t.errors.retry}
              </button>
            </div>
          );
        })}
      </body>
    </html>
  );
}
