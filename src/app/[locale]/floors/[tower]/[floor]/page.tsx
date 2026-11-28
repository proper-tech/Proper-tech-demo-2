import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FloorExperience } from '@/components/FloorExperience';
import { PodiumFloorExperience } from '@/components/PodiumFloorExperience';
import { getFloor } from '@/data/building';
import { getBlockDFloor } from '@/data/blockD';
import { getPodiumFloor } from '@/data/podium';
import { ROOF_FLOOR } from '@/data/roof';
import type { TowerId } from '@/data/types';
import { fmt, getDict } from '@/i18n/config';
import { pageMeta } from '@/lib/meta';
import { floorParams } from '@/lib/routes';

type Params = Promise<{ locale: string; tower: string; floor: string }>;

// The towers, the podium and its basement, and block D (the list is in lib/routes.ts, shared with the sitemap).
export const dynamicParams = false;
export const generateStaticParams = floorParams;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, tower, floor } = await params;
  const dict = getDict(locale);
  const meta = (title: string, description = dict.site.description) => pageMeta(locale, `/floors/${tower}/${floor}`, title, description);
  if (tower === 'A') return meta(floor === 'B1' ? dict.basement.title : fmt(dict.podium.title, { n: floor }));
  if (tower === 'D') return meta(floor === 'B1' ? dict.blockD.basementTitle : fmt(dict.blockD.title, { n: floor }));
  if (Number(floor) === ROOF_FLOOR) return meta(fmt(dict.roof.title, { t: tower }));
  const summary = getFloor(tower as TowerId, Number(floor));
  return meta(fmt(dict.floor.title, { t: tower, n: floor }), summary ? `${fmt(dict.home.aptN, { n: summary.units.length })}. ${dict.floor.lead}` : dict.floor.lead);
}

export default async function FloorPage({ params }: { params: Params }) {
  const { tower, floor } = await params;
  if (tower === 'D') {
    const d = getBlockDFloor(floor === 'B1' ? 0 : Number(floor));
    if (!d) notFound();
    return (
      <main>
        <PodiumFloorExperience floor={d.floor} block="D" />
      </main>
    );
  }
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
