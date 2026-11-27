# SPDX-License-Identifier: MIT
"""Pack MPFB/MakeHuman CC0 data (base mesh + macro targets) into compact binaries for the web runtime.
Usage: python tools/export_data.py [MPFB_DIR] [OUT_DIR]
Output (web/data): mesh.bin, meta.json, macro.json, targets/<name>.bin
 targets/*.bin = uint16 count N, then N x uint16 vertex index, then N x 3 x int16 deltas (units of meta.deltaStep decimetres).
 deltaStep is derived from the largest |delta| over all targets, so nothing is clipped (the baby race targets reach
 10.67 dm; a fixed 0.0003 dm step capped deltas at 9.83 dm and deformed babies / children by up to 8 cm).
"""
import sys, os, gzip, json, struct, glob, shutil
import numpy as np

MPFB = sys.argv[1] if len(sys.argv) > 1 else os.path.expandvars(
    r"%APPDATA%\Blender Foundation\Blender\5.2\extensions\user_default\mpfb\data")
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "web", "data")
os.makedirs(os.path.join(OUT, "targets"), exist_ok=True)

# --- base mesh (body group only: vertices 0..NBODY-1) ---
groups = json.load(open(os.path.join(MPFB, "mesh_metadata", "basemesh_vertex_groups.json")))
NBODY = groups["body"][0][1] + 1
v, vt, faces = [], [], []
for line in open(os.path.join(MPFB, "3dobjs", "base.obj")):
    p = line.split()
    if not p: continue
    if p[0] == "v": v.append([float(x) for x in p[1:4]])
    elif p[0] == "vt": vt.append([float(x) for x in p[1:3]])
    elif p[0] == "f": faces.append([tuple(int(i) - 1 for i in c.split("/")[:2]) for c in p[1:]])
body = [f for f in faces if all(c[0] < NBODY for c in f)]
key = {}; orig = []; uv = []; idx = []
def vid(c):
    if c not in key:
        key[c] = len(orig); orig.append(c[0]); uv.append(vt[c[1]])
    return key[c]
for f in body:
    ids = [vid(c) for c in f]
    for tri in ([0, 1, 2], [0, 2, 3]) if len(ids) == 4 else ([0, 1, 2],):
        idx += [ids[t] for t in tri]
assert NBODY <= 65536, "uint16 vertex indices in targets/*.bin need NBODY <= 65536"
pos = np.array(v[:NBODY], dtype=np.float32)
with open(os.path.join(OUT, "mesh.bin"), "wb") as fh:
    fh.write(pos.tobytes()); fh.write(np.array(uv, np.float32).tobytes())
    fh.write(np.array(orig, np.uint32).tobytes()); fh.write(np.array(idx, np.uint32).tobytes())
# --- macro targets ---
shutil.copy(os.path.join(MPFB, "targets", "macrodetails", "macro.json"), os.path.join(OUT, "macro.json"))
loaded = []
for sub in ("", "height", "proportions"):
    for path in sorted(glob.glob(os.path.join(MPFB, "targets", "macrodetails", sub, "*.target.gz"))):
        base = os.path.basename(path)[:-len(".target.gz")]
        name = "macrodetails/" + (sub + "/" if sub else "") + base
        idxs, dl = [], []
        for line in gzip.open(path, "rt"):
            p = line.split()
            if len(p) == 4 and not line.startswith("#"):
                i = int(p[0])
                if i < NBODY: idxs.append(i); dl.append([float(x) for x in p[1:]])
        assert len(idxs) <= 65535, f"{name}: {len(idxs)} vertices do not fit the uint16 count"
        loaded.append((name, np.array(idxs, "<u2"), np.array(dl, np.float64).reshape(-1, 3)))
assert loaded, "no macro targets found under " + os.path.join(MPFB, "targets", "macrodetails")
max_abs = max(float(np.abs(d).max()) if d.size else 0.0 for _, _, d in loaded)
DELTA_STEP = max_abs / 32767 * 1.0001          # decimetres per int16 step; the 1e-4 margin guards rounding
names = []
for name, idxs, d in loaded:
    q = np.round(d / DELTA_STEP)
    assert np.abs(q).max(initial=0) <= 32767, name
    with open(os.path.join(OUT, "targets", name.replace("/", "__") + ".bin"), "wb") as fh:
        fh.write(struct.pack("<H", len(idxs))); fh.write(idxs.tobytes()); fh.write(q.astype("<i2").tobytes())
    names.append(name)
meta = {"nBody": NBODY, "nVerts": len(orig), "nIdx": len(idx), "deltaStep": DELTA_STEP,
        "bbox": [pos.min(0).tolist(), pos.max(0).tolist()]}
print("mesh: body verts", NBODY, "render verts", len(orig), "tris", len(idx) // 3, "bbox", meta["bbox"])
print("max |delta| %.4f dm, step %.3g dm (resolution %.4f mm)" % (max_abs, DELTA_STEP, DELTA_STEP * 100))
meta["targets"] = sorted(names)
json.dump(meta, open(os.path.join(OUT, "meta.json"), "w"))
tot = sum(os.path.getsize(f) for f in glob.glob(os.path.join(OUT, "targets", "*.bin")))
print("targets:", len(names), "total MB", round(tot / 1e6, 1))
