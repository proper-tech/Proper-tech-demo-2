'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  BackSide,
  LinearFilter,
  MathUtils,
  SRGBColorSpace,
  SphereGeometry,
  TextureLoader,
  Vector3,
  type Mesh,
  type PerspectiveCamera,
  type Texture,
} from 'three';
import { SafeCanvas } from './three/SafeCanvas';
import { useI18n } from '@/i18n/I18nProvider';
import { fmt } from '@/i18n/config';
import type { PanoTourData } from '@/data/blockDTour';

// A rendered 360° tour like the apartment tours (public/tour): a panorama per spot, rings to the next spots,
// a strip of spots at the bottom, the furnished top view with the spots and the way you look, zoom, rotate
// and full screen. Panoramas have east in the middle; a point (u east, v north, z up) seen from the camera
// lies along three's (-du, dz, dv), so compass heading h looks along (-sin h, 0, cos h).

const FOV = 75;
const FOV_MIN = 35;
const FOV_MAX = 95;

type View = { yaw: number; pitch: number; fov: number };

const toDir = (yaw: number, pitch: number) => new Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));

function Sphere({ texture }: { texture: Texture | null }) {
  const geometry = useMemo(() => {
    const g = new SphereGeometry(50, 96, 64);
    g.scale(-1, 1, 1);
    return g;
  }, []);
  const mesh = useRef<Mesh>(null);
  if (!texture) return null;
  return (
    <mesh ref={mesh} geometry={geometry}>
      {/* the sphere is turned inside out (scale -1), so its front faces look in */}
      <meshBasicMaterial map={texture} toneMapped={false} />
    </mesh>
  );
}

/** Points the camera, and moves the rings over the points they stand for. */
function Rig({ view, rings, points }: { view: React.RefObject<View>; rings: React.RefObject<(HTMLButtonElement | null)[]>; points: Vector3[] }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new Vector3(), []);
  useFrame(() => {
    const { yaw, pitch, fov } = view.current!;
    const cam = camera as PerspectiveCamera;
    if (cam.fov !== fov) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    cam.position.set(0, 0, 0);
    cam.lookAt(toDir(yaw, pitch));
    const dir = toDir(yaw, pitch);
    points.forEach((p, i) => {
      const el = rings.current?.[i];
      if (!el) return;
      v.copy(p).normalize();
      const front = v.dot(dir) > 0.15;
      v.copy(p).project(cam);
      if (!front || Math.abs(v.x) > 1.1 || Math.abs(v.y) > 1.1) {
        el.style.visibility = 'hidden';
        return;
      }
      el.style.visibility = 'visible';
      el.style.transform = `translate(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px) translate(-50%, -50%)`;
    });
  });
  return null;
}

export default function PanoTour({ tour, floorLabel }: { tour: PanoTourData; floorLabel: string }) {
  const { t } = useI18n();
  const p = t.blockD.pano;
  const name = (id: string) => (p.stops as Record<string, string>)[id] ?? id;
  const root = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(tour.stops[0].id);
  const stop = tour.stops.find((s) => s.id === current)!;
  const index = tour.stops.indexOf(stop);
  const view = useRef<View>({
    yaw: MathUtils.degToRad(stop.heading),
    pitch: -0.08,
    fov: FOV,
  });
  const [texture, setTexture] = useState<Texture | null>(null);
  const [loading, setLoading] = useState(true);
  const [fading, setFading] = useState(false);
  const [rotate, setRotate] = useState(false);
  const [plan, setPlan] = useState(true);
  const [big, setBig] = useState(false);
  const [heading, setHeading] = useState(stop.heading);
  const rings = useRef<(HTMLButtonElement | null)[]>([]);
  const cache = useRef(new Map<string, Texture>());

  const links = useMemo(() => tour.links[current] ?? [], [tour, current]);
  const points = useMemo(
    () => links.map((l) => new Vector3(-(l.point[0] - stop.at[0]), l.point[2] - tour.eye, l.point[1] - stop.at[1])),
    [links, stop, tour.eye],
  );

  // pictures: the small one first, then the 4K one; keep a few in memory
  useEffect(() => {
    let live = true;
    const loader = new TextureLoader();
    const prep = (tex: Texture) => {
      tex.colorSpace = SRGBColorSpace;
      tex.minFilter = LinearFilter;
      tex.generateMipmaps = false;
      return tex;
    };
    const hiKey = `${tour.base}/${current}.jpg`;
    const cached = cache.current.get(hiKey);
    if (cached) {
      setTexture(cached);
      setLoading(false);
      setFading(false);
      return;
    }
    setLoading(true);
    loader.load(`${tour.base}/${current}-lo.jpg`, (lo) => {
      if (!live) return;
      setTexture(prep(lo));
      setLoading(false);
      setFading(false);
      loader.load(hiKey, (hi) => {
        if (!live) {
          hi.dispose();
          return;
        }
        cache.current.set(hiKey, prep(hi));
        for (const [k, tex] of cache.current) {
          if (cache.current.size <= 4) break;
          if (k !== hiKey) {
            tex.dispose();
            cache.current.delete(k);
          }
        }
        setTexture(hi);
        lo.dispose();
      });
    });
    return () => {
      live = false;
    };
  }, [tour.base, current]);

  useEffect(() => () => cache.current.forEach((tex) => tex.dispose()), []);

  const go = useCallback(
    (id: string) => {
      if (id === current) return;
      const next = tour.stops.find((s) => s.id === id)!;
      setFading(true);
      // arrive looking the way you moved, unless the spot has its own view
      const from = stop.at;
      const moved = Math.atan2(next.at[0] - from[0], next.at[1] - from[1]);
      window.setTimeout(() => {
        view.current.yaw =
          Number.isFinite(moved) && Math.hypot(next.at[0] - from[0], next.at[1] - from[1]) > 0.5 ? moved : MathUtils.degToRad(next.heading);
        view.current.pitch = -0.08;
        setCurrent(id);
      }, 160);
    },
    [current, stop, tour.stops],
  );
  const step = (d: number) => go(tour.stops[(index + d + tour.stops.length) % tour.stops.length].id);

  // dragging, the wheel and the keys
  useEffect(() => {
    const el = root.current?.querySelector('.ptour-view') as HTMLElement | null;
    if (!el) return;
    let drag: { x: number; y: number; yaw: number; pitch: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = {
        x: e.clientX,
        y: e.clientY,
        yaw: view.current.yaw,
        pitch: view.current.pitch,
      };
      el.setPointerCapture(e.pointerId);
      setRotate(false);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const k = MathUtils.degToRad(view.current.fov) / el.clientHeight;
      view.current.yaw = drag.yaw - (e.clientX - drag.x) * k;
      view.current.pitch = MathUtils.clamp(drag.pitch + (e.clientY - drag.y) * k, -1.45, 1.45);
    };
    const up = () => (drag = null);
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      view.current.fov = MathUtils.clamp(view.current.fov + e.deltaY * 0.04, FOV_MIN, FOV_MAX);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return;
      if (e.key === 'ArrowLeft') view.current.yaw -= 0.12;
      else if (e.key === 'ArrowRight') view.current.yaw += 0.12;
      else if (e.key === 'ArrowUp') view.current.pitch = Math.min(1.45, view.current.pitch + 0.1);
      else if (e.key === 'ArrowDown') view.current.pitch = Math.max(-1.45, view.current.pitch - 0.1);
      else if (e.key === '+' || e.key === '=') zoom(-10);
      else if (e.key === '-') zoom(10);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);
  const zoom = (d: number) => (view.current.fov = MathUtils.clamp(view.current.fov + d, FOV_MIN, FOV_MAX));

  // turning by itself, and the view cone on the plan
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (rotate) view.current.yaw += dt * 0.12;
      const h = ((MathUtils.radToDeg(view.current.yaw) % 360) + 360) % 360;
      setHeading((old) => (Math.abs(old - h) > 1 ? h : old));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [rotate]);

  const fullscreen = () => {
    const el = root.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  const [u0, v0, u1, v1] = tour.top.rect;
  const W = u1 - u0;
  const Hh = v1 - v0;
  const cone = `M0 0 L${-Math.sin(0.5) * 4} ${-Math.cos(0.5) * 4} A4 4 0 0 1 ${Math.sin(0.5) * 4} ${-Math.cos(0.5) * 4} Z`;

  return (
    <div className="ptour" ref={root}>
      <div className="ptour-view">
        <SafeCanvas flat dpr={[1, 1.5]} camera={{ fov: FOV, near: 0.1, far: 200, position: [0, 0, 0] }}>
          <Sphere texture={texture} />
          <Rig view={view} rings={rings} points={points} />
        </SafeCanvas>
      </div>
      <div className={fading ? 'ptour-fade is-on' : 'ptour-fade'} />
      <div className="ptour-rings">
        {links.map((l, i) => (
          <button
            key={`${current}-${l.to}`}
            type="button"
            className="ptour-ring"
            ref={(el) => {
              rings.current[i] = el;
            }}
            onClick={() => go(l.to)}
          >
            <span className="ring" aria-hidden>
              <svg viewBox="0 0 24 24" width="22" height="22">
                <path
                  d="M6 13l6-6 6 6M6 19l6-6 6 6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="destination">{name(l.to)}</span>
          </button>
        ))}
      </div>

      <div className="ptour-tools">
        <button type="button" className="ptour-tool" onClick={() => zoom(10)} aria-label={p.zoomOut} title={p.zoomOut}>
          −
        </button>
        <button type="button" className="ptour-tool" onClick={() => zoom(-10)} aria-label={p.zoomIn} title={p.zoomIn}>
          +
        </button>
        <button type="button" className="ptour-tool" aria-pressed={rotate} onClick={() => setRotate((r) => !r)}>
          ↻ {p.rotate}
        </button>
        <button type="button" className="ptour-tool" aria-pressed={plan} onClick={() => setPlan((o) => !o)}>
          {p.top}
        </button>
        <button type="button" className="ptour-tool" onClick={fullscreen} aria-label={p.fullscreen} title={p.fullscreen}>
          ⛶
        </button>
      </div>

      <div className="ptour-intro">
        <h2>{name(current)}</h2>
        <p>{fmt(p.sub, { n: tour.stops.length })}</p>
      </div>

      {plan && (
        <div className={big ? 'ptour-plan is-big' : 'ptour-plan'}>
          <div className="ptour-plan-head">
            <b>{fmt(p.mapTitle, { f: floorLabel })}</b>
            <span>
              <button type="button" className="ptour-plan-btn" onClick={() => setBig((b) => !b)}>
                {big ? p.shrink : p.enlarge}
              </button>
              <button type="button" className="ptour-plan-btn is-x" onClick={() => setPlan(false)} aria-label={p.close}>
                ×
              </button>
            </span>
          </div>
          <svg className="ptour-map" viewBox={`${u0} ${-v1} ${W} ${Hh}`} role="img" aria-label={fmt(p.mapTitle, { f: floorLabel })}>
            <image href={tour.top.src} x={u0} y={-v1} width={W} height={Hh} preserveAspectRatio="none" />
            <g transform={`translate(${stop.at[0]} ${-stop.at[1]}) rotate(${heading})`}>
              <path className="ptour-cone" d={cone} />
            </g>
            {tour.stops.map((s, i) => (
              <g
                key={s.id}
                className={s.id === current ? 'ptour-dot is-here' : 'ptour-dot'}
                transform={`translate(${s.at[0]} ${-s.at[1]})`}
                onClick={() => go(s.id)}
              >
                <circle r="0.62" />
                <text dy="0.24">{i + 1}</text>
              </g>
            ))}
          </svg>
          <p className="ptour-plan-room">{name(current)}</p>
          <p className="ptour-plan-hint">{p.mapHint}</p>
        </div>
      )}

      <p className="ptour-help">{p.help}</p>
      <div className="ptour-dock">
        <button type="button" className="ptour-nav" onClick={() => step(-1)} aria-label={p.prev}>
          ‹
        </button>
        <div className="ptour-strip">
          {tour.stops.map((s) => (
            <button key={s.id} type="button" className={s.id === current ? 'is-on' : undefined} onClick={() => go(s.id)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${tour.base}/${s.id}-lo.jpg`} alt="" loading="lazy" />
              <span>{name(s.id)}</span>
            </button>
          ))}
        </div>
        <button type="button" className="ptour-nav" onClick={() => step(1)} aria-label={p.next}>
          ›
        </button>
      </div>
      <p className="ptour-quality">{p.quality}</p>
      {loading && <p className="ptour-loading">{p.loading}</p>}
    </div>
  );
}
