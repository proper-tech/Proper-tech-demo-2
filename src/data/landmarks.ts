import { blockDOutline, blockDToSite } from '@/data/blockD';
import { towerPlate } from '@/data/building';
import { podiumOutline } from '@/data/podium';
import type { Pt } from '@/lib/geometry';
import { toLonLat } from '@/lib/geo';

/** Places shown with the complex on the city map (LocationMap). [lon, lat]. */
export const landmarks = {
  // the middle of Chinggis (Sükhbaatar) Square
  square: [106.9176, 47.9189] as [number, number],
  // Wikidata Q33309063, Zaluuchuudyn Örgön Chölöö 5 / Beijing Street 2
  embassy: [106.92423, 47.92336] as [number, number],
};

/** The complex: the point between the two towers, and its blocks as map polygons with heights (m). */
export const sebotse = {
  centre: toLonLat([0, 0]),
  blocks: (() => {
    const ring = (pts: Pt[]) => {
      const r = pts.map(toLonLat);
      return [...r, r[0]];
    };
    const tower = (t: 'B' | 'C'): Pt[] => {
      const p = towerPlate(t);
      const c = 2.4;
      return [[p.u0 + c, p.v0], [p.u1 - c, p.v0], [p.u1, p.v0 + c], [p.u1, p.v1 - c], [p.u1 - c, p.v1], [p.u0 + c, p.v1], [p.u0, p.v1 - c], [p.u0, p.v0 + c]];
    };
    return [
      { id: 'A', base: 0, top: 11.7, ring: ring(podiumOutline as Pt[]) },
      { id: 'B', base: 11.7, top: 51.5, ring: ring(tower('B')) },
      { id: 'C', base: 11.7, top: 51.5, ring: ring(tower('C')) },
      { id: 'D', base: 0, top: 10.8, ring: ring(blockDOutline.map(blockDToSite)) },
    ];
  })(),
};
