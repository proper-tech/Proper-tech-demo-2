# Sebotse (Tenger Residence) sales site

A sales site for a residential complex in Ulaanbaatar: two 16-storey towers (blocks B, C) on a podium (A),
plus block D. Buyers pick a floor in a 3D model of the building, open its plan, then an apartment with a
3D model, 2D plan and rendered 360° tour. Next.js 16 App Router, React 19, three.js through
@react-three/fiber, MapLibre for the location map. English, Mongolian and Chinese.

README.md is the map of the project: what is real and what is still a placeholder, what is where, and how
the models, film and tours are made. Read the relevant part of it before changing data or assets.

## Commands

- `npm run dev`: dev server on http://localhost:3000 (`/` redirects to `/en`).
- `npx tsc --noEmit -p .`: type-check (about 2 s). A hook runs it after every edit under `src/`.
- `npx next build`: production build; every page and every apartment's share card is prerendered.
- `/verify`: the full check before a commit (build, serve, fetch pages, metadata and a share card).
  There is no test suite and no linter config.

## Next.js 16

The installed version's docs ship in `node_modules/next/dist/docs/`. Read the relevant page there before
writing Next.js code; APIs have moved since older versions (params are Promises, image routes, metadata).

## Conventions

- **Styles:** plain CSS in `src/app/globals.css`, variables in `:root`. No Tailwind, no CSS modules.
  Amber (`--amber`) means "do something" and nothing else. Panels over the 3D view are solid, not glass.
- **Text:** every visible string goes into all three of `src/i18n/en.ts`, `mn.ts`, `zh.ts`. The `Dict` type
  comes from `en.ts`, so a key missing from `mn`/`zh` fails the type-check. Flag new Mongolian and Chinese
  text for a native speaker to check.
- **Comments** are full sentences that say why, in British spelling ("colour", "centre"), as in the
  existing code. Match it.
- **Page metadata:** every page builds its metadata with `pageMeta()` from `src/lib/meta.ts` (title,
  description, canonical, hreflang, Open Graph, X card). A page that sets its own `openGraph` replaces the
  layout's, so don't hand-write it. Apartment pages pass `ownImage` so their generated card
  (`apartments/[id]/opengraph-image.tsx`) is used. Image routes don't inherit the layout's languages:
  their `generateStaticParams` lists the locales itself.
- **3D views:** always inside `SafeCanvas` (WebGL-blocked and context-lost fallbacks), loaded with
  `dynamic(..., { ssr: false })`. Respect `prefers-reduced-motion`; `Motion.tsx` owns the home page's
  reveals.

## Data and assets

- Building data (`src/data/`) is traced from the architect's drawings. Never invent prices, availability
  or dimensions; README lists what is still a placeholder (sales status, ceiling heights, phone number).
- `public/` is served as-is. The Blender sources (`*.blend`) sit in `public/models/blocks/` on purpose:
  the build scripts export each `.glb` next to its open `.blend`. They are gitignored; never move or
  delete them.
- `interior/` (about 1 GB) is the 360° tour render pipeline with its own README; `public/tour/<plan>/` are
  its published, self-contained tours. Don't edit the tour HTML by hand.
- Large binaries: anything over a few MB in `public/` costs every visitor. Prefer WebP for pictures.

## Decisions to keep

- The home page scrolls freely. Section-by-section paging and CSS scroll snapping were tried and removed
  at the owner's request; don't bring them back.
- Every plan A-F has a rendered 360° tour, so the apartment page's tour is always the rendered one.
- The share card draws only numbers and Latin letters (the bundled font has no Cyrillic or Chinese);
  the words go in the metadata.
- The finder (bedrooms, morning or evening sun) travels in the URL as `?beds=&sun=`.

## Git

Several people commit here; larger work comes in through pull requests to `main`. Commit only when asked,
to the branch asked for. Messages: a short subject line, then a bulleted body saying what changed and why.
