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
export function Projector({ anchors, layer }: { anchors: Anchor[]; layer: LabelLayer }) {
  const v = useMemo(() => new Vector3(), []);
  const byId = useMemo(() => new Map(anchors.map((a) => [a.id, a.position])), [anchors]);

  useFrame(({ camera, size }) => {
    const root = layer.current;
    if (!root) return;
    for (const el of root.children as HTMLCollectionOf<HTMLElement>) {
      const position = byId.get(el.dataset.anchor ?? '');
      if (!position) {
        el.style.visibility = 'hidden';
        continue;
      }
      v.set(...position).applyMatrix4(camera.matrixWorldInverse);
      const inFront = v.z < -0.1;
      v.applyMatrix4(camera.projectionMatrix);
      // hide labels whose point is off screen; push the rest fully inside so none is cut in half
      const onScreen = Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
      el.style.visibility = inFront && onScreen ? 'visible' : 'hidden';
      const hw = el.offsetWidth / 2 + 4;
      const hh = el.offsetHeight / 2 + 4;
      const x = Math.min(Math.max((v.x * 0.5 + 0.5) * size.width, hw), size.width - hw);
      const y = Math.min(Math.max((-v.y * 0.5 + 0.5) * size.height, hh), size.height - hh);
      el.style.transform = `translate(-50%, -50%) translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    }
  });

  return null;
}
