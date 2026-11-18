SEBOTSE - apartment D: furnished interior concept

Open SEBOTSE_3D_tour.html in a modern desktop browser. The tour is self-contained
and works offline. Drag to look around, pinch or use +/- to zoom, and use the
room thumbnails, numbered plan markers or doorway arrows to move between views.

Doors and navigation
The bathrooms have satin painted panel doors, fitted casings, edge reveals,
metal lever handles, privacy hardware, thresholds and small WC identification
plaques. The entrance has a paneled walnut door. Both bedrooms have open leaves
and matching casings. These changes appear in all eight panoramas and the plan.
Arrows target measured door faces, open doorways and clear passage points.
They follow adjacent rooms instead of pointing through walls or furniture.
The ring center is the navigation anchor; the room label sits beneath it.
Selecting an arrow opens a suitable arrival view of the destination room.
All rooms remain directly available through thumbnails and the top view.

Interior options
Choose Warm Neutral, Dark Blue, Sage or Charcoal in Interior colors. The chosen
palette follows you between rooms and in the furnished overhead plan, and is
retained in this browser when local storage permits. Doors, wood, porcelain and
most fixtures retain their original finishes; walls and selected fabrics change.
These previews preserve texture and existing shading but do not recalculate
indirect illumination or every reflection. Scripts/apply_palette.py changes the
model's materials for a new physical render and does not automatically save it.
The delivered editable model uses Warm Neutral materials.

Bathrooms and top view
D5 has a bathtub, toilet and basin. D2 has a shower, toilet and basin.
Use their fixture buttons to look directly at each fitting.
Choose Top view, then Enlarge, for a furnished view directly from above.
Numbered markers and the room list enter the room. The direction wedge follows
the current camera. Escape collapses the enlarged plan before leaving the tour.
The overhead rendering lifts off the ceiling, lintels, overhead fixtures and
upper kitchen cupboards; wall tops are lowered to reveal the room connections.
Those presentation changes do not modify the editable interior scene.

Retained refinements
Draped bedding, layered pillows, rolled-back sheets, woven fabrics, detailed
cabinetry and kitchen fittings, door hardware, bathroom fixtures, mirrors,
tile joints, towels, entry console, coat hooks, artwork and dining settings.
The plant beside the D4 doorway and the living-room floor lamp remain removed.

Files
SEBOTSE_3D_tour.html: offline interactive tour with all images and color data.
SEBOTSE_D_Realistic.blend: editable Blender 5.2 scene with packed textures/HDRI.
Panoramas/: eight native 2560 x 1280 equirectangular JPEGs, Cycles denoised.
Masks/: 16 matched geometric material masks for selective color previews.
TopView/: four 1600 x 1440 palette JPEGs and orthographic camera alignment.
Scripts/navigation.json: 14 directional doorway/passage anchors.
navigation_visibility.json: camera-to-anchor visibility checks in the model.
Scripts/: rendering, palette and historical geometry-refinement scripts.

Rendering and editing
The editable scene retains a 4096 x 2048 / 48-sample preset for future renders.
The supplied panoramas are native 2560 x 1280, not 4K. To render new 4K images:
blender --background --disable-autoexec SEBOTSE_D_Realistic.blend --python Scripts/render_tour.py -- 4096 96
This script uses an available Cycles GPU and falls back to CPU. It also checks
the navigation anchors against visible scene geometry. render_topdown.py creates
the overhead image and two palette data masks from the editable scene.
The upgrade/finish scripts document changes already applied to this model;
do not run them again on the refined scene. The palette helper can be reused.

Project scope
This update covers apartment D; the other units remain floor-plan previews.
The existing structural shell and all eight camera positions are retained.
The supplied shell was approximate; its README stated approximately 10-20 cm
accuracy. Finishes, furniture, door hardware and bathroom details are conceptual,
not CAD-verified construction specifications. The outdoor environment is
illustrative and is not a verified view from the project site.

Asset credits
Furniture, plants and vase: Khronos glTF Sample Assets / Wayfair, CC BY 4.0.
HDRI: Poly Haven, Potsdamer Platz, CC0.
New procedural materials and modeled details: this refinement.

---
Note for this repository: the panoramas in public/media/360/D are these renders rolled by half a
turn (180°) and re-encoded, so their sha256 no longer match panorama_manifest.json.
