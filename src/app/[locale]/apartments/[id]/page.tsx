import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApartmentExperience } from '@/components/ApartmentExperience';
import { getUnit, units } from '@/data/building';
import { fmt, getDict } from '@/i18n/config';

type Params = Promise<{ locale: string; id: string }>;

export const dynamicParams = false;
export const generateStaticParams = () => units.map((u) => ({ id: u.id }));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, id } = await params;
  return { title: fmt(getDict(locale).apt.title, { id }) };
}

export default async function ApartmentPage({ params }: { params: Params }) {
  const unit = getUnit((await params).id);
  if (!unit) notFound();
  return (
    <main>
      <ApartmentExperience unit={unit} />
    </main>
  );
}
