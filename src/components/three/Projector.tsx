'use client';

import { useMemo, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3 } from 'three';

export interface Anchor {
  id: string;
  /** World position the label is pinned to. */
  position: [number, number, number];
}

export type LabelLayer = RefObject<HTMLDivElement | null>;

/** Pins ordinary HTML elements to points in the 3D scene. The labels live in the normal
 *  React tree (so they can use links, translations and state); each one carries a
 *  `data-anchor` id, and this component moves it to the matching point every frame. */
/** Puts a label at its screen point, pushed fully inside the view so none is cut in half. */
function place({ el, x, y, hw, hh }: { el: HTMLElement; x: number; y: number; hw: number; hh: number }, size: { width: number; height: number }) {
  const cx = Math.min(Math.max(x, hw), size.width - hw);
  const cy = Math.min(Math.max(y, hh), size.height - hh);
  el.style.transform = `translate(-50%, -50%) translate(${cx.toFixed(1)}px, ${cy.toFixed(1)}px)`;
}

export function Projector({ anchors, layer }: { anchors: Anchor[]; layer: LabelLayer }) {
  const v = useMemo(() => new Vector3(), []);
  const byId = useMemo(() => new Map(anchors.map((a) => [a.id, a.position])), [anchors]);

  useFrame(({ camera, size }) => {
    const root = layer.current;
    if (!root) return;
    // project every label to the screen first, then move overlapping ones apart, then place them
    const placed: { el: HTMLElement; x: number; y: number; hw: number; hh: number }[] = [];
    for (const el of root.children as HTMLCollectionOf<HTMLElement>) {
      const position = byId.get(el.dataset.anchor ?? '');
      if (!position) {
        el.style.visibility = 'hidden';
        continue;
      }
      v.set(...position).applyMatrix4(camera.matrixWorldInverse);
      const inFront = v.z < -0.1;
      v.applyMatrix4(camera.projectionMatrix);
      // hide labels whose point is off screen
      const onScreen = Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
      el.style.visibility = inFront && onScreen ? 'visible' : 'hidden';
      const item = { el, x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height, hw: el.offsetWidth / 2 + 4, hh: el.offsetHeight / 2 + 4 };
      if (inFront && onScreen) placed.push(item);
      else place(item, size);
    }
    // labels whose points are close (two small rooms side by side) would cover each other: push
    // each overlapping pair apart vertically, a few rounds, so every label stays readable
    for (let round = 0; round < 4; round++) {
      let moved = false;
      for (let i = 0; i < placed.length; i++) {
        for (let j = i + 1; j < placed.length; j++) {
          const a = placed[i];
          const b = placed[j];
          const dx = Math.abs(b.x - a.x);
          const dy = b.y - a.y;
          const needY = a.hh + b.hh - 4;
          if (dx >= a.hw + b.hw - 4 || Math.abs(dy) >= needY) continue;
          const push = (needY - Math.abs(dy)) / 2;
          const dir = dy > 0 || (dy === 0 && i < j) ? 1 : -1;
          a.y -= dir * push;
          b.y += dir * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    for (const item of placed) place(item, size);
  });

  return null;
}
