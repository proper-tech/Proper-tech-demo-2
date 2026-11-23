'use client';

import { useEffect, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap, Marker, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { landmarks, sebotse, type LandmarkId } from '@/data/landmarks';
import { distance } from '@/lib/geo';
import { fmt } from '@/i18n/config';
import { useI18n } from '@/i18n/I18nProvider';

// Where the complex is, as a flight over the city map: Ulaanbaatar from above, then Chinggis
// (Sükhbaatar) Square and the Embassy of China lit up in turn, then down onto the complex, drawn in 3D
// in amber among the city's buildings. Plays once when it comes into view; the steps can be picked
// again by hand. The map is OpenFreeMap's (OpenStreetMap data, no key); if it can't be reached, a
// plain map with only the complex and the places stands in.

const STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const AMBER = '#F2B632';
const BLUE = '#2F6FDE';

type StepId = 'city' | LandmarkId | 'sebotse';
const STEPS: { id: StepId; center: [number, number]; zoom: number; pitch: number; bearing: number }[] = [
  { id: 'city', center: [106.917, 47.919], zoom: 12.2, pitch: 0, bearing: 0 },
  { id: 'square', center: landmarks.square, zoom: 15.8, pitch: 50, bearing: -18 },
  { id: 'embassy', center: landmarks.embassy, zoom: 16.2, pitch: 52, bearing: 24 },
  { id: 'school', center: landmarks.school, zoom: 16.6, pitch: 55, bearing: 10 },
  { id: 'roundabout', center: landmarks.roundabout, zoom: 16.6, pitch: 55, bearing: -20 },
  { id: 'sebotse', center: sebotse.centre, zoom: 17.4, pitch: 62, bearing: -35 },
];
const PLACES = Object.keys(landmarks) as LandmarkId[];
/** Tags shown over the whole city: the places near the complex would pile up on it at that zoom. */
const CITY_TAGS: (LandmarkId | 'sebotse')[] = ['square', 'embassy', 'sebotse'];
/** The ring round each place, metres. */
const RING: Record<LandmarkId | 'sebotse', number> = { square: 170, embassy: 90, school: 70, roundabout: 60, sebotse: 110 };
const isPlace = (id: StepId): id is LandmarkId => id in landmarks;
const FLY = 3800;
const HOLD = 2600;

/** A plain map for when the tiles can't be reached: a ground, and our own layers on it. */
const FALLBACK: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'ground', type: 'background', paint: { 'background-color': '#e9edf0' } }],
};

/** Circle radius in pixels that stays `m` metres on the ground at every zoom. */
const metres = (m: number, lat: number) => {
  const at22 = m / ((156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** 22);
  return ['interpolate', ['exponential', 2], ['zoom'], 0, at22 / 2 ** 22, 22, at22] as unknown as number;
};

export function LocationMap() {
  const { t, locale } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const [step, setStep] = useState<StepId>('city');
  const [playing, setPlaying] = useState(false);
  const [near, setNear] = useState(false);
  const run = useRef(0);

  const km = (to: [number, number]) => {
    const d = distance(sebotse.centre, to);
    // by car in town, about 20 km/h door to door
    return fmt(t.location.away, { km: (d / 1000).toFixed(1), min: Math.max(2, Math.round((d / 1000 / 20) * 60)) });
  };

  // mount the map once the section is near the screen
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: '400px' });
    io.observe(node);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!near || !el.current) return;
    let cancelled = false;
    const markers: Marker[] = [];
    const cleanups: (() => void)[] = [];
    let raf = 0;
    (async () => {
      const maplibre = await import('maplibre-gl');
      if (cancelled || !el.current) return;
      // the worker file is copied to public/ (scripts/copy-maplibre-worker.mjs); the bundle loses its own copy
      maplibre.setWorkerUrl('/maplibre-gl-worker.mjs');
      const m = new maplibre.Map({
        container: el.current,
        style: STYLE,
        center: STEPS[0].center,
        zoom: STEPS[0].zoom,
        pitch: 0,
        attributionControl: { compact: true },
        cooperativeGestures: true,
        maxPitch: 75,
      });
      map.current = m;
      m.addControl(new maplibre.NavigationControl({ visualizePitch: true }), 'top-right');
      // the tiles' server out of reach (an error, or nothing after 8 s): a plain map, our layers on it
      let fellBack = false;
      const fallBack = () => {
        if (fellBack || m.getSource('sebotse')) return;
        fellBack = true;
        m.setStyle(FALLBACK);
      };
      m.on('error', () => !m.isStyleLoaded() && fallBack());
      const slow = setTimeout(fallBack, 8000);
      m.once('load', () => clearTimeout(slow));
      cleanups.push(() => clearTimeout(slow));

      const addOwn = () => {
        if (m.getSource('sebotse')) return;
        // labels in the page's language where the map has them
        const lang = locale === 'zh' ? 'name:zh' : locale === 'en' ? 'name:en' : 'name';
        for (const layer of m.getStyle().layers ?? []) {
          if (layer.type === 'symbol' && m.getLayoutProperty(layer.id, 'text-field')) {
            m.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', lang], ['get', 'name:latin'], ['get', 'name']]);
          }
        }
        // the complex, in amber, in 3D
        m.addSource('sebotse', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: sebotse.blocks.map((b) => ({
              type: 'Feature',
              properties: { id: b.id, base: b.base, top: b.top },
              geometry: { type: 'Polygon', coordinates: [b.ring] },
            })),
          },
        });
        m.addLayer({
          id: 'sebotse-3d',
          type: 'fill-extrusion',
          source: 'sebotse',
          paint: {
            'fill-extrusion-color': ['match', ['get', 'id'], 'B', AMBER, 'C', AMBER, '#F6CF6E'],
            'fill-extrusion-base': ['get', 'base'],
            'fill-extrusion-height': ['get', 'top'],
            'fill-extrusion-opacity': 0.95,
          },
        });
        // the places, each with a ring that pulses when it is the step shown, and lines to the complex
        m.addSource('places', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: [
              ...PLACES.map((id) => ({ type: 'Feature' as const, properties: { id }, geometry: { type: 'Point' as const, coordinates: landmarks[id] } })),
              { type: 'Feature', properties: { id: 'sebotse' }, geometry: { type: 'Point', coordinates: sebotse.centre } },
            ],
          },
        });
        m.addSource('links', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: PLACES.map((id) => ({
              type: 'Feature',
              properties: { id },
              geometry: { type: 'LineString', coordinates: [sebotse.centre, landmarks[id]] },
            })),
          },
        });
        m.addLayer({
          id: 'links',
          type: 'line',
          source: 'links',
          layout: { 'line-cap': 'round' },
          paint: { 'line-color': BLUE, 'line-width': 3, 'line-dasharray': [1.5, 1.5], 'line-opacity': 0 },
        });
        const lat = sebotse.centre[1];
        m.addLayer({
          id: 'place-halo',
          type: 'circle',
          source: 'places',
          paint: {
            'circle-radius': ['match', ['get', 'id'], ...PLACES.flatMap((id) => [id, metres(RING[id], lat)]), metres(RING.sebotse, lat)] as unknown as number,
            'circle-color': ['match', ['get', 'id'], 'sebotse', AMBER, BLUE],
            'circle-opacity': 0.12,
            'circle-stroke-width': 2.5,
            'circle-stroke-color': ['match', ['get', 'id'], 'sebotse', AMBER, BLUE],
            'circle-stroke-opacity': 0.9,
            'circle-pitch-alignment': 'map',
          },
        });
        m.addLayer({
          id: 'place-pulse',
          type: 'circle',
          source: 'places',
          filter: ['==', ['get', 'id'], 'none'],
          paint: {
            'circle-radius': 0,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-width': 3,
            'circle-stroke-color': ['match', ['get', 'id'], 'sebotse', AMBER, BLUE],
            'circle-pitch-alignment': 'map',
          },
        });
        // a name tag over each place
        const tag = (id: LandmarkId | 'sebotse', at: [number, number]) => {
          const div = document.createElement('div');
          div.className = `map-tag map-tag-${id}${id === 'sebotse' ? '' : ' map-tag-place'}${CITY_TAGS.includes(id) ? '' : ' map-tag-near'}`;
          const b = document.createElement('b');
          b.textContent = t.location[id];
          div.append(b);
          if (id !== 'sebotse') {
            const s = document.createElement('span');
            s.textContent = km(at);
            div.append(s);
          }
          markers.push(new maplibre.Marker({ element: div, anchor: 'bottom', offset: [0, -14] }).setLngLat(at).addTo(m));
        };
        for (const id of PLACES) tag(id, landmarks[id]);
        tag('sebotse', sebotse.centre);
      };
      m.on('style.load', addOwn);
      m.on('load', addOwn);

      // the pulse on the place being shown
      const t0 = performance.now();
      const pulse = () => {
        raf = requestAnimationFrame(pulse);
        if (!m.getLayer('place-pulse')) return;
        const k = ((performance.now() - t0) % 1800) / 1800;
        const id = (m.getContainer().dataset.step as StepId) ?? 'city';
        const lat = sebotse.centre[1];
        const r = isPlace(id) ? RING[id] : RING.sebotse;
        m.setFilter('place-pulse', ['==', ['get', 'id'], id]);
        m.setPaintProperty('place-pulse', 'circle-radius', metres(r * (1 + 0.8 * k), lat));
        m.setPaintProperty('place-pulse', 'circle-stroke-opacity', 1 - k);
      };
      pulse();
    })();
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      cleanups.forEach((f) => f());
      markers.forEach((mk) => mk.remove());
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, locale]);

  /** Fly to a step; the lines to the complex show from the square on. */
  const go = (id: StepId) => {
    const m = map.current;
    const s = STEPS.find((x) => x.id === id)!;
    setStep(id);
    if (!m) return;
    m.getContainer().dataset.step = id;
    m.flyTo({ center: s.center, zoom: s.zoom, pitch: s.pitch, bearing: s.bearing, duration: FLY, essential: true, curve: 1.5 });
    if (m.getLayer('links')) m.setPaintProperty('links', 'line-opacity', id === 'city' ? 0 : 0.85);
    for (const el2 of m.getContainer().querySelectorAll<HTMLElement>('.map-tag')) {
      const city = id === 'city' && CITY_TAGS.some((c) => el2.classList.contains(`map-tag-${c}`));
      el2.classList.toggle('is-on', el2.classList.contains(`map-tag-${id}`) || id === 'sebotse' || city);
    }
  };

  /** The whole flight: city, square, embassy, complex. */
  const play = async () => {
    const me = ++run.current;
    setPlaying(true);
    for (const s of STEPS) {
      if (run.current !== me) return;
      go(s.id);
      await new Promise((r) => setTimeout(r, FLY + HOLD));
    }
    if (run.current === me) setPlaying(false);
  };

  // play once, the first time the map is well in view and loaded
  useEffect(() => {
    if (!near) return;
    const node = box.current;
    if (!node) return;
    let started = false;
    const io = new IntersectionObserver(
      ([e]) => {
        if (started || !e.isIntersecting) return;
        const m = map.current;
        const start = () => {
          if (started) return;
          started = true;
          void play();
        };
        if (m?.getSource('sebotse')) start();
        else {
          // the map isn't ready yet: start once our layers are on it
          const wait = setInterval(() => {
            if (map.current?.getSource('sebotse')) {
              clearInterval(wait);
              start();
            }
          }, 300);
        }
      },
      { threshold: 0.6 },
    );
    io.observe(node);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near]);

  return (
    <div className="location-map" ref={box}>
      <div className="location-canvas" ref={el} />
      <ol className="location-steps">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              aria-pressed={step === s.id}
              onClick={() => {
                run.current++;
                setPlaying(false);
                go(s.id);
              }}
            >
              <i>{i + 1}</i>
              <span>
                <b>{t.location[s.id]}</b>
                {isPlace(s.id) ? <small>{km(landmarks[s.id])}</small> : <small>{t.location[`${s.id}Line`]}</small>}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="location-actions">
        <button type="button" className="pill" onClick={() => void play()} disabled={playing}>
          {playing ? t.location.playing : t.location.replay}
        </button>
        <a className="pill pill-primary" href="#floors">
          {t.location.to3d}
        </a>
      </div>
    </div>
  );
}
