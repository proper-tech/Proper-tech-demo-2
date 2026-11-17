import Link from 'next/link';
import { FloorPicker } from '@/components/FloorPicker';
import { VideoSection } from '@/components/VideoSection';
import { SitePlan } from '@/components/SitePlan';
import { FLOOR_MAX, FLOOR_MIN, availableUnits, capacity, units } from '@/data/building';
import { apartmentTypes, layouts } from '@/data/layouts';
import { fmt, getDict } from '@/i18n/config';
import { layoutArea, m, maxCeiling } from '@/lib/geometry';

const renders = [
  ['aerial-front', 'aerialFront'],
  ['podium', 'podium'],
  ['corner', 'corner'],
  ['aerial-back', 'aerialBack'],
  ['parking', 'parking'],
  ['annex', 'annex'],
] as const;


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
          <p className="lead">{t.home.siteLead}</p>
          <dl className="facts">
            {(
              [
                [t.home.factApartments, String(capacity.apartments)],
                [t.home.factPublic, `${capacity.publicArea.toLocaleString('en-US')} m²`],
                [t.home.factFootprint, `${capacity.footprint.toLocaleString('en-US')} m²`],
                [t.home.factParking, fmt(t.home.factParkingValue, { heated: capacity.heatedParking, outdoor: capacity.outdoorParking })],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
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
              <th>{t.home.colCeiling}</th>
              <th>{t.home.colForSale}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {apartmentTypes.map(({ plans, layout: id }) => {
              const layout = layouts[id];
              const forSale = availableUnits.filter((u) => plans.includes(u.plan));
              const example = forSale.find((u) => u.layout === id) ?? forSale[0];
              return (
                <tr key={id}>
                  <th scope="row">
                    <b>
                      {t.beds[layout.bedrooms as 1 | 2 | 3]}
                      {layout.bathrooms > 1 ? `, ${t.baths[2]}` : ''}
                    </b>
                    <span>{fmt(t.home.layoutN, { a: plans[0], b: plans[1] })}</span>
                  </th>
                  <td>{m(layoutArea(layout))} m²</td>
                  <td>{fmt(t.home.ceilingUpTo, { h: m(maxCeiling(layout)) })}</td>
                  <td>{forSale.length}</td>
                  <td>
                    {example && (
                      <Link className="button" href={`/${locale}/apartments/${example.id}`}>
                        {fmt(t.home.viewOne, { id: example.id })}
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
