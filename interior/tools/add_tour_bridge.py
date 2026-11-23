"""Let the site drive a self-contained tour shown in its iframe (same origin). Idempotent.

window.sebotseTour.go(room, yaw, pitch, fov)  open a room facing yaw/pitch (the tour's degrees) with a vertical fov
window.sebotseTour.state()                    {room, yaw, pitch, fov} of the view now
window.sebotseTour.heading(room)              the heading the tour opens that room with
window.sebotseTour.shown = (room, quality) => …  called whenever a room's picture is on screen (1 preview, 2 full)

The apartment page flies its 3D camera into a room and fades the tour in at the same place and heading
(src/components/ApartmentExperience.tsx), and flies back out from wherever the tour was left.
Run: python3 -I add_tour_bridge.py <tour html> [...]
"""
import sys

FOV_OLD = "interiorTour.camera.updateProjectionMatrix(); }\n    interiorTour.pointers.clear();"
FOV_NEW = ("interiorTour.camera.updateProjectionMatrix(); }\n"
           "    if (interiorTour.pendingView) {\n"
           "      const view = interiorTour.pendingView;\n"
           "      interiorTour.pendingView = null;\n"
           "      if (view.pitch != null) interiorTour.pitch = view.pitch;\n"
           "      if (view.fov && interiorTour.camera) { interiorTour.camera.fov = view.fov; interiorTour.camera.updateProjectionMatrix(); }\n"
           "    }\n"
           "    interiorTour.pointers.clear();")
SHOWN_OLD = "      tourElement('pano').dataset.quality = quality === 2 ? 'full' : 'preview';\n"
SHOWN_NEW = SHOWN_OLD + "      if (window.sebotseTour && window.sebotseTour.shown) window.sebotseTour.shown(room, quality);\n"
ANCHOR = "function changeTourRoom(room, heading) {"
BRIDGE = """// BEGIN SITE BRIDGE
window.sebotseTour = {
  shown: null,
  go(room, yaw, pitch, fov) {
    interiorTour.pendingView = { pitch, fov };
    changeTourRoom(room, yaw);
  },
  state() {
    return { room: interiorTour.room, yaw: interiorTour.yaw, pitch: interiorTour.pitch, fov: interiorTour.camera ? interiorTour.camera.fov : 72 };
  },
  // the heading the tour itself opens a room with (its best view)
  heading(room) {
    return room === 'bath_d5' ? 80 : Mx[`D_${room}`] ?? 0;
  },
};
// END SITE BRIDGE
"""

for path in sys.argv[1:]:
    s = open(path, encoding='utf-8').read()
    if 'BEGIN SITE BRIDGE' in s:
        print('already', path)
        continue
    for old, new in ((FOV_OLD, FOV_NEW), (SHOWN_OLD, SHOWN_NEW), (ANCHOR, BRIDGE + ANCHOR)):
        assert s.count(old) == 1, (path, old[:40])
        s = s.replace(old, new)
    open(path, 'w', encoding='utf-8').write(s)
    print('bridge', path)
