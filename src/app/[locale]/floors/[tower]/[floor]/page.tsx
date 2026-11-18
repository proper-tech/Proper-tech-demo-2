import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FloorExperience } from '@/components/FloorExperience';
import { PodiumFloorExperience } from '@/components/PodiumFloorExperience';
import { floors, getFloor, towers } from '@/data/building';
import { floorName, getPodiumFloor, podiumFloors } from '@/data/podium';
import { ROOF_FLOOR } from '@/data/roof';
import type { TowerId } from '@/data/types';
import { fmt, getDict } from '@/i18n/config';

type Params = Promise<{ locale: string; tower: string; floor: string }>;

// Towers B and C (apartments, and the technical floor on the roof as floor 17), plus the podium,
// block A (floors 1-3 and the roof playground) and the basement under it all, A/B1.
export const dynamicParams = false;
export const generateStaticParams = () => [
  ...floors.map((f) => ({ tower: f.tower, floor: String(f.floor) })),
  ...towers.map((tower) => ({ tower, floor: String(ROOF_FLOOR) })),
  ...podiumFloors.map((f) => ({ tower: 'A', floor: floorName(f.floor) })),
];

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, tower, floor } = await params;
  const dict = getDict(locale);
  if (tower === 'A') return { title: floor === 'B1' ? dict.basement.title : fmt(dict.podium.title, { n: floor }) };
  if (Number(floor) === ROOF_FLOOR) return { title: fmt(dict.roof.title, { t: tower }) };
  return { title: fmt(dict.floor.title, { t: tower, n: floor }) };
}

export default async function FloorPage({ params }: { params: Params }) {
  const { tower, floor } = await params;
  if (tower !== 'A' && Number(floor) === ROOF_FLOOR) {
    return (
      <main>
        <PodiumFloorExperience floor={ROOF_FLOOR} tower={tower as TowerId} />
      </main>
    );
  }
  if (tower === 'A') {
    const podium = getPodiumFloor(floor === 'B1' ? 0 : Number(floor));
    if (!podium) notFound();
    return (
      <main>
        <PodiumFloorExperience floor={podium.floor} />
      </main>
    );
  }
  const summary = getFloor(tower, Number(floor));
  if (!summary) notFound();
  return (
    <main>
      <FloorExperience tower={summary.tower} floor={summary.floor} />
    </main>
  );
}
