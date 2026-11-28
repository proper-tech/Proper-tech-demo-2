import type { Metadata } from 'next';
import '@fontsource-variable/geologica/index.css';
import '@fontsource-variable/golos-text/index.css';
import './globals.css';
import { getDict, htmlLang, localeNames, locales } from '@/i18n/config';

// An address that matches no page at all, usually one without a language (/foo, /floors/B/12). The root layout
// lives under [locale], so there is no layout to render this in and no way to know the visitor's language: the
// message is given in all three, each with a link to that language's home page.
export const metadata: Metadata = { title: '404 | Sebotse', robots: { index: false } };

export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body>
        <main className="status-page">
          <p className="status-code">404</p>
          {locales.map((l) => {
            const t = getDict(l);
            return (
              <section key={l} lang={htmlLang[l]} className="status-lang">
                <h1>{t.errors.notFound}</h1>
                <a className="pill pill-primary" href={`/${l}`}>
                  {t.errors.home} · {localeNames[l]}
                </a>
              </section>
            );
          })}
        </main>
      </body>
    </html>
  );
}
