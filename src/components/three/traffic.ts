import { useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Object3D } from 'three';

/** Town speed, metres per second (45 km/h). Every car drives at it, so cars sharing a lane never
 *  catch each other up. */
const SPEED = 12.5;
/** How far the main road runs on either side of the site before the cars start again from the
 *  other end, out of sight among the buildings. The road is nearly straight that far
 *  (scripts/osm-surroundings.json). */
const REACH = 450;
/** The real secondary street two blocks east of the east street, from the main road south (scene x, z; from
 *  scripts/osm-surroundings.json, map data © OpenStreetMap contributors), 11 m wide. */
const SOUTH_STREET: P[] = [[102, -38], [102, -25], [97, 100], [97, 106], [95, 155], [95, 160], [92, 251], [92, 270]];
/** The 5 m street behind the east street's end, from west of it east to the secondary street: two map pieces
 *  joined across (EXTRA_ROADS in scripts/build-film.py, which also carries the east street on to it). */
const SIDE_STREET: P[] = [[0.5, 103.4], [44.6, 108.7], [81.4, 106.9], [96.8, 105.8]];
/** Lanes: a quarter of the street's width right of its middle (right-hand traffic). */
const SOUTH_LANE = 11 / 4;
const SIDE_LANE = 5 / 4;
/** Each moving car drives with copies of itself (sharing its mesh), spread evenly along its route: the routes
 *  run far past the site, so on their own the cars would seldom be in view. Each copy is another car to draw
 *  (about 31k triangles). */
const COPIES = 3;
/** Main-road cars in the kerb lane eastbound, which the east-street routes share: they drive those routes, so
 *  no two routes overlap in a lane (cars on one route at one speed keep their distance). */
const KERB = ['Env_MainTraffic_01', 'Env_MainTraffic_04'];

type P = [number, number]; // scene x, z

/** A route through waypoints with the corners rounded off (radius r, less on short legs): the points
 *  and the distance along it to each. */
function route(way: P[], r = 6) {
  const pts: P[] = [way[0]];
  for (let i = 1; i < way.length - 1; i++) {
    const [a, b, c] = [way[i - 1], way[i], way[i + 1]];
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const bc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const k = Math.min(r, ab / 2, bc / 2);
    const p0: P = [b[0] + ((a[0] - b[0]) * k) / ab, b[1] + ((a[1] - b[1]) * k) / ab];
    const p1: P = [b[0] + ((c[0] - b[0]) * k) / bc, b[1] + ((c[1] - b[1]) * k) / bc];
    // a quadratic Bézier with the corner as its control point
    for (let j = 0; j <= 8; j++) {
      const t = j / 8, u = 1 - t;
      pts.push([u * u * p0[0] + 2 * u * t * b[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * b[1] + t * t * p1[1]]);
    }
  }
  pts.push(way[way.length - 1]);
  const at = [0];
  for (let i = 1; i < pts.length; i++) at.push(at[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return { pts, at, length: at[at.length - 1] };
}
type Route = ReturnType<typeof route>;

/** A lane: a street's middle line moved d metres to the right of the way it is driven. */
function rightLane(street: P[], d: number): P[] {
  return street.map(([x, z], i): P => {
    const [a, b] = i ? [street[i - 1], street[i]] : [street[0], street[1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return [x - ((b[1] - a[1]) / len) * d, z + ((b[0] - a[0]) / len) * d];
  });
}

/** Where segment a-b crosses segment c-d, if it does. */
function cross(a: P, b: P, c: P, d: P): P | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (!den) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}

/** Lanes driven one after the other, each joined to the next where they cross (what lies past the crossing is
 *  left out). Every lane is first lengthened 8 m at both ends, so one that stops in the middle of a street still
 *  reaches the lane across it. Null when two lanes never cross. */
function chain(lanes: P[][]): P[] | null {
  const stretch = (l: P[]): P[] => {
    const out = (p: P, q: P): P => {
      const d = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1;
      return [p[0] + ((p[0] - q[0]) / d) * 8, p[1] + ((p[1] - q[1]) / d) * 8];
    };
    return [out(l[0], l[1]), ...l, out(l[l.length - 1], l[l.length - 2])];
  };
  let way = stretch(lanes[0]);
  for (const next of lanes.slice(1)) {
    const b = stretch(next);
    let joined: P[] | null = null;
    // the crossing nearest the end of the way so far, which is the lane just added
    for (let i = way.length - 2; i >= 0 && !joined; i--) {
      for (let j = 0; j < b.length - 1 && !joined; j++) {
        const x = cross(way[i], way[i + 1], b[j], b[j + 1]);
        if (x) joined = [...way.slice(0, i + 1), x, ...b.slice(j + 1)];
      }
    }
    if (!joined) return null;
    way = joined;
  }
  return way;
}

/** Distance along the route of the point nearest (x, z). */
function nearest({ pts, at }: Route, x: number, z: number) {
  let best = Infinity, s = 0;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1], pts[i]];
    const len = at[i] - at[i - 1];
    if (!len) continue;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / len ** 2));
    const d = Math.hypot(a[0] + (b[0] - a[0]) * t - x, a[1] + (b[1] - a[1]) * t - z);
    if (d < best) [best, s] = [d, at[i - 1] + t * len];
  }
  return s;
}

/** Puts the car at distance s along the route, nose (its local +x) forward. */
function place(car: Object3D, { pts, at, length }: Route, s: number) {
  s = ((s % length) + length) % length;
  let i = 1;
  while (i < at.length - 1 && at[i] <= s) i++;
  const [a, b] = [pts[i - 1], pts[i]];
  const t = (s - at[i - 1]) / (at[i] - at[i - 1] || 1);
  car.position.x = a[0] + (b[0] - a[0]) * t;
  car.position.z = a[1] + (b[1] - a[1]) * t;
  car.rotation.set(0, Math.atan2(-(b[1] - a[1]), b[0] - a[0]), 0);
}

/**
 * Traffic for the street model (environment.glb): its moving cars drive instead of standing still.
 * Main-road cars (Env_MainTraffic_*) go straight on along their lane, both ways, for REACH metres each side
 * of the site, then start again from the far end. The east-street cars (Env_Traffic_*), with the main road's
 * eastbound kerb lane (KERB), drive through the east street both ways:
 *  - south: east along the kerb lane, right down the east street to the street behind it (SIDE_STREET), left
 *    to the secondary street (SOUTH_STREET), right and away south;
 *  - north: up the secondary street from the far south, left along the street behind, right up the east
 *    street, right onto the main road and away east.
 * Each starts again from its far end, out of sight. The parked cars (Env_Car_*) stay parked.
 */
export function useTraffic(root: Object3D) {
  const cars = useMemo(() => {
    const lane = (name: string) => {
      const o = root.getObjectByName(name);
      if (!o) return null;
      const d = new Vector3(1, 0, 0).applyQuaternion(o.quaternion); // the car's nose
      return { o, p: [o.position.x, o.position.z] as P, d: [d.x, d.z] as P };
    };
    const out: { o: Object3D; r: Route; s0: number }[] = [];
    /** The car and its copies, evenly spaced along the route. Copies are named after it (`name~k`) and reused,
     *  as the loaded model is cached and this can run again on it. */
    const drive = (o: Object3D, r: Route, s0: number) => {
      for (let k = 0; k < COPIES; k++) {
        let c = k ? root.getObjectByName(`${o.name}~${k}`) : o;
        if (!c) {
          c = o.clone();
          c.name = `${o.name}~${k}`;
          o.parent?.add(c);
        }
        out.push({ o: c, r, s0: s0 + (k * r.length) / COPIES });
      }
    };

    for (let i = 1; i <= 10; i++) {
      const name = `Env_MainTraffic_${String(i).padStart(2, '0')}`;
      const c = KERB.includes(name) ? null : lane(name);
      if (!c) continue;
      const { p, d } = c;
      drive(c.o, route([[p[0] - d[0] * REACH, p[1] - d[1] * REACH], [p[0] + d[0] * REACH, p[1] + d[1] * REACH]]), REACH);
    }

    // the east street's two routes, from the lanes the street model's cars stand in (the main road's kerb lane,
    // the east street's southbound and northbound lanes) and the lanes of the streets past it
    const [kerb, south, north] = [lane('Env_MainTraffic_04'), lane('Env_Traffic_01'), lane('Env_Traffic_03')];
    if (kerb && south && north) {
      const atX = (l: { p: P; d: P }, x: number): P => [x, l.p[1] + (l.d[1] * (x - l.p[0])) / l.d[0]];
      const atZ = (l: { p: P; d: P }, z: number): P => [l.p[0] + (l.d[0] * (z - l.p[1])) / l.d[1], z];
      const back = (l: P[]) => [...l].reverse();
      const kerbLane = [atX(kerb, kerb.p[0] - REACH), atX(kerb, kerb.p[0] + REACH)];
      const ways: [string[], P[] | null][] = [
        [['Env_MainTraffic_01', 'Env_Traffic_01', 'Env_Traffic_02'],
          chain([kerbLane, [atZ(south, -60), atZ(south, 130)], rightLane(SIDE_STREET, SIDE_LANE), rightLane(SOUTH_STREET, SOUTH_LANE)])],
        [['Env_MainTraffic_04', 'Env_Traffic_03', 'Env_Traffic_04'],
          chain([rightLane(back(SOUTH_STREET), SOUTH_LANE), rightLane(back(SIDE_STREET), SIDE_LANE), [atZ(north, 130), atZ(north, -60)], kerbLane])],
      ];
      for (const [names, way] of ways) {
        if (!way) continue; // the lanes no longer meet (a street changed): those cars stay where they stand
        const r = route(way);
        for (const name of names) {
          const c = lane(name);
          if (c) drive(c.o, r, nearest(r, c.p[0], c.p[1]));
        }
      }
    }
    return out;
  }, [root]);

  useFrame(({ clock }) => {
    const s = clock.elapsedTime * SPEED;
    for (const c of cars) place(c.o, c.r, c.s0 + s);
  });
}
