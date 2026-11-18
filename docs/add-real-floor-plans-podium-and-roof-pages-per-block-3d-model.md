# Add real floor plans, podium and roof pages, per-block 3D model

This adds floor pages for the podium (block A, floors 1–4) and for each tower's roof, splits the
3D model into one file per block so blocks can be worked on separately and merged, and models the
stairs, lifts and escalators. Everything is traced from the drawings in hand: the site DWG,
sections, elevations, podium plans and the roof plan.

**Merged with `main`.** `main` meanwhile got the real apartment floors for towers B and C, built
from the full schematic design (sheets 17–20): 155 apartments, the homeowners' association room on
floor 4 of block B, the capacity figures, unit numbers like `B1203`. Where this branch had traced
the same flats from two screenshots, `main`'s version was kept and this branch's additions were
ported on top of it; the apartment section below says what is whose.

## Block key

| Block | What | Floors |
| --- | --- | --- |
| A | Podium: shops and services, roof playground | 1–3, roof playground as floor 4 |
| B | Apartment tower on the main road (north) | 4–16, technical floor on the roof (17) |
| C | Apartment tower to the south | 4–16, technical floor on the roof (17) |
| D | Annex: garage B1, car service floor 1, garage floors 2–3 | not modelled in detail yet |

The towers were called A/B before; they are now B/C to match the drawings.

## What changed

### 3D model (`scripts/`, `public/models/`)

- One GLB per block in `public/models/blocks/` (`A`, `B`, `C`, `D`, `site`), merged into
  `public/models/complex.glb` by the new `scripts/merge-blocks.py`. Every export uses the same
  settings, so the blocks always merge cleanly.
- **Block A** is built from the elevations, sections and podium plans:
  - storeys of 4.5 / 3.6 / 3.6 m;
  - the recessed shopfront and open walkway under tower C;
  - the glazed volume on X1–X2;
  - the external steel stair;
  - the roof playground.
- **Towers B and C** are now 25.7 × 21.4 m from floor 4 up (`PLATE` in `building.ts`, from `main`'s
  traced floor plate), overhanging the podium as the typical floor plan and section 1-1 show. The
  site DWG's 22.6 × 22.0 m rectangle is the podium under each tower and is still used for that. The
  offset lives in `towerPlate()` (`building.ts`) and `plate()` (`build-model.py`); keep the two in
  step.
- **Technical floor** on each tower roof: walls on grid lines X4–X5 / Y4–Y2 (tower C) and
  X5–X6 / Y12–Y10 (tower B), from +50.7 to +54.7 m.

### Apartment floors, towers B and C

The apartment data (`layouts.ts`, `building.ts`, `types.ts`, the apartment and home pages, the 2D
floor plan) is `main`'s: six plans A–F, areas from the room schedule, L-shaped rooms as joined
rectangles, 155 apartments, unit numbers like `B1203`. On top of it this branch adds:

- **Floor page:** each plan's floor is painted its own colour in the 3D view (furniture and walls
  stay as on the apartment page). The same colour is on the tag, the list entry and the 2D plan
  (`flatColors` in `layouts.ts`). Tags stay inside the frame, and on phones show the ID only. The
  camera starts looking down steeply and steps back on narrow screens.
- **Stair and lifts:** the stair and lifts in the core are modelled (`three/Cores.tsx`) in place of
  grey boxes, fitted into `main`'s core rectangles; the stair's flight down opens a hole in the slab.
- **Availability:** every apartment is for sale. `main`'s placeholder mix of sold and reserved was
  removed on request; `status` in `building.ts` is the one place to connect a sales list.
- **Roof link:** "Floor above" on floor 16 goes to the roof page.

### Podium floors, block A (`src/data/podium.ts`, `PodiumFloorExperience`, `three/PodiumScene`)

- **Floors 1–4** open from the lift panel's "Podium" tab and from bands on the 3D building.
  Each has a 3D view, a 2D plan and a room list with numbers and areas from the schedules.
- **Cores:** stairs, lifts and escalators on floors 1–3 are modelled. Floor 1 has a down flight
  to the basement, floors 2–3 have the escalator void.
- **Floor 1 furniture:** supermarket shelving fitted to the room, tills and chillers, store
  racks, staff room, office, toilets, lobby mailboxes and benches.

### Roof, towers B and C (`src/data/roof.ts`)

- **Pages:** `/floors/B/17` and `/floors/C/17` show the technical floor. Tower C has stair 117 and
  technical rooms 116 and 118; tower B, mirrored, has 113, 114 and 115. Each tower is 85.8 m² of
  the schedule's 171.5 m².
- **Ways in:** the "R" button on the lift panel, the technical block on the 3D building, and
  "Floor above" on floor 16.

### Shared pieces

- `src/components/three/Cores.tsx`: stairs (two flights, half landing, the flight down through a
  slab opening, rails, walls with a door), lifts (shafts, cars, doors where they stop) and
  escalators (30° pairs, glass balustrades, void for the pair arriving from below). Used by the
  tower, podium and roof scenes.
- New furniture pieces (`gondola`, `checkout`, `chiller`, `rack`, `bench`) in
  `three/Furniture.tsx`.
- All new text is in English, Mongolian and Chinese.

## Rebuilding the 3D model

```bash
B=/Applications/Blender.app/Contents/MacOS/Blender
$B --background --python scripts/build-model.py -- src/data/site.json public/models/blocks
$B --background --python scripts/merge-blocks.py -- public/models/blocks public/models/complex.glb
```

A single block can be rebuilt or edited by hand in Blender, as long as it's exported with the same
settings. Re-run the merge afterwards. The merge reads only `A`, `B`, `C`, `D` and `site`;
`environment.glb`, which `main` added to the same folder, is not merged into the complex.

## To confirm with the architect

These are guesses where the drawings are silent:

- Tower B's stair and lifts are drawn mirrored on its roof plan, but `main`'s apartment floor
  uses one core for both towers. The stair and lifts follow `main`'s core; only the roof stair is
  mirrored on tower B.
- Door positions of the podium stairs, and of the stair onto the roof; the roof stair continuing
  up (tower B's plan marks it "UP").
- The tower lifts open only on floor 1 of the podium, where their lobbies are.
- Which way the escalators run.
- The floor-1 fit-out: the plans show almost no furniture, so this is a plausible layout.
- Store 109 and the corridor beside it overlap by about 1.7 m in the traced podium plan.
- Which side of the stair and lifts the doors open on in `main`'s core: east for the stair, south
  for the lifts, both onto the lift lobby.

## Checked

- The type check and the production build pass. The build generates 567 pages: 155 apartments,
  every floor, podium floor and roof, in all three languages.
- After the merge with `main`, checked in the browser: floors 4 and 11 of the towers (including
  block B's floor 4 with the association room), an apartment page, the home page with the new
  facts and layouts table, podium floor 1 and both roofs.
- Before the merge, the floor pages were also checked at phone width, and a script checked the
  traced floor (rooms, doors, reachability, areas). That script was for this branch's own tracing,
  which `main`'s data replaced.

## Not in this commit

The reference screenshots of the drawings (`A block pictures/`, `C,B block apts picture/`, about
29 MB), `.DS_Store` and the local `.claude/` preview config.
