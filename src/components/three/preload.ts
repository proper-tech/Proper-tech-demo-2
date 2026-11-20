// Start fetching what a floor's 3D view needs before it is on screen: its code (three.js and the
// scene, loaded on demand) and, for the tower floors, the furnished plan pictures laid on the
// apartments. Kept free of three.js imports itself, so calling it costs nothing up front.
import { photoModels } from '@/data/photoModels';

const started = new Set<string>();

export function preloadFloor3D(tower: string) {
  if (typeof window === 'undefined') return;
  const kind = tower === 'A' ? 'podium' : tower === 'D' ? 'blockD' : 'tower';
  if (started.has(kind)) return;
  started.add(kind);
  if (kind === 'podium') void import('./PodiumScene');
  else if (kind === 'blockD') void import('./DFloorScene');
  else {
    void import('./FloorScene');
    for (const m of Object.values(photoModels)) {
      if (!m) continue;
      const img = new Image();
      img.decoding = 'async';
      img.src = m.image.src;
    }
  }
}
