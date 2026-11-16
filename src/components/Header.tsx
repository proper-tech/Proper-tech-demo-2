'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { localeNames, locales } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';

export function Header() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  // "/en/floors/12" -> "/floors/12", so switching language keeps you on the same page.
  const rest = pathname.replace(/^\/[^/]+/, '');

  return (
    <header className="site-header">
      <Link href={`/${locale}`} className="brand">
        {t.site.name}
      </Link>
      <nav aria-label={t.site.name}>
        <Link href={`/${locale}#floors`}>{t.nav.floors}</Link>
        <Link href={`/${locale}#site`}>{t.home.siteHeading}</Link>
        <Link href={`/${locale}#layouts`}>{t.nav.layouts}</Link>
        <Link href={`/${locale}#video`}>{t.nav.video}</Link>
      </nav>
      <ul className="languages" aria-label={t.nav.language}>
        {locales.map((l) => (
          <li key={l}>
            <Link href={`/${l}${rest}`} lang={l} hrefLang={l} aria-current={l === locale ? 'true' : undefined}>
              {localeNames[l]}
            </Link>
          </li>
        ))}
      </ul>
    </header>
  );
}
