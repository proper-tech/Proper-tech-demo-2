import { towers } from '@/data/building';
import site from '@/data/site.json';
import type { Dict } from '@/i18n/config';
import { fmt } from '@/i18n/config';

// The architect's site plan, redrawn as SVG from site.json. Units are metres.
// Site-plan (u, v) maps to SVG as x = u, y = -v.

const d = (points: number[][], close = false) =>
  points.map(([u, v], i) => `${i ? 'L' : 'M'}${u} ${-v}`).join(' ') + (close ? ' Z' : '');

const centre = (points: number[][]) => [
  points.reduce((s, p) => s + p[0], 0) / points.length,
  -points.reduce((s, p) => s + p[1], 0) / points.length,
];

export function SitePlan({ t }: { t: Dict }) {
  const all = [...site.boundary, ...site.annex];
  const us = all.map((p) => p[0]);
  const vs = all.map((p) => p[1]);
  const pad = 3;
  const box = [Math.min(...us) - pad, -Math.max(...vs) - pad, Math.max(...us) - Math.min(...us) + pad * 2, Math.max(...vs) - Math.min(...vs) + pad * 2];
  const [ax, ay] = centre(site.annex);
  const [px, py] = [3, 0];

  return (
    <svg className="site-svg" viewBox={box.join(' ')} role="img" aria-label={t.home.siteHeading}>
      <path className="site-ground" d={d(site.boundary, true)} />
      {site.kerbs.map((line, i) => (
        <path key={i} className="site-kerb" d={d(line)} />
      ))}
      {site.parking.map((line, i) => (
        <path key={i} className="site-bay" d={d(line)} />
      ))}
      <path className="site-podium" d={d(site.podium, true)} />
      <path className="site-annex" d={d(site.annex, true)} />
      {site.towers.map((tw, i) => (
        <g key={i}>
          <rect className="site-tower" x={tw.u0} y={-tw.v1} width={tw.u1 - tw.u0} height={tw.v1 - tw.v0} />
          <text className="site-title" x={(tw.u0 + tw.u1) / 2} y={-(tw.v0 + tw.v1) / 2}>
            {fmt(t.home.towerN, { t: towers[i] })}
          </text>
          <text className="site-note" x={(tw.u0 + tw.u1) / 2} y={-(tw.v0 + tw.v1) / 2 + 3}>
            {(tw.u1 - tw.u0).toFixed(1)} × {(tw.v1 - tw.v0).toFixed(1)} m
          </text>
        </g>
      ))}
      {site.trees.map(([u, v], i) => (
        <circle key={i} className="site-tree" cx={u} cy={-v} r={0.9} />
      ))}
      <text className="site-label" x={px} y={py}>
        {t.home.sitePodium}
      </text>
      <text className="site-note" x={px} y={py + 2.6}>
        {t.home.sitePlayground}
      </text>
      <text className="site-label" x={ax} y={ay}>
        {t.home.siteAnnex}
      </text>
      <text className="site-label" x={-31} y={31}>
        {t.home.siteParking}
      </text>
      {/* North arrow: the drawing is turned 10.71° from north */}
      <g transform={`translate(${Math.max(...us) - 3} ${-Math.max(...vs) + 6}) rotate(${site.rotation})`}>
        <path className="site-north" d="M0 -4 L1.6 2 L0 0.8 L-1.6 2 Z" />
        <text className="site-note" x={0} y={5}>
          N
        </text>
      </g>
    </svg>
  );
}
