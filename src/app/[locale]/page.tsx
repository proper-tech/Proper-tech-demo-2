import Link from 'next/link';
import { FloorPicker } from '@/components/FloorPicker';
import { VideoSection } from '@/components/VideoSection';
import { SitePlan } from '@/components/SitePlan';
import { FLOOR_MAX, FLOOR_MIN, availableUnits, towerFootprint, units } from '@/data/building';
import site from '@/data/site.json';
import { layouts } from '@/data/layouts';
import { fmt, getDict } from '@/i18n/config';
import { m } from '@/lib/geometry';

const renders = [
  ['aerial-front', 'aerialFront'],
  ['podium', 'podium'],
  ['corner', 'corner'],
  ['aerial-back', 'aerialBack'],
  ['parking', 'parking'],
  ['annex', 'annex'],
] as const;

const span = (i: number) => Math.round(Math.max(...site.boundary.map((p) => p[i])) - Math.min(...site.boundary.map((p) => p[i])));
const siteSize = [span(0), span(1)];

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDict(locale);

  return (
    <main>
      <FloorPicker>
        <h1>{t.home.title}</h1>
        <p className="lead">{fmt(t.home.lead, { count: units.length, min: FLOOR_MIN, max: FLOOR_MAX })}</p>
      </FloorPicker>

      <section className="gallery" id="building">
        <h2>{t.home.galleryHeading}</h2>
        <p className="lead">{t.home.galleryLead}</p>
        <div className="gallery-grid">
          {renders.map(([file, key]) => (
            <figure key={file}>
              <img src={`/media/renders/${file}.jpg`} alt={t.home.captions[key]} width={1179} height={663} loading="lazy" />
              <figcaption>{t.home.captions[key]}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="site" id="site">
        <div>
          <h2>{t.home.siteHeading}</h2>
          <p className="lead">{fmt(t.home.siteLead, { w: towerFootprint.w.toFixed(1), d: towerFootprint.d.toFixed(1), sw: siteSize[0], sd: siteSize[1] })}</p>
        </div>
        <SitePlan t={t} />
      </section>

      <section className="layouts" id="layouts">
        <h2>{t.home.layoutsHeading}</h2>
        <p className="lead">{t.home.layoutsLead}</p>
        <p className="note">{t.home.layoutsNote}</p>
        <table>
          <thead>
            <tr>
              <th>{t.home.colLayout}</th>
              <th>{t.home.colArea}</th>
              <th>{t.home.colFacing}</th>
              <th>{t.home.colForSale}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {Object.values(layouts).map((layout) => {
              const id = layout.id;
              const forSale = availableUnits.filter((u) => u.layout === id);
              return (
                <tr key={id}>
                  <th scope="row">
                    <b>{t.beds[layout.bedrooms as 1 | 2 | 3]}</b>
                    <span>{fmt(t.home.layoutN, { id })}</span>
                  </th>
                  <td>{m(layout.area)} m²</td>
                  <td>{t.facing[layout.facing]}</td>
                  <td>{forSale.length}</td>
                  <td>
                    {forSale[0] && (
                      <Link className="button" href={`/${locale}/apartments/${forSale[0].id}`}>
                        {fmt(t.home.viewOne, { id: forSale[0].id })}
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <VideoSection />

      <footer className="site-footer">
        <p>{t.site.sales}</p>
        <p>{t.site.footer}</p>
      </footer>
    </main>
  );
}
