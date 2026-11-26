# UX plan: from "look at the building" to "book a viewing"

Written 2026-11-25, against the code on branch `ux-find-and-book`. The site already does the hard 3D
work well; what it lacks is the path from looking to buying. Everything below is tied to this codebase.

## What is already good (keep it)

- Building → floor → apartment drill-down with fly-to zoom (`FloorPicker`, `three/BuildingScene`, `three/Tour`).
- Camera limits and damping on every orbit view; an eye-level street tour (`TourBar`); fullscreen.
- Real download progress on the home 3D view, shaders compiled before the loader lifts (`WhenReady`).
- 3D view loads only when it is a screen away, and stops drawing when scrolled out of sight.
- Draco-compressed models, a WebGL-blocked / context-lost fallback (`SafeCanvas`), reduced-motion handling.
- Status colours (for sale / reserved / sold) on tags, lists and plans; room sizes on the 3D model and 2D plan.
- Sunlight by date and time (`SunPanel`): unusually useful for buyers in Ulaanbaatar.

## Audit: top issues, ranked by impact on sales

| # | Issue | Where | Status |
|---|---|---|---|
| 1 | **No way to act.** No booking, no contact form, and `SALES_PHONE` is empty, so the contact section is an address only. | `data/contact.ts`, home `#contact` | **Partly fixed**: "Book a viewing" + Share on every floor and apartment page (`UnitActions`). Needs the real phone number and a form endpoint. |
| 2 | **No prices** anywhere. Price is the first filter buyers use. | `data/building.ts` has no price field | Open (needs data) |
| 3 | **Availability is a placeholder.** Every unit is `'available'`, so the status colours carry no information. | `data/building.ts:167` | Open (needs a source sales staff can edit) |
| 4 | **No way to search by need.** Every floor has the same six plans, so "pick a floor first" doesn't help a buyer who wants "1 bedroom, morning sun". | `FloorPicker` | **Fixed**: finder (bedrooms, sunlight) over the lift panel; carried to the floor page, which fades the apartments that don't match. |
| 5 | **The action gets lost on phones.** The apartment page stacks a 72 dvh stage over a long panel; anything at the end of it is never seen. | `.apt-panel` at ≤ 900 px | **Fixed**: the actions are a bar pinned to the bottom of the screen on phones. |
| 6 | **Links don't keep the view.** Sharing an apartment always opened the 3D model. | `ApartmentExperience` | **Fixed**: the address bar follows the view (`?view=tour` / `?view=plan`), and Share sends that link. |
| 7 | **Heavy home page.** About 10 MB of models (environment.glb 6.2 MB, A.glb 2.8 MB, B.glb 2.6 MB), 4.2 MB of PNG AO maps, a 1.2 MB HDRI and a 5.2 MB film, plus animated cars, people and night lights. | `public/models/blocks`, `BuildingScene` | Open: see roadmap |
| 8 | **The apartment page opens on the least useful view.** The 3D model shows first; buyers decide on the plan and the 360° photos. | `ApartmentExperience` default `mode` | Open: recommend the 2D plan as default (instant, light), tour one tap away |
| 9 | **Apartment page has no loader**: a blank stage while three.js and the model download. | `stage-loading` is an empty div | Open |
| 10 | **The finder doesn't reach the 3D meshes** on the floor page; tags, 2D plan and list fade, the 3D apartments don't. | `three/FloorScene` | Open |

## Layout

Panels stay **solid white**, not glass: behind them is a busy textured city and building, and solid panels
keep AA contrast without guessing what the canvas shows. Over the canvas, only small solid chips (tags,
the view switch, the tour bar), which is what the site already does.

Desktop, floor and apartment pages (unchanged grid, actions added to the panel):

```
┌──────────────────────────────────────────────┬──────────────────────┐
│ ← All floors                                 │ [ Book a viewing ][⇪]│  ← UnitActions
│ Block B, floor 12                            │──────────────────────│
│ Highlighted: 1 bedroom · morning sun  Clear  │ Rooms and sizes      │
│ [ 3D model | 2D plan | 360° tour ]           │  Living   … 24.1 m²  │
│                                              │  …                   │
│               3D / plan / tour               │──────────────────────│
│                                              │ Finishes             │
│                                    hint …    │ ‹ Prev     Next ›    │
└──────────────────────────────────────────────┴──────────────────────┘
```

Phone (≤ 900 px):

```
┌───────────────────────────┐
│ ← Block B, floor 12       │
│ Apartment B1203           │
│ [3D | 2D | 360°]          │
│        stage 72dvh        │
├───────────────────────────┤
│ Rooms and sizes           │
│ …                         │   panel scrolls under the bar
├───────────────────────────┤
│ [  Book a viewing  ] [⇪]  │   fixed, above the home indicator
└───────────────────────────┘
```

Home, lift column (finder added between the figures and the lift):

```
Homes for sale 155 │ Floors 26 │ Layouts 6
Bedrooms  [Any] [1] [2]
Sunlight  [Any] [Morning sun] [Evening sun]
┌ lift panel: counts per floor follow the finder; floors with no match fade ┐
```

## Design tokens

The site is plain CSS with variables in `:root` (`globals.css`), not Tailwind; keep it that way. The
palette is already coherent (architect's board, navy ink, amber for actions, blue for selection). What is
missing is a scale for the values that are currently typed out by hand (radii 7, 8, 10, 12, 20, 999 px;
dozens of font sizes). Proposed, to adopt gradually as files are touched:

```css
:root {
  /* colour: existing */
  --board: #e9edf0; --paper: #fff; --ink: #14233b; --stone: #586577; --line: #cbd3db;
  --sky: #2f6fde;   /* selection, focus */
  --amber: #f2b632; /* actions only: Book, Choose your floor */
  --amber-soft: #fdf1cf;
  /* colour: status (now literal hex in .status-*) */
  --ok: #2f9d5b; --held: #d39b1f; --gone: #aab4bf;

  /* type: one scale (1.125 ratio) */
  --fs-xs: 0.75rem; --fs-sm: 0.8125rem; --fs-md: 0.9375rem; --fs-base: 1rem;
  --fs-lg: 1.125rem; --fs-xl: 1.5rem; --fs-2xl: clamp(1.9rem, 2.7vw, 2.7rem);

  /* space: 4 px steps */
  --s-1: 0.25rem; --s-2: 0.5rem; --s-3: 0.75rem; --s-4: 1rem; --s-6: 1.5rem; --s-8: 2rem;

  /* shape */
  --r-sm: 8px;   /* buttons, inputs */
  --r-md: 12px;  /* cards, stat tiles */
  --r-lg: 20px;  /* panels, the lift */
  --r-full: 999px;
  --shadow-1: 0 2px 10px rgb(20 35 59 / 0.18);   /* tags over 3D */
  --shadow-2: 0 18px 40px rgb(20 35 59 / 0.22);  /* floating panels */

  /* touch */
  --tap: 44px;  /* minimum target on phones */
}
```

Rules: amber means "do something" and nothing else; status is a dot plus a word, never colour alone;
text over the canvas always sits on a solid chip.

## Built on this branch

- `src/lib/unitFilter.ts`: the finder's logic (bedrooms, morning / evening sun from the unit's facing),
  URL round trip (`?beds=1&sun=am`).
- `src/components/UnitActions.tsx`: Book a viewing (calls sales when `SALES_PHONE` is set, else the home
  contact section) and Share (share sheet on phones, copy link elsewhere, the link shown to copy by hand if
  the clipboard is blocked).
- `FloorPicker`: the finder; lift counts, figures and the floor tag follow it; floor links carry it.
- `FloorExperience`: reads the finder from the URL, fades non-matching apartments, says what is highlighted
  with a Clear button, keeps it on previous/next floor; actions at the end of the panel.
- `ApartmentExperience`: actions at the top of the panel; the view is kept in the URL.
- Texts in English, Mongolian and Chinese (`find`, `cta` in `src/i18n`). **Have a native speaker check
  the Mongolian and Chinese.**

## Roadmap

**Quick wins (a day each)**
1. Fill in `SALES_PHONE`; add Messenger / Viber links next to it in `UnitActions`.
2. Default the apartment page to the 2D plan (`useState<Mode>('plan')`), tour one tap away.
3. A loader on the apartment page: reuse `.stage-loader` with drei's `useProgress`, as the home page does.
4. ~~Convert the three AO maps (`*_AO.png`, 4.2 MB) to WebP or KTX2.~~ Done differently: nothing loaded them, so they were removed.
5. Turn off traffic, people and night lights on phones and when `navigator.hardwareConcurrency <= 4`.

**Medium (about a week)**
1. Callback form ("leave your number, we call you"), posting to email or a Google Sheet; the Book button
   opens it as a sheet on phones and a dialog on desktop, prefilled with the apartment number.
2. Prices and real availability from one editable source (a Google Sheet read at build time, or a small
   admin page), so the status colours mean something. Add price and a price filter to the finder then.
3. Fade non-matching apartments in the floor page's 3D view too (`FloorScene` material opacity).
4. Mesh simplification for `environment.glb` (6.2 MB) with `gltf-transform simplify` + meshopt; load the
   street after the towers (already deferred) at a lower LOD on phones.

**Big (a month or more)**
1. Compare up to three apartments side by side, and save favourites (local, no account).
2. A low-end path: on weak GPUs or Save-Data, skip WebGL entirely and show the renders, 2D plans and photo
   tours (all already exist), with the same finder and actions.
3. Analytics on the funnel (finder used → floor opened → apartment opened → Book tapped), to decide what
   to build next on evidence rather than taste.
