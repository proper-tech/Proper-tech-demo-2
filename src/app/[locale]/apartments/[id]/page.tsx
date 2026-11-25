import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ApartmentExperience } from '@/components/ApartmentExperience';
import { getUnit, units } from '@/data/building';
import { layouts } from '@/data/layouts';
import { fmt, getDict } from '@/i18n/config';
import { layoutArea, m } from '@/lib/geometry';
import { pageMeta } from '@/lib/meta';

type Params = Promise<{ locale: string; id: string }>;

export const dynamicParams = false;
export const generateStaticParams = () => units.map((u) => ({ id: u.id }));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, id } = await params;
  const t = getDict(locale);
  const unit = getUnit(id)!;
  const layout = layouts[unit.layout];
  // "2 bedrooms, 67.9 m², Plan C · Block B, floor 12"
  const plan = fmt(t.apt.planN, { p: unit.plan });
  const description = `${t.beds[layout.bedrooms as 1 | 2 | 3]}, ${m(layoutArea(layout))} m², ${plan} · ${fmt(t.apt.backToFloor, { t: unit.tower, n: unit.floor })}`;
  return pageMeta(locale, `/apartments/${id}`, fmt(t.apt.title, { id }), description, { ownImage: true });
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
