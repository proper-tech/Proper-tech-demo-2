"""Clean up the plan-D scene (see fixes.py) and save it as interior/D.blend with its stops.
python3 -I fix_scene.py <source blend> <fixes.py> <out dir>"""
import sys, json
import bpy
src, fx, out = sys.argv[1:4]
bpy.ops.wm.open_mainfile(filepath=src)
exec(open(fx).read())
remove_fireflies(); remove_lanterns(); remove_table_flowers(); move_soaps(); teak_deck()
fit_plants({'living': (10.95, 17.9, 15.75, 21.0), 'bed_d3': (15.9, 17.9, 20.55, 21.0), 'balcony': (20.7, 17.9, 21.85, 21.0)}, small=('balcony',))
CAMS = dict(entry=(11.45, 12.75, 1.5), kitchen=(13.3, 15.25, 1.5), living=(13.85, 17.55, 1.5), hall=(16.3, 17.22, 1.5),
            bed_d3=(17.25, 19.0, 1.5), bed_d4=(19.6, 16.9, 1.5), bath_d2=(15.45, 16.14, 1.5), bath_d5=(17.3, 16.47, 1.4),
            balcony=(21.27, 19.55, 1.5))
json.dump({k: list(v) for k, v in CAMS.items()}, open(f'{out}/D_cams.json', 'w'), indent=1)
try: bpy.ops.outliner.orphans_purge(do_recursive=True)
except Exception as e: print('purge', e)
bpy.ops.wm.save_as_mainfile(filepath=f'{out}/D.blend', compress=True)
print('saved D')
