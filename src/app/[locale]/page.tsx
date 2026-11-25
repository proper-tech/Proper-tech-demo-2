import type React from 'react';
import Link from 'next/link';
import { FloorPicker } from '@/components/FloorPicker';
import { LocationMap } from '@/components/LocationMap';
import { Motion } from '@/components/Motion';
import { VideoSection } from '@/components/VideoSection';
import { SitePlan } from '@/components/SitePlan';
import { PlanGroup } from '@/components/Plan2D';
import { FLOOR_MAX, FLOOR_MIN, availableUnits, capacity, units } from '@/data/building';
import { apartmentTypes, flatColors, layouts } from '@/data/layouts';
import { planPhotos } from '@/data/planPhotos';
import { fmt, getDict } from '@/i18n/config';
import { SALES_PHONE } from '@/data/contact';
import { layoutArea, m, maxCeiling } from '@/lib/geometry';

// The home page in screens, scrolling freely: a sunset loop stays pinned full-screen behind the intro, then a
// drone flight round the complex plays with the scroll under the four chapters (a screen and a leg each), then
// the floor picker, four ways to explore as photo
// cards, the apartment types in a sideways row, the site plan on an amber band, the film with controls and
// a contact close. Motion.tsx (mounted last) fades things in, counts the figures and tracks the chapter.

/** The complex at sunset, behind the intro: a still (the loop's poster) and the loop made from it (Magnific,
 *  Kling 2.5: clouds, traffic and window lights moving, the building still). */
const HERO = '/media/hero-sunset-2400.webp';
const HERO_LOOP = '/media/hero-loop.mp4';
/** The drone flight behind the chapters, made from four frames of the film (scripts/build-film.py --stills
 *  1000,240,550,700), each sharpened with Magnific, and Kling 2.5 legs between them; a keyframe every few
 *  frames, so it seeks smoothly as you scroll. */
const FLIGHT = '/media/flight.mp4';
const FLIGHT_POSTER = '/media/flight-poster.jpg';

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = getDict(locale);
  // the three plans are drawn at one scale, so their sizes compare at a glance
  const planW = Math.max(...apartmentTypes.map(({ layout }) => layouts[layout].w));
  const planD = Math.max(...apartmentTypes.map(({ layout }) => layouts[layout].d));
  // ...and so are their furnished top views (sizes in metres, src/data/planPhotos.ts)
  const picW = Math.max(...apartmentTypes.map(({ plans }) => planPhotos[plans[0]]?.w ?? 0));
  const picH = Math.max(...apartmentTypes.map(({ plans }) => planPhotos[plans[0]]?.h ?? 0));
  // an apartment with the rendered 360° photo tour (plan D), for the "walk through" card
  const showUnit = availableUnits.find((u) => u.layout === 'D') ?? availableUnits[0];

  // the chapters over the film: captions for what the film is showing at that moment
  const chapters = ['location', 'towers', 'podium', 'homes'] as const;

  // places to step into that the page itself doesn't show (the floor picker and site plan are on it)
  const explore = [
    { key: 'apartment', img: 'corner', href: `/${locale}/apartments/${showUnit?.id}?view=tour` },
    { key: 'shops', img: 'podium', href: `/${locale}/floors/A/1?view=360` },
    { key: 'podium', img: 'aerial-back', href: `/${locale}/floors/A/4` },
  ] as const;

  return (
    <main className="home">
      <section className="story">
        {/* pinned while the chapters scroll over it: the sunset loop behind the intro, then a drone flight round
            the complex whose frames follow the scroll (Motion.tsx), one leg per chapter; the rail and the dots
            show which chapter you are in */}
        <div className="story-stage">
          <video className="story-film" src={HERO_LOOP} poster={HERO} autoPlay muted loop playsInline preload="auto" aria-hidden="true" />
          <video className="story-flight" src={FLIGHT} poster={FLIGHT_POSTER} muted playsInline preload="auto" aria-hidden="true" />
          <div className="story-hud" aria-hidden="true">
            <p className="hud-count">
              {chapters.map((key, i) => (
                <b key={key} data-dot={key}>
                  {String(i + 1).padStart(2, '0')}
                </b>
              ))}
              <span>/ {String(chapters.length).padStart(2, '0')}</span>
            </p>
            <ol className="hud-rail">
              {chapters.map((key) => (
                <li key={key} data-dot={key}>
                  {t.story[key].title}
                </li>
              ))}
            </ol>
          </div>
          <ol className="story-dots" aria-hidden="true">
            {['intro', ...chapters].map((k) => (
              <li key={k} data-dot={k} />
            ))}
          </ol>
        </div>

        <div className="story-chapter story-intro" data-chapter="intro">
          <p className="story-kicker">{t.home.address}</p>
          <h1>{t.site.name}</h1>
          <p className="story-lead">{t.hero.lead}</p>
          <div className="actions">
            <a className="pill pill-primary" href="#floors">
              {t.hero.toFloors}
            </a>
          </div>
        </div>

        {/* a screen per chapter, the flight landing on what its caption is about; captions alternate sides */}
        {chapters.map((key, i) => (
          <div key={key} className="story-chapter story-leg" data-chapter={key} data-side={i % 2 ? 'right' : 'left'}>
            <div className="chapter-caption fx">
              <span className="chapter-index">{String(i + 1).padStart(2, '0')}</span>
              <h2>{t.story[key].title}</h2>
              <p>{fmt(t.story[key].line, { count: units.length, min: FLOOR_MIN, max: FLOOR_MAX })}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="location" id="location">
        <div className="centre-head fx">
          <h2>{t.location.heading}</h2>
          <p className="lead">{t.location.lead}</p>
        </div>
        <LocationMap />
      </section>

      <FloorPicker>
        <h2>{t.home.title}</h2>
        <p className="lead">{t.home.lead}</p>
      </FloorPicker>

      <section className="explore" id="explore">
        <div className="centre-head fx">
          <h2>{t.explore.heading}</h2>
          <p className="lead">{t.explore.lead}</p>
        </div>
        <ul className="explore-cards">
          {explore.map(({ key, img, href }) => {
            const item = t.explore[key];
            return (
              <li key={key} className="fx">
                <Link className="explore-card" href={href}>
                  <img src={`/media/renders/${img}.webp`} alt="" width={1179} height={663} loading="lazy" />
                  <span className="explore-body">
                    <b>{item.title}</b>
                    <span>{item.line}</span>
                    <span className="explore-go">{fmt(item.cta, { id: showUnit?.id ?? '' })}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="layouts" id="layouts">
        <div className="centre-head fx">
          <h2>{t.home.layoutsHeading}</h2>
          <p className="lead">{t.home.layoutsLead}</p>
        </div>
        {/* one card per type, in a row that scrolls sideways on narrow screens */}
        <ul className="types">
          {apartmentTypes.map(({ plans, layout: id }) => {
            const layout = layouts[id];
            const forSale = availableUnits.filter((u) => plans.includes(u.plan));
            const example = forSale.find((u) => u.layout === id) ?? forSale[0];
            const photo = planPhotos[plans[0]];
            return (
              <li key={id} className="type fx" style={{ '--flat': flatColors[plans[0]] } as React.CSSProperties}>
                {/* the apartment furnished, seen from above (the rendered 360° tour's top view), all three at one
                    scale; the architect's drawn plan if there is no render */}
                <div className="type-plan" aria-hidden="true">
                  {photo ? (
                    <svg className="plan-svg" viewBox={`0 0 ${picW} ${picH}`}>
                      <image href={photo.src} x={(picW - photo.w) / 2} y={(picH - photo.h) / 2} width={photo.w} height={photo.h} />
                    </svg>
                  ) : (
                    <svg className="plan-svg" viewBox={`-0.6 -0.6 ${planW + 1.2} ${planD + 1.2}`}>
                      <PlanGroup layout={layout} tx={{ ox: (planW - layout.w) / 2, sx: 1, oz: (planD - layout.d) / 2, sz: 1 }} />
                    </svg>
                  )}
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
        <p className="note centre-note">{t.home.layoutsNote}</p>
      </section>

      <section className="site" id="site">
        <div className="fx">
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
        <figure className="sheet fx">
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

      <VideoSection />

      <section className="contact" id="contact">
        <div className="fx">
          <h2>{t.contact.heading}</h2>
          <p className="lead">{t.contact.lead}</p>
          {/* these strings carry their own labels ("Sales office: …", "Developer: …") */}
          <ul className="contact-lines">
            {SALES_PHONE && (
              <li>
                <a href={`tel:${SALES_PHONE.replace(/\s/g, '')}`}>{fmt(t.site.sales, { phone: SALES_PHONE })}</a>
              </li>
            )}
            <li>{t.home.address}</li>
          </ul>
          <a className="pill pill-primary" href="#floors">
            {t.hero.toFloors}
          </a>
        </div>
      </section>

      <footer className="site-footer">
        <p className="footer-name">{t.site.name}</p>
        <nav className="footer-links" aria-label={t.footer.explore}>
          <a href="#floors">{t.nav.floors}</a>
          <a href="#explore">{t.nav.explore}</a>
          <a href="#layouts">{t.nav.layouts}</a>
          <a href="#site">{t.home.siteHeading}</a>
          <a href="#video">{t.nav.video}</a>
          <Link href={`/${locale}/floors/A/1`}>{t.home.podiumTab}</Link>
          <Link href={`/${locale}/floors/A/B1`}>{t.basement.name}</Link>
        </nav>
        <p>
          {t.home.projectFull} · {t.home.developer} · {t.home.architect}
        </p>
        <p className="footer-note">{t.site.footer}</p>
      </footer>

      {/* last, so its effect runs after the whole page has hydrated */}
      <Motion />
    </main>
  );
}
