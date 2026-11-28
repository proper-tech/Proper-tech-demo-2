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

/** The complex at sunset, behind the intro: a still and the loop made from it (Magnific, Kling 2.5: clouds,
 *  traffic and window lights moving, the building still). The still is the page's first picture, so it comes in
 *  the size the screen needs (AVIF where the browser takes it); the loop starts only once the page has loaded
 *  (Motion.tsx), so its 6 MB never hold up the first paint. */
const HERO = '/media/hero-sunset';
const HERO_LOOP = '/media/hero-loop.mp4';
/** The drone flight behind the chapters: the first flight's camera path (four frames of the film, scripts/
 *  build-film.py --stills 1000,240,550,700, with Kling 2.5 legs between them, one per chapter), repainted frame
 *  for frame as a sunset over Ulaanbaatar by Seedance 2.5's video edit in Higgsfield, with stills in the hero's
 *  light and materials as its references, so every move is the old one and only the city, light and building
 *  surfaces changed. The edit's brightness flickered from frame to frame, which shimmers when scrolled, so it
 *  was evened out (ffmpeg deflicker and a temporal denoise). Its timing then had a fault about once a second
 *  (from a frame-rate conversion along the way): a frame shown twice, or one left out, which jolts the flight. The
 *  repeats were dropped and each gap filled with a motion-compensated frame halfway across it (ffmpeg
 *  minterpolate), one uneven stretch near the end re-spaced; the chapters' waypoints moved by two frames at most.
 *  The edit and the smoothing had left it soft at 1600 x 900, so Topaz Video (in Higgsfield) upscaled it to 4K,
 *  brought down to 1920 x 1080. The scroll moves it by seeking, and a seek decodes every frame from the last
 *  keyframe: so a keyframe every third frame and no B-frames, a couple of frames per seek, or it stutters. (A
 *  2560 x 1440 copy for high-density screens decoded 2.6 times as much per seek and did.) Browsers keep /media
 *  for a week (next.config.ts), so a new flight goes in under a new name, never over the old one. */
const FLIGHT = '/media/flight-sunset-6.mp4';
const FLIGHT_POSTER = '/media/flight-sunset-6-poster.jpg';
/** The window views' band in "Step inside": the drone's photograph out of the top floor's north-east apartment
 *  (B1606) and the image model's three other seasons of it (public/views/window/NE/floor-16), crossfading. */
const BAND_SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const;
const bandPic = (season: string, w: number) => `/media/renders/window-${season}-${w}.webp`;

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

  // the chapters over the film: captions for what the film is showing at that moment, each with the place on
  // the site where that part of the complex can be looked at more closely
  const chapters = ['location', 'towers', 'podium', 'homes'] as const;
  const chapterLinks: Record<(typeof chapters)[number], string> = {
    location: '#location',
    towers: '#floors',
    podium: `/${locale}/floors/A/4`,
    homes: '#layouts',
  };

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
            the complex whose frames follow the scroll (Motion.tsx), one leg per chapter; the rail at the bottom
            shows which chapter you are in, and its names take you to a chapter */}
        <div className="story-stage">
          {/* neither video downloads with the page: Motion.tsx starts the loop once the page has loaded and the
              flight soon after (on a slow or data-saving connection, not until the visitor scrolls). The still
              covers the loop until it plays, and stays for reduced motion or without script. */}
          <video className="story-film" src={HERO_LOOP} muted loop playsInline preload="none" aria-hidden="true" />
          <picture>
            <source type="image/avif" srcSet={`${HERO}-1200.avif 1200w, ${HERO}-2400.avif 2400w`} sizes="100vw" />
            <img
              className="story-still"
              src={`${HERO}-2400.webp`}
              srcSet={`${HERO}-1200.webp 1200w, ${HERO}-2400.webp 2400w`}
              sizes="100vw"
              alt=""
              fetchPriority="high"
              decoding="async"
            />
          </picture>
          <video className="story-flight" src={FLIGHT} data-poster={FLIGHT_POSTER} muted playsInline preload="none" aria-hidden="true" />
          <nav className="story-hud" aria-label={t.story.rail}>
            <p className="hud-count" aria-hidden="true">
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
                  <a href={`#story-${key}`}>{t.story[key].title}</a>
                </li>
              ))}
            </ol>
          </nav>
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
          <div key={key} id={`story-${key}`} className="story-chapter story-leg" data-chapter={key} data-side={i % 2 ? 'right' : 'left'}>
            <div className="chapter-caption fx">
              <h2>{t.story[key].title}</h2>
              <p>{fmt(t.story[key].line, { count: units.length, min: FLOOR_MIN, max: FLOOR_MAX })}</p>
              <a className="chapter-link" href={chapterLinks[key]}>
                {t.story[key].link}
                <span aria-hidden="true">→</span>
              </a>
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
        {/* the real view from the windows, set apart from the cards below: the photograph and its seasons in turn
            (globals.css .views-band; the photograph alone for reduced motion), opening the same view */}
        <Link className="views-band fx" href={`/${locale}/views?tower=B&floor=16&apt=6`}>
          <span className="views-band-pics" aria-hidden="true">
            {BAND_SEASONS.map((se, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={se}
                src={bandPic(se, 1600)}
                srcSet={`${bandPic(se, 960)} 960w, ${bandPic(se, 1600)} 1600w`}
                sizes="(max-width: 80rem) 100vw, 80rem"
                alt=""
                width={1600}
                height={900}
                loading="lazy"
                style={{ '--i': i } as React.CSSProperties}
              />
            ))}
          </span>
          <span className="views-band-body">
            <span className="real-badge">{t.explore.views.badge}</span>
            <b>{t.explore.views.title}</b>
            <span className="views-band-line">{t.explore.views.line}</span>
            <span className="views-band-where">{t.explore.views.where}</span>
            <span className="pill pill-primary">{t.explore.views.cta} →</span>
          </span>
          <span className="views-band-seasons" aria-hidden="true">
            {BAND_SEASONS.map((se, i) => (
              <span key={se} style={{ '--i': i } as React.CSSProperties}>
                {t.views.seasons[se]} · {se === 'winter' ? t.explore.views.photo : t.explore.views.ai}
              </span>
            ))}
          </span>
        </Link>
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
