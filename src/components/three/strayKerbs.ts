import { BufferAttribute, Raycaster, Vector3, type Mesh, type Object3D } from 'three';

/**
 * The environment model has kerbs round every lawn, including where a lawn meets the open grass
 * beyond the site (west and south of block D): there the kerb is a white line running across the
 * grass with nothing to separate. This drops the kerb triangles that have grass on every side,
 * keeping those between grass and paving, road or sidewalk.
 */
export function removeStrayKerbs(root: Object3D) {
  const kerbs = root.getObjectByName('Env_Kerbs') as Mesh | undefined;
  if (!kerbs?.isMesh || kerbs.userData.trimmed) return;
  kerbs.userData.trimmed = true;
  root.updateWorldMatrix(true, true);

  const isGrass = (m: Mesh) => {
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    return /Lawn|Grass/i.test(mat.name) || /Lawn|Grass/i.test(m.name);
  };
  // the ground: every lawn (the lawns rise a little in places), and the thin meshes at ground level,
  // leaving out the kerbs, planter rims, road paint, people and the concrete base under the whole site
  const ground: Mesh[] = [];
  root.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh || m === kerbs || (o as { isSkinnedMesh?: boolean }).isSkinnedMesh) return;
    if (/Kerb|Planter|Lines|Marking|Zebra|Paint|SiteBase|Person/i.test(m.name)) return;
    if (isGrass(m)) return void ground.push(m);
    if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox!.clone().applyMatrix4(m.matrixWorld);
    if (b.max.y - b.min.y < 0.3 && b.max.y < 0.4) ground.push(m);
  });

  const ray = new Raycaster();
  ray.far = 2;
  const down = new Vector3(0, -1, 0);
  const at = new Vector3();
  /** What lies under a point: 'grass', 'hard' or nothing. */
  const under = (x: number, z: number) => {
    ray.set(at.set(x, 1, z), down);
    const hit = ray.intersectObjects(ground, false)[0];
    return hit ? (isGrass(hit.object as Mesh) ? 'grass' : 'hard') : 'none';
  };

  const g = kerbs.geometry;
  const pos = g.getAttribute('position');
  const index = g.getIndex();
  const n = index ? index.count / 3 : pos.count / 3;
  const vi = (t: number, k: number) => (index ? index.getX(t * 3 + k) : t * 3 + k);
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const keep: number[] = [];
  let dropped = 0;
  for (let t = 0; t < n; t++) {
    a.fromBufferAttribute(pos, vi(t, 0)).applyMatrix4(kerbs.matrixWorld);
    b.fromBufferAttribute(pos, vi(t, 1)).applyMatrix4(kerbs.matrixWorld);
    c.fromBufferAttribute(pos, vi(t, 2)).applyMatrix4(kerbs.matrixWorld);
    const cx = (a.x + b.x + c.x) / 3;
    const cz = (a.z + b.z + c.z) / 3;
    // across the kerb: square to the triangle's longest edge (the kerb's run), 0.5 m to either side
    let ex = b.x - a.x, ez = b.z - a.z;
    for (const [p, q] of [[b, c], [c, a]]) {
      const dx = q.x - p.x, dz = q.z - p.z;
      if (dx * dx + dz * dz > ex * ex + ez * ez) [ex, ez] = [dx, dz];
    }
    const len = Math.hypot(ex, ez) || 1;
    const px = (-ez / len) * 0.5, pz = (ex / len) * 0.5;
    const hard = under(cx + px, cz + pz) === 'hard' || under(cx - px, cz - pz) === 'hard';
    if (hard) keep.push(vi(t, 0), vi(t, 1), vi(t, 2));
    else dropped++;
  }
  if (!dropped) return;
  const Arr = pos.count > 65535 ? Uint32Array : Uint16Array;
  g.setIndex(new BufferAttribute(new Arr(keep), 1));
  g.computeBoundingSphere();
}
