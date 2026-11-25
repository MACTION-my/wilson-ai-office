"""Turn a Hunyuan3D shape + the full-body image into a light, textured GLB plus rig landmarks.
Front-facing triangles are textured from the image (front projection); back-facing ones from a
'back' copy of the image whose head is painted in the hair colour."""
import sys, json
import numpy as np, trimesh, fast_simplification
from PIL import Image, ImageFilter

ROOT = 'C:/Users/Surface Laptop 4/Desktop/AI Office/'
BODY, MOD, OUT = ROOT + 'art-src/body/', ROOT + 'art-src/models/', ROOT + 'public/models/'
import os; os.makedirs(OUT, exist_ok=True)

def silhouette(img):
    a = np.asarray(img.convert('RGB')).astype(np.int16)
    k = 12; corners = np.concatenate([a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3), a[-k:, :k].reshape(-1, 3), a[-k:, -k:].reshape(-1, 3)])
    bg = np.median(corners, 0)
    m = np.abs(a - bg).sum(2) > 45                    # differs from the background colour
    # keep only the largest blob that touches the image centre column (drops soft floor shadows)
    rows = np.where(m.any(1))[0]
    return m

def fill_bg(img, mask, it=24):
    a = np.asarray(img.convert('RGB')).astype(np.float32); m = mask.copy()
    for _ in range(it):
        acc = np.zeros_like(a); cnt = np.zeros(m.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            sm = np.roll(m, (dy, dx), (0, 1)); sa = np.roll(a, (dy, dx), (0, 1))
            acc += sa * sm[..., None]; cnt += sm
        grow = (~m) & (cnt > 0)
        a[grow] = acc[grow] / cnt[grow][:, None]; m = m | grow
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))

def run(id):
    img = Image.open(BODY + id + '.png').convert('RGB')
    mask = silhouette(img)
    ys, xs = np.where(mask); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    img, mask = img.crop((x0, y0, x1 + 1, y1 + 1)), mask[y0:y1 + 1, x0:x1 + 1]
    H, W = mask.shape
    # landmarks from the silhouette
    widths = mask.sum(1)
    top = 0; neck = int(H * 0.12) + int(np.argmin(widths[int(H * 0.12):int(H * 0.36)]))
    cx = W // 2
    crotch = H - 1
    for r in range(H - 1, int(H * 0.35), -1):          # bottom-up: first row where the centre column is filled
        if mask[r, cx - 1:cx + 2].any(): crotch = r; break
    # torso half-width per row: the run of filled pixels around the centre column
    torso = []
    for r in range(H):
        row = mask[r]
        if not row[cx]: torso.append(0.0); continue
        l = cx
        while l > 0 and row[l - 1]: l -= 1
        rr = cx
        while rr < W - 1 and row[rr + 1]: rr += 1
        torso.append(max(cx - l, rr - cx) / W)
    # hair colour: just under the top of the head, centre
    hy = int(H * 0.025); hair = np.asarray(img)[hy:hy + 6, cx - 8:cx + 8].reshape(-1, 3).mean(0)
    # front + back atlas
    core = mask.copy()
    for _ in range(3): core = core & np.roll(core, 1, 0) & np.roll(core, -1, 0) & np.roll(core, 1, 1) & np.roll(core, -1, 1)
    filled = fill_bg(img, core, 40)
    HL = {'wilson': 0.2, 'nana': 0.27, 'lulu': 0.3}.get(id, 0.37)
    back = np.asarray(filled).copy()
    head = np.zeros_like(mask); hn = int(H * 0.23); head[:hn] = mask[:hn]
    for r in range(hn, int(H * HL)):
        hw = int(max(torso[r] * W * 0.95, W * 0.07)); head[r, max(0, cx - hw):cx + hw] = mask[r, max(0, cx - hw):cx + hw]
    back = np.asarray(Image.fromarray(back).filter(ImageFilter.GaussianBlur(7))).copy()
    rng = np.random.default_rng(3); strands = (np.sin(np.arange(W)[None, :] * 0.9 + rng.random((1, W)) * 6) * 10 + rng.normal(0, 4, (H, W)))[..., None]
    back[head] = (hair[None, :] + strands[head]).clip(0, 255).astype(np.uint8)
    back = Image.fromarray(back).filter(ImageFilter.GaussianBlur(1.0))
    TW, TH = 512, 1024
    atlas = Image.new('RGB', (TW * 2, TH)); atlas.paste(filled.resize((TW, TH), Image.LANCZOS), (0, 0)); atlas.paste(back.resize((TW, TH), Image.LANCZOS), (TW, 0))
    # mesh
    m = trimesh.load(MOD + id + '_shape.glb', force='mesh')
    # vertex-clustering decimation (keeps winding); ~18k triangles
    g = np.ptp(m.vertices[:, 1]) / 100
    _, inv = np.unique(np.round(m.vertices / g).astype(np.int64), axis=0, return_inverse=True); inv = inv.reshape(-1)
    nv = inv.max() + 1; v = np.zeros((nv, 3)); np.add.at(v, inv, m.vertices); v /= np.bincount(inv, minlength=nv)[:, None]
    f = inv[m.faces]; ok = (f[:, 0] != f[:, 1]) & (f[:, 1] != f[:, 2]) & (f[:, 0] != f[:, 2]); f = f[ok]
    _, keep = np.unique(np.sort(f, 1), axis=0, return_index=True); f = f[np.sort(keep)]
    m = trimesh.Trimesh(v, f, process=False)
    v = m.vertices.copy()
    low = v[:, 1] < v[:, 1].min() + 0.06 * (v[:, 1].max() - v[:, 1].min())
    zc = np.median(v[:, 2])
    if (zc - v[low, 2].min()) > (v[low, 2].max() - zc): v[:, [0, 2]] *= -1        # toes point to +z = front
    mn, mx = v.min(0), v.max(0); h = mx[1] - mn[1]
    v = (v - [(mn[0] + mx[0]) / 2, mn[1], np.median(v[:, 2])]) / h               # height 1, feet at 0, centred
    m = trimesh.Trimesh(v, m.faces, process=False)
    # map mesh x/y to the silhouette box
    xmn, xmx = v[:, 0].min(), v[:, 0].max()
    def uv_of(p, side):
        u = (p[:, 0] - xmn) / (xmx - xmn); vv = p[:, 1]          # 0 bottom .. 1 top
        u = u.clip(0.002, 0.998) * 0.5 + (0.5 if side else 0.0)
        return np.stack([u, vv.clip(0.002, 0.998)], 1)
    fn = m.face_normals
    tri = v[m.faces].reshape(-1, 3)
    side = np.repeat(fn[:, 2] < 0, 3)
    uv = np.zeros((len(tri), 2))
    uv[~side] = uv_of(tri[~side], 0); uv[side] = uv_of(tri[side], 1)
    faces = np.arange(len(tri)).reshape(-1, 3)
    mat = trimesh.visual.material.PBRMaterial(baseColorTexture=atlas, metallicFactor=0.0, roughnessFactor=0.75)
    out = trimesh.Trimesh(tri, faces, visual=trimesh.visual.TextureVisuals(uv=uv, material=mat), process=False)
    out.export(OUT + id + '.glb')
    lm = {'neck': 1 - neck / H, 'crotch': 1 - crotch / H, 'width': float(xmx - xmn), 'torso': [round(torso[min(H - 1, int((1 - k / 63) * (H - 1)))] * float(xmx - xmn), 4) for k in range(64)], 'hair': [int(c) for c in hair]}
    if lm['crotch'] < 0.3: lm['crotch'] = 0.41      # legs touch or a skirt: no gap to measure
    if lm['neck'] > 0.84: lm['neck'] = 0.8          # long hair hides the neck
    json.dump(lm, open(OUT + id + '.json', 'w'))
    print(id, 'faces', len(faces), 'kb', os.path.getsize(OUT + id + '.glb') // 1024, 'neck', round(lm['neck'], 3), 'crotch', round(lm['crotch'], 3))

for id in sys.argv[1].split(','): run(id)
