'use client';

import { useMemo } from 'react';
import { Color } from 'three';
import type { Finish, FurnitureItem } from '@/data/types';

// Furniture is built from boxes so the site works without any 3D model files.
// Every piece is drawn around its footprint centre, standing on the floor, facing +z.
// To use real models later, swap a case in <Piece> for a <primitive object={gltf.scene} />.

type V3 = [number, number, number];

function Box({ p, s, c, rough = 0.85 }: { p: V3; s: V3; c: string; rough?: number }) {
  return (
    <mesh position={p}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={rough} />
    </mesh>
  );
}

const WHITE = '#F3F2EE';
const mix = (color: string, target: string, amount: number) =>
  '#' + new Color(color).lerp(new Color(target), amount).getHexString();

function Legs({ w, d, h, c }: { w: number; d: number; h: number; c: string }) {
  return (
    <>
      {[-1, 1].flatMap((sx) =>
        [-1, 1].map((sz) => (
          <Box key={`${sx}${sz}`} p={[sx * (w / 2 - 0.05), h / 2, sz * (d / 2 - 0.05)]} s={[0.05, h, 0.05]} c={c} />
        )),
      )}
    </>
  );
}

function Chair({ p, turn = 0, wood, fabric }: { p: V3; turn?: number; wood: string; fabric: string }) {
  return (
    <group position={p} rotation={[0, turn, 0]}>
      <Legs w={0.42} d={0.42} h={0.43} c={wood} />
      <Box p={[0, 0.45, 0]} s={[0.44, 0.05, 0.44]} c={fabric} />
      <Box p={[0, 0.72, -0.2]} s={[0.44, 0.48, 0.04]} c={wood} />
    </group>
  );
}

function Seat({ w, fabric }: { w: number; fabric: string }) {
  const light = mix(fabric, '#ffffff', 0.12);
  const seats = w > 1.2 ? 2 : 1;
  const cushion = (w - 0.4) / seats;
  return (
    <>
      <Box p={[0, 0.2, 0.05]} s={[w, 0.4, 0.8]} c={fabric} />
      <Box p={[0, 0.55, -0.35]} s={[w, 0.56, 0.2]} c={fabric} />
      <Box p={[-(w / 2 - 0.09), 0.36, 0.05]} s={[0.18, 0.62, 0.8]} c={fabric} />
      <Box p={[w / 2 - 0.09, 0.36, 0.05]} s={[0.18, 0.62, 0.8]} c={fabric} />
      {Array.from({ length: seats }, (_, i) => (
        <Box key={i} p={[(i - (seats - 1) / 2) * cushion, 0.45, 0.1]} s={[cushion - 0.03, 0.1, 0.62]} c={light} />
      ))}
    </>
  );
}

function Bed({ w, wood, fabric }: { w: number; wood: string; fabric: string }) {
  const pillows = w > 1.2 ? [-w / 4, w / 4] : [0];
  return (
    <>
      <Box p={[0, 0.15, 0]} s={[w, 0.3, 2.05]} c={wood} />
      <Box p={[0, 0.41, 0.03]} s={[w - 0.08, 0.22, 1.95]} c={WHITE} />
      <Box p={[0, 0.55, -1]} s={[w, 1.1, 0.06]} c={wood} />
      {pillows.map((x) => (
        <Box key={x} p={[x, 0.58, -0.7]} s={[0.6, 0.12, 0.38]} c="#FFFFFF" />
      ))}
      <Box p={[0, 0.535, 0.36]} s={[w - 0.04, 0.05, 1.28]} c={fabric} />
    </>
  );
}

function Piece({ item, finish }: { item: FurnitureItem; finish: Finish }) {
  const { wood, fabric, cabinet } = finish;
  const dark = useMemo(() => mix(wood, '#000000', 0.25), [wood]);
  const w = item.w;

  switch (item.type) {
    case 'sofa':
      return <Seat w={w ?? 2} fabric={fabric} />;
    case 'armchair':
      return <Seat w={0.9} fabric={fabric} />;
    case 'coffeeTable':
      return (
        <>
          <Box p={[0, 0.36, 0]} s={[1, 0.05, 0.55]} c={wood} />
          <Legs w={1} d={0.55} h={0.34} c={dark} />
        </>
      );
    case 'tvUnit':
      return (
        <>
          <Box p={[0, 0.25, 0]} s={[1.6, 0.5, 0.4]} c={wood} />
          <Box p={[0, 1.1, -0.12]} s={[1.25, 0.72, 0.05]} c="#15181D" rough={0.3} />
        </>
      );
    case 'rug':
      return <Box p={[0, 0.008, 0]} s={[2.4, 0.016, 1.6]} c={mix(fabric, '#F1EEE6', 0.72)} rough={1} />;
    case 'diningTable': {
      const tw = w ?? 1.4;
      return (
        <>
          <Box p={[0, 0.74, 0]} s={[tw, 0.05, 0.8]} c={wood} />
          <Legs w={tw} d={0.8} h={0.72} c={dark} />
          {[-tw / 4, tw / 4].map((x) => (
            <group key={x}>
              <Chair p={[x, 0, -0.55]} wood={dark} fabric={fabric} />
              <Chair p={[x, 0, 0.55]} turn={Math.PI} wood={dark} fabric={fabric} />
            </group>
          ))}
        </>
      );
    }
    case 'bed':
      return <Bed w={1.6} wood={wood} fabric={fabric} />;
    case 'singleBed':
      return <Bed w={1} wood={wood} fabric={fabric} />;
    case 'nightstand':
      return (
        <>
          <Box p={[0, 0.25, 0]} s={[0.45, 0.5, 0.4]} c={wood} />
          <Box p={[0, 0.63, 0]} s={[0.16, 0.26, 0.16]} c="#F6E7BF" />
        </>
      );
    case 'wardrobe': {
      const ww = w ?? 1.8;
      const doors = Math.max(2, Math.round(ww / 0.6));
      return (
        <>
          <Box p={[0, 1.1, 0]} s={[ww, 2.2, 0.58]} c={wood} />
          {Array.from({ length: doors - 1 }, (_, i) => (
            <Box key={i} p={[-ww / 2 + ((i + 1) * ww) / doors, 1.1, 0.291]} s={[0.012, 2.14, 0.004]} c={dark} />
          ))}
        </>
      );
    }
    case 'desk':
      return (
        <>
          <Box p={[0, 0.74, 0]} s={[1.2, 0.04, 0.6]} c={wood} />
          <Box p={[-0.58, 0.36, 0]} s={[0.04, 0.72, 0.56]} c={wood} />
          <Box p={[0.58, 0.36, 0]} s={[0.04, 0.72, 0.56]} c={wood} />
          <Chair p={[0, 0, 0.5]} turn={Math.PI} wood={dark} fabric={fabric} />
        </>
      );
    case 'counter': {
      const cw = w ?? 2;
      return (
        <>
          <Box p={[0, 0.44, 0]} s={[cw, 0.88, 0.6]} c={cabinet} />
          <Box p={[0, 0.9, 0.01]} s={[cw + 0.02, 0.04, 0.63]} c="#DAD7D0" rough={0.5} />
          <Box p={[0, 1.9, -0.13]} s={[cw, 0.7, 0.34]} c={cabinet} />
          <Box p={[-cw / 4, 0.925, 0]} s={[0.5, 0.012, 0.4]} c="#9AA3AD" rough={0.3} />
          <Box p={[cw / 4, 0.925, 0]} s={[0.56, 0.012, 0.48]} c="#1B1D21" rough={0.3} />
        </>
      );
    }
    case 'fridge':
      return (
        <>
          <Box p={[0, 0.95, 0]} s={[0.6, 1.9, 0.65]} c="#C9CED3" rough={0.4} />
          <Box p={[0.22, 1.1, 0.33]} s={[0.03, 0.6, 0.02]} c="#8D959E" />
        </>
      );
    case 'bathtub':
      return (
        <>
          <Box p={[0, 0.28, 0]} s={[1.6, 0.56, 0.75]} c="#FFFFFF" rough={0.3} />
          <Box p={[0, 0.565, 0]} s={[1.44, 0.01, 0.6]} c="#CFE3EC" rough={0.2} />
        </>
      );
    case 'shower':
      return (
        <>
          <Box p={[0, 0.04, 0]} s={[0.9, 0.08, 0.9]} c="#FFFFFF" rough={0.3} />
          {(
            [
              [[0.45, 1.05, 0], [0.02, 2, 0.9]],
              [[0, 1.05, 0.45], [0.9, 2, 0.02]],
            ] as [V3, V3][]
          ).map(([p, s], i) => (
            <mesh key={i} position={p}>
              <boxGeometry args={s} />
              <meshStandardMaterial color="#BFD9E6" transparent opacity={0.3} roughness={0.1} />
            </mesh>
          ))}
        </>
      );
    case 'toilet':
      return (
        <>
          <Box p={[0, 0.6, -0.22]} s={[0.38, 0.4, 0.16]} c="#FFFFFF" rough={0.3} />
          <Box p={[0, 0.21, 0.05]} s={[0.36, 0.42, 0.5]} c="#FFFFFF" rough={0.3} />
          <Box p={[0, 0.44, 0.07]} s={[0.38, 0.03, 0.46]} c="#ECEFF1" rough={0.3} />
        </>
      );
    case 'vanity':
      return (
        <>
          <Box p={[0, 0.4, 0]} s={[0.8, 0.8, 0.48]} c={cabinet} />
          <Box p={[0, 0.82, 0]} s={[0.84, 0.05, 0.5]} c="#FFFFFF" rough={0.3} />
          <Box p={[0, 0.85, 0.02]} s={[0.45, 0.02, 0.3]} c="#D5E2E8" rough={0.2} />
          <Box p={[0, 1.5, -0.23]} s={[0.7, 0.8, 0.02]} c="#BCD2DE" rough={0.1} />
        </>
      );
    case 'plant':
      return (
        <>
          <mesh position={[0, 0.17, 0]}>
            <cylinderGeometry args={[0.17, 0.13, 0.34, 16]} />
            <meshStandardMaterial color="#B9B3A8" roughness={0.9} />
          </mesh>
          {(
            [
              [0, 0.72, 0, 0.3],
              [0.12, 1.02, 0.05, 0.24],
              [-0.1, 1.2, -0.04, 0.18],
            ] as number[][]
          ).map(([x, y, z, r], i) => (
            <mesh key={i} position={[x, y, z]}>
              <icosahedronGeometry args={[r, 1]} />
              <meshStandardMaterial color="#4F7A4B" roughness={1} flatShading />
            </mesh>
          ))}
        </>
      );
    case 'shelf': {
      const sw = w ?? 1.2;
      return (
        <>
          <Box p={[-sw / 2 + 0.015, 1, 0]} s={[0.03, 2, 0.4]} c={wood} />
          <Box p={[sw / 2 - 0.015, 1, 0]} s={[0.03, 2, 0.4]} c={wood} />
          {[0.1, 0.55, 1, 1.45, 1.9].map((y) => (
            <Box key={y} p={[0, y, 0]} s={[sw, 0.03, 0.4]} c={wood} />
          ))}
          {[0.24, 0.69, 1.14].map((y, i) => (
            <Box key={y} p={[(i - 1) * sw * 0.25, y, 0]} s={[0.4, 0.24, 0.3]} c={i === 1 ? '#C9CED3' : '#DDD6C8'} />
          ))}
        </>
      );
    }
    case 'shoeCabinet':
      return <Box p={[0, 0.5, 0]} s={[1, 1, 0.35]} c={wood} />;
  }
}

export function Furniture({ items, finish }: { items: FurnitureItem[]; finish: Finish }) {
  return (
    <>
      {items.map((item, i) => (
        <group key={i} position={[item.x, 0, item.z]} rotation={[0, ((item.rot ?? 0) * Math.PI) / 2, 0]}>
          <Piece item={item} finish={finish} />
        </group>
      ))}
    </>
  );
}
