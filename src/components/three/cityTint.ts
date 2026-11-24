import { BufferAttribute, Color, type BufferGeometry, type Mesh, type MeshStandardMaterial } from 'three';

/**
 * The city round the site (city.glb) comes as one merged mesh per facade texture, so every brick building had the
 * same colour and the blocks read as one repeated print. Each building is a separate piece of that mesh (its walls
 * share vertices, buildings don't), so the pieces are found once (union-find over the triangles) and each gets its
 * own tint: a little lighter or darker, warmer or cooler, as real facades weather differently. The roofs get the
 * same treatment, a touch darker, with some gravel-dark and some light membrane roofs.
 */
function pieces(g: BufferGeometry): Int32Array {
  const n = g.attributes.position.count;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (a: number) => {
    while (parent[a] !== a) {
      parent[a] = parent[parent[a]];
      a = parent[a];
    }
    return a;
  };
  const join = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const index = g.index;
  if (index) for (let i = 0; i < index.count; i += 3) {
    join(index.getX(i), index.getX(i + 1));
    join(index.getX(i), index.getX(i + 2));
  }
  else for (let i = 0; i < n; i += 3) {
    join(i, i + 1);
    join(i, i + 2);
  }
  // pieces that only touch at a position (split UV seams) still belong together: join equal positions
  const pos = g.attributes.position;
  const seen = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const key = `${pos.getX(i).toFixed(2)},${pos.getY(i).toFixed(2)},${pos.getZ(i).toFixed(2)}`;
    const j = seen.get(key);
    if (j === undefined) seen.set(key, i);
    else join(i, j);
  }
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = find(i);
  return out;
}

/** A stable random number in [0, 1) for a piece, from its first vertex's position (the same building gets the
 *  same tint on its walls and its roof, which are separate meshes). */
function hash(x: number, z: number) {
  const s = Math.sin(Math.round(x) * 12.9898 + Math.round(z) * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

export function tintCity(mesh: Mesh) {
  const g = mesh.geometry;
  if (g.attributes.color) return;
  const m = mesh.material as MeshStandardMaterial;
  const roof = /Roof/i.test(m.name);
  const root = pieces(g);
  const pos = g.attributes.position;
  // one tint per piece, keyed by the piece's lowest corner (shared by its walls and its roof)
  const corner = new Map<number, [number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const r = root[i];
    const c = corner.get(r);
    const x = pos.getX(i);
    const z = pos.getZ(i);
    if (!c || x + z < c[0] + c[1]) corner.set(r, [x, z]);
  }
  const tint = new Map<number, Color>();
  const warm = new Color('#ffe6cc');
  const cool = new Color('#dde8ff');
  for (const [r, [x, z]] of corner) {
    const a = hash(x, z);
    const b = hash(z + 17, x - 5);
    const c = new Color(1, 1, 1).lerp(a < 0.5 ? warm : cool, Math.abs(a - 0.5) * 1.2);
    const light = roof ? (b < 0.15 ? 0.55 : b > 0.85 ? 1.25 : 0.8 + 0.25 * b) : 0.68 + 0.55 * b;
    tint.set(r, c.multiplyScalar(light));
  }
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = tint.get(root[i])!;
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new BufferAttribute(colors, 3));
  m.vertexColors = true;
  m.needsUpdate = true;
}
