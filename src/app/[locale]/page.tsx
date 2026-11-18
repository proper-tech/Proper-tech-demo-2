import type React from 'react';
import Link from 'next/link';
import { FloorPicker } from '@/components/FloorPicker';
import { VideoSection } from '@/components/VideoSection';
import { SitePlan } from '@/components/SitePlan';
import { PlanGroup } from '@/components/Plan2D';
import { FLOOR_MAX, FLOOR_MIN, availableUnits, capacity, units } from '@/data/building';
import { apartmentTypes, flatColors, layouts } from '@/data/layouts';
import { fmt, getDict } from '@/i18n/config';
import { layoutArea, m, maxCeiling } from '@/lib/geometry';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDict(locale);
  // the three plans are drawn at one scale, so their sizes compare at a glance
  const planW = Math.max(...apartmentTypes.map(({ layout }) => layouts[layout].w));
  const planD = Math.max(...apartmentTypes.map(({ layout }) => layouts[layout].d));

  return (
    <main>
      <FloorPicker>
        <h1>{t.home.title}</h1>
        <p className="lead">{fmt(t.home.lead, { count: units.length, min: FLOOR_MIN, max: FLOOR_MAX })}</p>
      </FloorPicker>

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
        {/* the plan framed like the architect's drawing sheet, with its title block */}
        <figure className="sheet">
          <div className="sheet-drawing">
            <SitePlan t={t} />
          </div>
          <figcaption className="title-block">
            <dl>
              <div className="title-block-wide">
                <dt>{t.home.sheetProject}</dt>
                <dd>{t.home.projectFull}</dd>
              </div>
              <div>
                <dt>{t.home.sheetAddress}</dt>
                <dd>{t.home.address}</dd>
              </div>
              <div>
                <dt>{t.home.sheetDrawing}</dt>
                <dd>{t.home.siteHeading}</dd>
              </div>
            </dl>
          </figcaption>
        </figure>
      </section>

      <section className="layouts" id="layouts">
        <h2>{t.home.layoutsHeading}</h2>
        <p className="lead">{t.home.layoutsLead}</p>
        <p className="note">{t.home.layoutsNote}</p>
        <ul className="types">
          {apartmentTypes.map(({ plans, layout: id }) => {
            const layout = layouts[id];
            const forSale = availableUnits.filter((u) => plans.includes(u.plan));
            const example = forSale.find((u) => u.layout === id) ?? forSale[0];
            return (
              <li key={id} className="type" style={{ '--flat': flatColors[plans[0]] } as React.CSSProperties}>
                {/* the apartment's own plan, from the architect's floor plans, all three at one scale */}
                <div className="type-plan" aria-hidden="true">
                  <svg className="plan-svg" viewBox={`-0.6 -0.6 ${planW + 1.2} ${planD + 1.2}`}>
                    <PlanGroup layout={layout} tx={{ ox: (planW - layout.w) / 2, sx: 1, oz: (planD - layout.d) / 2, sz: 1 }} />
                  </svg>
                </div>
                <div className="type-body">
                  <h3>
                    {t.beds[layout.bedrooms as 1 | 2 | 3]}
                    {layout.bathrooms > 1 ? `, ${t.baths[2]}` : ''}
                  </h3>
                  <p className="type-plans">{fmt(t.home.layoutN, { a: plans[0], b: plans[1] })}</p>
                  <dl className="type-facts">
                    <div>
                      <dt>{t.home.colArea}</dt>
                      <dd>{m(layoutArea(layout))} m²</dd>
                    </div>
                    <div>
                      <dt>{t.home.colCeiling}</dt>
                      <dd>{fmt(t.home.ceilingUpTo, { h: m(maxCeiling(layout)) })}</dd>
                    </div>
                    <div>
                      <dt>{t.home.colForSale}</dt>
                      <dd>{forSale.length}</dd>
                    </div>
                  </dl>
                  {example && (
                    <Link className="button" href={`/${locale}/apartments/${example.id}`}>
                      {fmt(t.home.viewOne, { id: example.id })}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <VideoSection />

      <footer className="site-footer">
        <div className="footer-main">
          <div>
            <p className="footer-name">{t.site.name}</p>
            <p>{t.home.projectFull}</p>
            <p>{t.home.address}</p>
          </div>
          <div>
            <p className="footer-phone">{t.site.sales}</p>
            <p>{t.home.developer}</p>
            <p>{t.home.architect}</p>
          </div>
        </div>
        <p className="footer-note">{t.site.footer}</p>
      </footer>
    </main>
  );
}
