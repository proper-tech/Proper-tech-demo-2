'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { localeNames, locales } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';

// The name on the left; on the right the language switch, the one thing a buyer comes for ("Choose your
// floor") and a menu with every section. On the home page it floats over the film (transparent until the
// film's chapters have scrolled past, see Motion.tsx); elsewhere it is a solid sticky bar. The menu is a
// <details>, so it works without JavaScript.
export function Header() {
  const { locale, t } = useI18n();
  const pathname = usePathname();
  // "/en/floors/12" -> "/floors/12", so switching language keeps you on the same page.
  const rest = pathname.replace(/^\/[^/]+/, '');
  const home = rest === '' || rest === '/';

  return (
    <header className={`site-header${home ? ' is-over' : ''}`}>
      <Link href={`/${locale}`} className="brand">
        {/* the badge (public/logo, cut out of the logo artwork); the name beside it is the link's text */}
        <img className="brand-logo" src="/logo/sebotse-96.png" alt="" width={40} height={40} />
        {t.site.name}
      </Link>
      <div className="header-end">
        <ul className="languages" aria-label={t.nav.language}>
          {locales.map((l) => (
            <li key={l}>
              <Link href={`/${l}${rest}`} lang={l} hrefLang={l} aria-current={l === locale ? 'true' : undefined}>
                {localeNames[l]}
              </Link>
            </li>
          ))}
        </ul>
        <Link className="pill pill-primary header-cta" href={`/${locale}#floors`}>
          {t.hero.toFloors}
        </Link>
        <details className="header-menu">
          <summary aria-label={t.nav.menu}>
            <span />
          </summary>
          {/* a link to a section of this page doesn't navigate, so close the menu by hand */}
          <nav className="header-sheet" aria-label={t.site.name} onClick={(e) => ((e.currentTarget.parentElement as HTMLDetailsElement).open = false)}>
            <Link href={`/${locale}#floors`}>{t.nav.floors}</Link>
            <Link href={`/${locale}#explore`}>{t.nav.explore}</Link>
            <Link href={`/${locale}#layouts`}>{t.nav.layouts}</Link>
            <Link href={`/${locale}#site`}>{t.home.siteHeading}</Link>
            <Link href={`/${locale}#video`}>{t.nav.video}</Link>
            <Link href={`/${locale}#contact`}>{t.nav.contact}</Link>
          </nav>
        </details>
      </div>
    </header>
  );
}
