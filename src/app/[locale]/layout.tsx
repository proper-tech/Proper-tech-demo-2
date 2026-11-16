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

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Params }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return (
    <html lang={htmlLang[locale]}>
      <body>
        <I18nProvider locale={locale} dict={getDict(locale)}>
          <Header />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
