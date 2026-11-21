import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import '@fontsource-variable/geologica/index.css';
import '@fontsource-variable/golos-text/index.css';
import '../globals.css';
import { Header } from '@/components/Header';
import { getDict, htmlLang, isLocale, locales } from '@/i18n/config';
import { I18nProvider } from '@/i18n/I18nProvider';

type Params = Promise<{ locale: string }>;

export const dynamicParams = false;
export const generateStaticParams = () => locales.map((locale) => ({ locale }));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const t = getDict((await params).locale);
  return { title: { default: t.site.name, template: `%s | ${t.site.name}` }, description: t.site.description };
}

export default async function LocaleLayout({ children, modal, params }: { children: ReactNode; modal: ReactNode; params: Params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={htmlLang[locale]} suppressHydrationWarning>
      <head>
        {/* Before the first paint: html.js-motion turns on the home page's reveal styles (Motion.tsx) unless
            the visitor asked for reduced motion. Failsafe: if Motion.tsx hasn't started within 4 s (script
            error, blocked JS, a page without it), the class goes again so nothing stays hidden. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'var h=document.documentElement;if(!matchMedia("(prefers-reduced-motion: reduce)").matches){h.classList.add("js-motion");' +
              'setTimeout(function(){if(!h.classList.contains("motion-ok"))h.classList.remove("js-motion")},4000)}',
          }}
        />
      </head>
      <body>
        <I18nProvider locale={locale} dict={getDict(locale)}>
          <Header />
          {children}
          {modal}
        </I18nProvider>
      </body>
    </html>
  );
}
