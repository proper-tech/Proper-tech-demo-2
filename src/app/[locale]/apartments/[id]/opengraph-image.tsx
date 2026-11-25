import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';
import { getUnit, units } from '@/data/building';
import { layouts } from '@/data/layouts';
import { locales } from '@/i18n/config';
import { layoutArea, m } from '@/lib/geometry';

// The picture shown when an apartment is shared: its furnished plan seen from above (cut from its 360° tour,
// assets/og/plan-<plan>.png) beside its number and area, on the site's navy. Only numbers and Latin
// letters are drawn, so one card serves all three languages with the bundled font; the words (title,
// description) are sent in each language by the page's metadata (lib/meta.ts). Made once, at build time.

// made at build time for every apartment (155 × 3 languages), so the plan pictures are read from the repo
// then and nothing runs when a network fetches the card
export const dynamicParams = false;
// (an image route doesn't take the layout's languages, so it lists them itself)
export const generateStaticParams = () => locales.flatMap((locale) => units.map((u) => ({ locale, id: u.id })));

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Apartment floor plan';

const plans = new Map<string, Promise<string>>();
const planImage = (plan: string) => {
  if (!plans.has(plan))
    plans.set(
      plan,
      readFile(join(process.cwd(), 'assets/og', `plan-${plan}.png`)).then((b) => `data:image/png;base64,${b.toString('base64')}`),
    );
  return plans.get(plan)!;
};

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const unit = getUnit((await params).id);
  const layout = unit && layouts[unit.layout];
  const src = layout ? await planImage(layout.plan) : null;
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: '#14233b', color: '#ffffff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 640, height: '100%', background: '#e9edf0' }}>
          {src && <img src={src} style={{ maxWidth: 580, maxHeight: 560, objectFit: 'contain' }} />}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, padding: '64px 60px' }}>
          <div style={{ display: 'flex', fontSize: 26, letterSpacing: 8, color: '#f2b632' }}>SEBOTSE</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 132, lineHeight: 1, letterSpacing: -4 }}>{unit?.id ?? ''}</div>
            {layout && <div style={{ marginTop: 18, fontSize: 64, color: '#f2b632' }}>{`${m(layoutArea(layout))} m²`}</div>}
          </div>
          <div style={{ display: 'flex', fontSize: 26, color: '#9fb0c6' }}>Ulaanbaatar</div>
        </div>
      </div>
    ),
    size,
  );
}
