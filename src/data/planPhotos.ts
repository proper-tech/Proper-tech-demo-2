import type { PlanId } from './types';

/**
 * Furnished top views of each plan, cut from the rendered 360° tours (public/plans/<plan>.webp, north up).
 * w and h are the picture's size in metres; rooms give each room's rectangle in the picture (x, z, w, d in metres
 * from its top-left corner), by the room ids of src/data/layouts.ts. A, B and C are F, E and D mirrored.
 * Made by interior/tools/make_plans.py.
 */
export interface PlanPhoto {
  src: string;
  w: number;
  h: number;
  rooms: Record<string, [number, number, number, number]>;
}

export const planPhotos: Partial<Record<PlanId, PlanPhoto>> = {
  A: { src: '/plans/A.webp', w: 9.4, h: 10.3, rooms: { living: [0.35, 3.65, 7.9, 3.7], hall: [6.8, 7.5, 2.4, 2.45], bathroom: [5.3, 7.5, 1.35, 2.45], bedroom1: [1.9, 0.35, 2.9, 3.15], bedroom2: [4.95, 0.35, 3.3, 3.15], balcony: [0.35, 0.35, 1.4, 3.15] } },
  B: { src: '/plans/B.webp', w: 10.1, h: 7.3, rooms: { living: [0.35, 3.05, 7.75, 4.05], bedroom: [2.0, 0.35, 2.75, 2.55], bathroom: [8.25, 4.65, 1.5, 2.45], balcony: [0.35, 0.35, 1.5, 2.55] } },
  C: { src: '/plans/C.webp', w: 11.6, h: 10.4, rooms: { living: [7.45, 2.95, 3.8, 7.1], bathroom1: [4.3, 3.15, 1.35, 2.45], bathroom2: [5.8, 3.15, 1.5, 2.45], bedroom1: [0.35, 3.15, 3.8, 3.65], bedroom2: [1.65, 6.95, 4.65, 3.1], balcony: [0.35, 6.95, 1.15, 3.1] } },
  D: { src: '/plans/D.webp', w: 11.6, h: 10.4, rooms: { living: [0.35, 2.95, 3.8, 7.1], bathroom1: [5.95, 3.15, 1.35, 2.45], bathroom2: [4.3, 3.15, 1.5, 2.45], bedroom1: [7.45, 3.15, 3.8, 3.65], bedroom2: [5.3, 6.95, 4.65, 3.1], balcony: [10.1, 6.95, 1.15, 3.1] } },
  E: { src: '/plans/E.webp', w: 10.1, h: 7.3, rooms: { living: [2.0, 3.05, 7.75, 4.05], bedroom: [5.35, 0.35, 2.75, 2.55], bathroom: [0.35, 4.65, 1.5, 2.45], balcony: [8.25, 0.35, 1.5, 2.55] } },
  F: { src: '/plans/F.webp', w: 9.4, h: 10.3, rooms: { living: [1.15, 3.65, 7.9, 3.7], hall: [0.2, 7.5, 2.4, 2.45], bathroom: [2.75, 7.5, 1.35, 2.45], bedroom1: [4.6, 0.35, 2.9, 3.15], bedroom2: [1.15, 0.35, 3.3, 3.15], balcony: [7.65, 0.35, 1.4, 3.15] } },
};
