# Add real floor plans, podium and roof pages, per-block 3D model

This commit replaces the mock apartment floors with the architect's typical floor plan for towers
B and C. It adds floor pages for the podium (block A, floors 1–4) and for each tower's roof. It
splits the 3D model into one file per block, so blocks can be worked on separately and merged.
Everything is traced from the drawings in hand: the site DWG, sections, elevations, podium plans,
the typical floor plan of B/C and the roof plan.

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
- **Towers B and C** are now 25.4 × 21.6 m from floor 4 up, overhanging the podium as the typical
  floor plan and section 1-1 show. The site DWG's 22.6 × 22.0 m rectangle is the podium under
  each tower and is still used for that. The offset lives in `towerPlate()` (`building.ts`) and
  `plate()` (`build-model.py`); keep the two in step.
- **Technical floor** on each tower roof: walls on grid lines X4–X5 / Y4–Y2 (tower C) and
  X5–X6 / Y12–Y10 (tower B), from +50.7 to +54.7 m.

### Apartment floors, towers B and C (`src/data/layouts.ts`, `building.ts`)

- **Flats:** six per floor, A–F, traced from the typical floor plan. D, E and F are mirror images
  of C, B and A.
- **Areas** come from the room schedule: A/F 67.9 m², B/E 50.3 m², C/D 85.1 m². Rooms are
  rectangles accurate to about 0.2 m.
- **Core:** stair 602, two lifts and corridor 601. Tower B's core is mirrored (stair to the
  east), as its roof plan shows.
- **Apartment IDs** are tower + floor + letter, e.g. `C12D`.
- **Availability:** every apartment is for sale (placeholder until a sales list is connected).
- **Floor page:**
  - Flats are furnished, and each flat's floor is painted its own colour.
  - The same colour is used on the tag, the list entry and the 2D plan.
  - Tags stay inside the frame; on phones they show the ID only.
- **Apartment page:** shows the schedule areas. The traced room sizes and ceiling heights are
  gone, since the drawings don't give them. The 3D view and 2D plan now have north at the top.
- **Home page:** the layouts table lists the six flats, with area and position.

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
settings. Re-run the merge afterwards.

## To confirm with the architect

These are guesses where the drawings are silent:

- Floor 4 of B and C uses the typical plan (drawn for floors 5–16).
- Tower B's flats keep the same letters by position (A = north-west); only its core is mirrored.
- Door positions of the podium stairs, and of the stair onto the roof; the roof stair continuing
  up (tower B's plan marks it "UP").
- The tower lifts open only on floor 1 of the podium, where their lobbies are.
- Which way the escalators run.
- The floor-1 fit-out: the plans show almost no furniture, so this is a plausible layout.
- Store 109 and the corridor beside it overlap by about 1.7 m in the traced podium plan.
- The 2.7 m room height used to draw apartments (only 3.0 m floor to floor is given).

## Checked

- The type check and the production build pass. The build generates 570 pages: every
  apartment, floor, podium floor and roof, in all three languages.
- The floor pages, apartment pages, podium floors 1–4 and both roofs were checked in the browser
  on desktop, and the floor page on phone width too.
- A script checked the traced floor: no overlapping rooms; every door joins two rooms; every room
  can be reached from the front door; every front door opens onto corridor 601; schedule areas add
  up per flat.

## Not in this commit

The reference screenshots of the drawings (`A block pictures/`, `C,B block apts picture/`, about
29 MB), `.DS_Store` and the local `.claude/` preview config.
