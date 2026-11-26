'use client';

import { useEffect, useRef, useState } from 'react';
import { EquirectangularReflectionMapping, MathUtils, PerspectiveCamera, Scene, SRGBColorSpace, Texture, TextureLoader, WebGLRenderer } from 'three';

// The drone's 360° photos (public/views/manifest.json) full screen: drag to look round, wheel to zoom, a button per
// tower and floor. The picture's middle is true north (plus the manifest's yaw), so bearing 0 is north; the compass
// shows where you are looking. Plain three.js, not the site's 3D views: it is a viewer for the photos themselves.

type Entry = { src: string; yaw: number };
type Manifest = Record<string, Record<string, Entry>>;

export function DroneView() {
  const host = useRef<HTMLDivElement>(null);
  const [views, setViews] = useState<{ key: string; label: string; entry: Entry }[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [bearing, setBearing] = useState(0);
  const apply = useRef<(entry: Entry) => void>(() => {});

  useEffect(() => {
    fetch('/views/manifest.json')
      .then((r) => r.json() as Promise<Manifest>)
      .then((m) => {
        const list = Object.entries(m).flatMap(([tower, floors]) =>
          Object.entries(floors).map(([floor, entry]) => ({ key: `${tower}${floor}`, label: `${tower} · ${floor}`, entry, n: Number(floor), tower })),
        );
        // one button per photo file: tower C reuses B's, so list each file once, with the tower that took it
        const seen = new Set<string>();
        const unique = list.filter((v) => (seen.has(v.entry.src) ? false : seen.add(v.entry.src))).sort((a, b) => a.n - b.n);
        setViews(unique);
        // start on the highest: the latest, widest view
        if (unique.length) setCurrent(unique[unique.length - 1].key);
      });
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new Scene();
    const camera = new PerspectiveCamera(70, 1, 0.1, 100);
    let lon = 0; // degrees clockwise from the picture's middle
    let lat = 0;
    let yaw = 0;
    let dirty = true;
    const size = () => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      dirty = true;
    };
    size();
    addEventListener('resize', size);

    apply.current = (entry) => {
      yaw = entry.yaw;
      new TextureLoader().load(entry.src, (t) => {
        t.mapping = EquirectangularReflectionMapping;
        t.colorSpace = SRGBColorSpace;
        if (scene.background instanceof Texture) scene.background.dispose();
        scene.background = t;
        dirty = true;
      });
    };

    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      renderer.domElement.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const k = camera.fov / el.clientHeight;
      lon -= (e.clientX - drag.x) * k;
      lat = MathUtils.clamp(lat + (e.clientY - drag.y) * k, -85, 85);
      drag = { x: e.clientX, y: e.clientY };
      dirty = true;
    };
    const up = () => (drag = null);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.fov = MathUtils.clamp(camera.fov + e.deltaY * 0.04, 20, 100);
      camera.updateProjectionMatrix();
      dirty = true;
    };
    const c = renderer.domElement;
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('wheel', wheel, { passive: false });

    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!dirty) return;
      dirty = false;
      // a camera at the origin; the picture's middle (north) lies at -z, so look along -z turned by lon
      const a = MathUtils.degToRad(lon - yaw);
      const p = MathUtils.degToRad(lat);
      camera.lookAt(Math.sin(a) * Math.cos(p), -Math.sin(p), -Math.cos(a) * Math.cos(p));
      renderer.render(scene, camera);
      setBearing(Math.round(((lon % 360) + 360) % 360));
    };
    loop();
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', size);
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('wheel', wheel);
      if (scene.background instanceof Texture) scene.background.dispose();
      renderer.dispose();
      el.removeChild(c);
    };
  }, []);

  useEffect(() => {
    const v = views.find((x) => x.key === current);
    if (v) apply.current(v.entry);
  }, [current, views]);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#111' }}>
      <div ref={host} style={{ position: 'absolute', inset: 0, cursor: 'grab', touchAction: 'none' }} />
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', color: '#fff', font: '14px system-ui' }}>
        {views.map((v) => (
          <button
            key={v.key}
            type="button"
            onClick={() => setCurrent(v.key)}
            aria-pressed={current === v.key}
            style={{ padding: '8px 14px', borderRadius: 999, border: '1px solid #fff6', background: current === v.key ? '#fff' : '#0008', color: current === v.key ? '#111' : '#fff', cursor: 'pointer' }}
          >
            Floor {v.label.split(' · ')[1]}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', background: '#0008', padding: '8px 14px', borderRadius: 999 }}>Looking {bearing}° (0 = north) · drag to look, scroll to zoom</span>
      </div>
    </div>
  );
}
