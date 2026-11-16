import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FloorExperience } from '@/components/FloorExperience';
import { floors, getFloor } from '@/data/building';
import { fmt, getDict } from '@/i18n/config';

type Params = Promise<{ locale: string; tower: string; floor: string }>;

export const dynamicParams = false;
export const generateStaticParams = () => floors.map((f) => ({ tower: f.tower, floor: String(f.floor) }));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, tower, floor } = await params;
  return { title: fmt(getDict(locale).floor.title, { t: tower, n: floor }) };
}

export default async function FloorPage({ params }: { params: Params }) {
  const { tower, floor } = await params;
  const summary = getFloor(tower, Number(floor));
  if (!summary) notFound();
  return (
    <main>
      <FloorExperience tower={summary.tower} floor={summary.floor} />
    </main>
  );
}
