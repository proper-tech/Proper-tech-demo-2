'use client';

import { useMemo } from 'react';
import { Color, CylinderGeometry, ExtrudeGeometry, Shape } from 'three';
import { products } from './surfaces';
import type { Finish, FurnitureItem } from '@/data/types';

// Furniture is built from boxes so the site works without any 3D model files.
// Every piece is drawn around its footprint centre, standing on the floor, facing +z.
// To use real models later, swap a case in <Piece> for a <primitive object={gltf.scene} />.

type V3 = [number, number, number];

function Box({ p, s, c, rough = 0.85 }: { p: V3; s: V3; c: string; rough?: number }) {
  return (
    <mesh position={p} castShadow receiveShadow>
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

/** Paint colours for the cars in block D. */
const PAINT = ['#C9CCD0', '#F2F2EF', '#1E2126', '#4A5058', '#7D8A99', '#8C2F2B', '#2D4A6B'];

/** A paint colour that looks random but is the same on every visit. */
const paintOf = (f: FurnitureItem) => PAINT[Math.floor((Math.abs(Math.sin(f.x * 12.9898 + f.z * 78.233) * 43758.5453) % 1) * PAINT.length)];

// A car from its side profile (length along z, height up), extruded across its width. Built once
// and shared by every car.
let carParts: { body: ExtrudeGeometry; cabin: ExtrudeGeometry; wheel: CylinderGeometry; rim: CylinderGeometry } | null = null;
function parts() {
  if (carParts) return carParts;
  const profile = (pts: [number, number][], depth: number) => {
    const s = new Shape();
    pts.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
    const g = new ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
    // extruded along +z: turn it so the profile's x runs along the car (z) and the extrusion across it (x)
    g.translate(0, 0, -depth / 2);
    g.rotateY(-Math.PI / 2);
    return g;
  };
  carParts = {
    // lower body: bumpers, bonnet and boot, wheel arches left as a flat sill
    body: profile([[-2.16, 0.24], [2.16, 0.24], [2.2, 0.5], [2.12, 0.72], [1.1, 0.86], [-1.95, 0.9], [-2.16, 0.82], [-2.2, 0.5]], 1.72),
    // glasshouse: windscreen, roof and rear window
    cabin: profile([[1.05, 0.86], [0.2, 1.36], [-1.15, 1.38], [-1.9, 0.9]], 1.5),
    wheel: new CylinderGeometry(0.33, 0.33, 0.22, 20).rotateZ(Math.PI / 2),
    rim: new CylinderGeometry(0.2, 0.2, 0.23, 12).rotateZ(Math.PI / 2),
  };
  return carParts;
}

/** A car facing +z, 4.4 m long and 1.8 m wide, standing at height y. */
function Car({ y = 0, paint }: { y?: number; paint: string }) {
  const g = parts();
  return (
    <group position={[0, y, 0]}>
      <mesh geometry={g.body} castShadow>
        <meshPhysicalMaterial color={paint} roughness={0.3} metalness={0.35} clearcoat={1} clearcoatRoughness={0.12} />
      </mesh>
      <mesh geometry={g.cabin} castShadow>
        <meshPhysicalMaterial color="#26323D" roughness={0.05} metalness={0.2} clearcoat={1} />
      </mesh>
      {/* roof panel over the glass */}
      <mesh position={[0, 1.39, -0.48]} castShadow>
        <boxGeometry args={[1.5, 0.05, 1.42]} />
        <meshPhysicalMaterial color={paint} roughness={0.3} metalness={0.35} clearcoat={1} clearcoatRoughness={0.12} />
      </mesh>
      {[-1, 1].flatMap((sx) =>
        [-1.35, 1.35].map((z) => (
          <group key={`${sx}${z}`} position={[sx * 0.8, 0.33, z]}>
            <mesh geometry={g.wheel}>
              <meshStandardMaterial color="#141518" roughness={0.9} />
            </mesh>
            <mesh geometry={g.rim}>
              <meshStandardMaterial color="#A9AFB6" roughness={0.3} metalness={0.8} />
            </mesh>
          </group>
        )),
      )}
      {/* head and tail lights, number plates */}
      {[-0.62, 0.62].map((x) => (
        <group key={x}>
          <mesh position={[x, 0.66, 2.17]}>
            <boxGeometry args={[0.36, 0.1, 0.06]} />
            <meshStandardMaterial color="#F4F7FA" emissive="#DDE8F2" emissiveIntensity={0.6} />
          </mesh>
          <mesh position={[x, 0.72, -2.16]}>
            <boxGeometry args={[0.34, 0.1, 0.06]} />
            <meshStandardMaterial color="#9E1B1B" emissive="#7A0F0F" emissiveIntensity={0.5} />
          </mesh>
        </group>
      ))}
      <Box p={[0, 0.4, 2.22]} s={[0.52, 0.12, 0.02]} c="#F4F4F4" rough={0.5} />
      <Box p={[0, 0.48, -2.22]} s={[0.52, 0.12, 0.02]} c="#F4F4F4" rough={0.5} />
    </group>
  );
}

/** Shop shelving, stocked on both faces; gw is the length (default 6 m). */
function Gondola({ gw }: { gw: number }) {
  const goods = useMemo(() => {
    const t = products().clone();
    t.repeat.set(gw / 1.2, 1);
    t.needsUpdate = true;
    return t;
  }, [gw]);
  return (
    <>
      <Box p={[0, 0.06, 0]} s={[gw, 0.12, 1]} c="#5B6672" />
      <Box p={[0, 0.85, 0]} s={[gw, 1.5, 0.08]} c="#E3E7EB" />
      {[0.35, 0.75, 1.15].flatMap((y) =>
        [-1, 1].map((side) => (
          <group key={`${y}${side}`}>
            <Box p={[0, y, side * 0.27]} s={[gw, 0.03, 0.46]} c="#C9CED3" />
            <mesh position={[0, y + 0.14, side * 0.27]} castShadow>
              <boxGeometry args={[gw - 0.1, 0.25, 0.36]} />
              <meshStandardMaterial map={goods} roughness={0.6} />
            </mesh>
          </group>
        )),
      )}
      {/* end panels */}
      {[-1, 1].map((sx) => (
        <Box key={sx} p={[sx * (gw / 2 + 0.02), 0.8, 0]} s={[0.04, 1.6, 1]} c="#2F6FDE" />
      ))}
    </>
  );
}

/** A two-post car lift, 5.0 × 3.2 m on the plan, with a car on it raised h metres. The four arms
 *  swing in from the posts to rubber pads under the car's sills, so the car rests on them; at h = 0
 *  the car stands on its wheels and the arms lie folded beside it. */
function CarLift({ h, paint }: { h: number; paint: string }) {
  const POST = 1.48;
  const up = h > 0.05;
  // the underside of the sills is 0.24 m above the bottom of the wheels
  const padTop = h + 0.24;
  const armY = up ? padTop - 0.09 : 0.08;
  const arms: { from: [number, number]; to: [number, number] }[] = [-1, 1].flatMap((sx) =>
    [-1, 1].map((sz) => ({
      from: [sx * (POST - 0.12), sz * 0.14] as [number, number],
      to: (up ? [sx * 0.62, sz * 0.95] : [sx * (POST - 0.2), sz * 1.25]) as [number, number],
    })),
  );
  return (
    <>
      {/* the posts, with their base plates and the carriages that ride up them */}
      {[-1, 1].map((sx) => (
        <group key={sx}>
          <Box p={[sx * POST, 0.01, 0]} s={[0.55, 0.02, 0.62]} c="#5B6672" />
          <Box p={[sx * POST, 1.9, 0]} s={[0.26, 3.8, 0.34]} c="#C0262D" rough={0.4} />
          <Box p={[sx * (POST + 0.18), 1.4, 0]} s={[0.1, 2.4, 0.12]} c="#8F1D22" />
          <Box p={[sx * (POST - 0.16), armY + 0.15, 0]} s={[0.12, 0.5, 0.42]} c="#3A4048" rough={0.4} />
          {/* lift controls on one post */}
          {sx === 1 && <Box p={[POST + 0.16, 1.2, 0.22]} s={[0.06, 0.2, 0.12]} c="#E8B931" />}
        </group>
      ))}
      {/* the beam across the top, with the safety bar */}
      <Box p={[0, 3.86, 0]} s={[2 * POST + 0.26, 0.14, 0.24]} c="#C0262D" rough={0.4} />
      {arms.map(({ from, to }, i) => {
        const [dx, dz] = [to[0] - from[0], to[1] - from[1]];
        const len = Math.hypot(dx, dz);
        return (
          <group key={i}>
            <mesh position={[(from[0] + to[0]) / 2, armY, (from[1] + to[1]) / 2]} rotation={[0, -Math.atan2(dz, dx), 0]} castShadow>
              <boxGeometry args={[len, 0.09, 0.14]} />
              <meshStandardMaterial color="#3A4048" roughness={0.45} metalness={0.4} />
            </mesh>
            {/* the pad under the sill */}
            <mesh position={[to[0], armY + 0.075, to[1]]}>
              <cylinderGeometry args={[0.07, 0.07, 0.06, 14]} />
              <meshStandardMaterial color="#141518" roughness={0.9} />
            </mesh>
          </group>
        );
      })}
      <Car y={up ? h : 0} paint={paint} />
      {/* yellow floor marking round the lift */}
      {[-1, 1].map((sz) => (
        <Box key={sz} p={[0, 0.004, sz * 2.5]} s={[3.2, 0.008, 0.08]} c="#E8B931" />
      ))}
      {[-1, 1].map((sx) => (
        <Box key={sx} p={[sx * 1.6, 0.004, 0]} s={[0.08, 0.008, 5.0]} c="#E8B931" />
      ))}
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
      return <Bed w={1.4} wood={wood} fabric={fabric} />; // a 1.4 x 2.0 m double, as in the plan pictures
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
    case 'desk': {
      // w is the length (default 1.2 m); a monitor on the long ones
      const dw = w ?? 1.2;
      return (
        <>
          <Box p={[0, 0.74, 0]} s={[dw, 0.04, 0.7]} c={wood} />
          <Box p={[-dw / 2 + 0.02, 0.36, 0]} s={[0.04, 0.72, 0.66]} c={wood} />
          <Box p={[dw / 2 - 0.02, 0.36, 0]} s={[0.04, 0.72, 0.66]} c={wood} />
          {dw > 1.4 && (
            <>
              <Box p={[0, 1.0, -0.22]} s={[0.56, 0.34, 0.03]} c="#1B1D21" rough={0.3} />
              <Box p={[0, 0.82, -0.25]} s={[0.06, 0.14, 0.06]} c="#3A4048" />
              <Box p={[0, 0.765, 0.08]} s={[0.45, 0.015, 0.15]} c="#2B2F36" />
            </>
          )}
          <Chair p={[0, 0, 0.55]} turn={Math.PI} wood={dark} fabric={fabric} />
        </>
      );
    }
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
    case 'gondola':
      return <Gondola gw={w ?? 6} />;
    case 'checkout':
      // till counter running along z: belt, till at the north end, cashier's seat beside it
      return (
        <>
          <Box p={[0, 0.45, 0]} s={[0.7, 0.9, 1.9]} c={cabinet} />
          <Box p={[-0.05, 0.91, 0.25]} s={[0.45, 0.02, 1.3]} c="#2B2F36" rough={0.4} />
          <Box p={[0.15, 1.05, -0.65]} s={[0.35, 0.25, 0.3]} c="#3A4048" rough={0.4} />
          <Box p={[0.65, 0.3, -0.45]} s={[0.4, 0.6, 0.4]} c={fabric} />
        </>
      );
    case 'chiller': {
      // open-front refrigerated cabinet against a wall, facing +z
      const cw = w ?? 2.4;
      return (
        <>
          <Box p={[0, 1.0, -0.12]} s={[cw, 2.0, 0.56]} c="#E8ECEF" />
          {['#5BC0DE', '#F7F7F7', '#5CB85C'].map((c, i) => (
            <Box key={c} p={[0, 0.5 + i * 0.45, 0.04]} s={[cw - 0.15, 0.28, 0.3]} c={c} />
          ))}
          <Box p={[0, 1.9, 0.12]} s={[cw, 0.2, 0.1]} c="#2F6FDE" />
        </>
      );
    }
    case 'rack': {
      // steel storage rack with boxes; w is the length (default 2 m)
      const rw = w ?? 2;
      return (
        <>
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => <Box key={`${sx}${sz}`} p={[sx * (rw / 2 - 0.03), 1.1, sz * 0.27]} s={[0.06, 2.2, 0.06]} c="#2F6FDE" />),
          )}
          {[0.15, 0.8, 1.45, 2.1].map((y) => (
            <Box key={y} p={[0, y, 0]} s={[rw, 0.04, 0.6]} c="#C9CED3" />
          ))}
          {[0.15, 0.8, 1.45].map((y, i) => (
            <Box key={y} p={[(i - 1) * rw * 0.2, y + 0.22, 0]} s={[rw * 0.55, 0.4, 0.5]} c="#C8A27A" />
          ))}
        </>
      );
    }
    case 'car':
      return <Car paint={paintOf(item)} />;
    case 'carLift':
      return <CarLift h={w ?? 1.7} paint={paintOf(item)} />;
    case 'pit':
      // the inspection pit itself is cut into the floor by the scene; this is its edge: a steel
      // angle frame and yellow-black warning paint round it, 1.16 × 4.57 m (1st-floor plan)
      return (
        <>
          {[-1, 1].map((sx) => (
            <Box key={`x${sx}`} p={[sx * 0.63, 0.006, 0]} s={[0.1, 0.012, 4.67]} c="#E8B931" />
          ))}
          {[-1, 1].map((sz) => (
            <Box key={`z${sz}`} p={[0, 0.006, sz * 2.33]} s={[1.36, 0.012, 0.1]} c="#E8B931" />
          ))}
        </>
      );
    case 'workbench': {
      // steel bench with a beech top and a vice, a pegboard of tools on the wall behind it
      const bw = w ?? 2;
      return (
        <>
          <Box p={[0, 0.88, 0]} s={[bw, 0.05, 0.75]} c="#C8A27A" rough={0.6} />
          <Box p={[0, 0.45, -0.05]} s={[bw - 0.05, 0.75, 0.62]} c="#4A5562" rough={0.5} />
          {Array.from({ length: Math.max(2, Math.round(bw / 0.6)) }, (_, i) => {
            const n = Math.max(2, Math.round(bw / 0.6));
            return <Box key={i} p={[-bw / 2 + ((i + 0.5) * bw) / n, 0.62, 0.27]} s={[bw / n - 0.04, 0.02, 0.01]} c="#2B2F36" />;
          })}
          <Box p={[bw / 2 - 0.25, 1.0, 0.25]} s={[0.18, 0.18, 0.22]} c="#2F6FDE" rough={0.4} />
          <Box p={[0, 1.6, -0.36]} s={[bw, 1.0, 0.02]} c="#D9D6CE" rough={0.8} />
          {[-0.6, -0.25, 0.1, 0.45, 0.8].filter((x) => Math.abs(x) < bw / 2 - 0.15).map((x, i) => (
            <Box key={x} p={[x, 1.45 + (i % 2) * 0.25, -0.33]} s={[0.05, 0.28 + (i % 3) * 0.06, 0.03]} c={i % 2 ? '#B03A2E' : '#3A4048'} rough={0.4} />
          ))}
        </>
      );
    }
    case 'toolChest':
      // red rolling tool cabinet with drawers
      return (
        <>
          <Box p={[0, 0.55, 0]} s={[0.72, 0.95, 0.48]} c="#B8312A" rough={0.35} />
          {[0.25, 0.42, 0.56, 0.7, 0.84].map((y) => (
            <Box key={y} p={[0, y, 0.245]} s={[0.66, 0.008, 0.01]} c="#2B2F36" />
          ))}
          <Box p={[0, 1.04, 0]} s={[0.74, 0.03, 0.5]} c="#2B2F36" rough={0.5} />
          {[-1, 1].flatMap((sx) => [-1, 1].map((sz) => <Box key={`${sx}${sz}`} p={[sx * 0.3, 0.04, sz * 0.18]} s={[0.07, 0.08, 0.07]} c="#141518" />))}
        </>
      );
    case 'tyres': {
      // steel rack of tyres standing on edge, two tiers; w is the length
      const tw = w ?? 2;
      const n = Math.floor(tw / 0.26);
      return (
        <>
          {[-1, 1].flatMap((sx) => [0, 1].map((k) => <Box key={`${sx}${k}`} p={[sx * (tw / 2 - 0.03), 0.9, k ? 0.27 : -0.27]} s={[0.05, 1.8, 0.05]} c="#2F6FDE" />))}
          {[0.12, 0.98].map((y) => (
            <group key={y}>
              <Box p={[0, y, 0]} s={[tw, 0.04, 0.6]} c="#9AA3AD" />
              {Array.from({ length: n }, (_, i) => (
                <mesh key={i} position={[-tw / 2 + 0.16 + i * 0.26, y + 0.35, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
                  <torusGeometry args={[0.24, 0.1, 8, 20]} />
                  <meshStandardMaterial color="#1A1B1E" roughness={0.9} />
                </mesh>
              ))}
            </group>
          ))}
        </>
      );
    }
    case 'drum':
      return (
        <mesh position={[0, 0.44, 0]} castShadow>
          <cylinderGeometry args={[0.29, 0.29, 0.88, 24]} />
          <meshStandardMaterial color="#2D5A88" roughness={0.45} metalness={0.3} />
        </mesh>
      );
    case 'extinguisher':
      // on a wall bracket, with its red sign above
      return (
        <>
          <mesh position={[0, 0.85, 0.12]} castShadow>
            <cylinderGeometry args={[0.08, 0.08, 0.5, 16]} />
            <meshStandardMaterial color="#C0262D" roughness={0.35} />
          </mesh>
          <Box p={[0, 1.15, 0.12]} s={[0.06, 0.1, 0.06]} c="#1E2126" />
          <Box p={[0, 1.65, 0.01]} s={[0.3, 0.3, 0.01]} c="#C0262D" rough={0.5} />
          <Box p={[0, 1.65, 0.016]} s={[0.12, 0.2, 0.004]} c="#FFFFFF" rough={0.5} />
        </>
      );
    case 'bench': {
      const bw = w ?? 1.8;
      return (
        <>
          <Box p={[0, 0.43, 0]} s={[bw, 0.06, 0.45]} c={wood} />
          {[-1, 1].map((sx) => (
            <Box key={sx} p={[sx * (bw / 2 - 0.15), 0.2, 0]} s={[0.08, 0.4, 0.4]} c="#3A4048" />
          ))}
        </>
      );
    }
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
