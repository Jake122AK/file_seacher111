#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""着付け済みのキャラクターを .glb で書き出す。

    python3 game/export_dressed.py 元.glb 出力.glb

dress.js と同じ処理を Python でやり、結果を **材質付きの glTF** にする。
ゲームの中では実行時に着せていて外に持ち出せないので、他のツール
（Blender / three.js / Unity など）で開けるファイルにするのがこれ。

出力の作り:
  * 頂点バッファは1本のまま、プリミティブを材質ごとに4本に分ける
    （glTF は材質がプリミティブ単位。属性アクセサは共有できる）
  * 肌 / 白衣 / 緋袴 / 髪 に baseColor と粗さを与える
  * 表情モーフは残す。`cute` だけは基準の形に焼き込む（ゲームと同じ）
  * 骨・スキン・アニメーションは元のまま
"""
import json, struct, io, os, sys, math

SRC = sys.argv[1] if len(sys.argv) > 1 else 'character.glb'
DST = sys.argv[2] if len(sys.argv) > 2 else 'character_dressed.glb'

# ---------------------------------------------------------------------------
# 読み込み
# ---------------------------------------------------------------------------
raw = io.open(SRC, 'rb').read()
assert raw[:4] == b'glTF', 'glB ではありません'
jlen = struct.unpack('<I', raw[12:16])[0]
J = json.loads(raw[20:20 + jlen].decode('utf-8'))
BIN = raw[20 + jlen + 8:]

FMT = {5120: 'b', 5121: 'B', 5122: 'h', 5123: 'H', 5125: 'I', 5126: 'f'}
NCOMP = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}

def read_acc(i):
    """アクセサを配列で返す。bufferView が無いもの（全ゼロ）と sparse に対応。
    モーフターゲットは差分がゼロの領域を持たない形で書かれることがある。"""
    a = J['accessors'][i]
    n = a['count'] * NCOMP[a['type']]
    if 'bufferView' in a:
        bv = J['bufferViews'][a['bufferView']]
        off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        out = list(struct.unpack_from('<%d%s' % (n, FMT[a['componentType']]), BIN, off))
    else:
        out = [0] * n
    sp = a.get('sparse')
    if sp:
        c = NCOMP[a['type']]
        iv = J['bufferViews'][sp['indices']['bufferView']]
        ioff = iv.get('byteOffset', 0) + sp['indices'].get('byteOffset', 0)
        ids = struct.unpack_from('<%d%s' % (sp['count'], FMT[sp['indices']['componentType']]),
                                 BIN, ioff)
        vv = J['bufferViews'][sp['values']['bufferView']]
        voff = vv.get('byteOffset', 0) + sp['values'].get('byteOffset', 0)
        vals = struct.unpack_from('<%d%s' % (sp['count']*c, FMT[a['componentType']]), BIN, voff)
        for k, vi in enumerate(ids):
            for j in range(c):
                out[vi*c + j] = vals[k*c + j]
    return out

prim = J['meshes'][0]['primitives'][0]
A = prim['attributes']
pos = read_acc(A['POSITION'])
nrm = read_acc(A['NORMAL'])
ji  = read_acc(A['JOINTS_0'])
jw  = read_acc(A['WEIGHTS_0'])
idx = read_acc(prim['indices'])
NV = len(pos) // 3
NT = len(idx) // 3
tnames = (J['meshes'][0].get('extras') or {}).get('targetNames', [])
targets = prim.get('targets', [])

# cute は基準の形に焼き込む（ゲームでも読み込み時にそうしている）
if 'cute' in tnames:
    k = tnames.index('cute')
    d = read_acc(targets[k]['POSITION'])
    for i in range(NV * 3):
        pos[i] += d[i]

jointNodes = J['skins'][0]['joints']
jointNames = [J['nodes'][n].get('name', '') for n in jointNodes]
def jidx(name, dflt=0):
    return jointNames.index(name) if name in jointNames else dflt
headJ, hipsJ = jidx('head'), jidx('hips')
thighL, thighR = jidx('thighL'), jidx('thighR')
spineJ, chestJ, neckJ = jidx('spine'), jidx('chest'), jidx('neck')

TAU = math.tau
def clamp(v, a, b): return a if v < a else (b if v > b else v)
def lerp(a, b, t): return a + (b - a) * t
def smoothstep(a, b, x):
    t = clamp((x - a) / (b - a) if b != a else 0.0, 0.0, 1.0)
    return t * t * (3 - 2 * t)

# ---------------------------------------------------------------------------
# 1. 連結成分
# ---------------------------------------------------------------------------
par = list(range(NV))
def find(a):
    while par[a] != a:
        par[a] = par[par[a]]; a = par[a]
    return a
def uni(a, b):
    ra, rb = find(a), find(b)
    if ra != rb: par[rb] = ra
for t in range(NT):
    a, b, c = idx[t*3], idx[t*3+1], idx[t*3+2]
    uni(a, b); uni(b, c)
cnt = {}
for i in range(NV):
    r = find(i); cnt[r] = cnt.get(r, 0) + 1
bodyRoot = max(cnt, key=lambda r: cnt[r])
dom = lambda i: ji[i*4]

# ---------------------------------------------------------------------------
# 2. 頭骨の輪郭
# ---------------------------------------------------------------------------
NA, NB, Y0, Y1 = 32, 26, 1.28, 1.66
prof = [0.0] * (NA * NB)
headBones = {headJ, neckJ}
hx = hz = 0.0; hn = 0
for i in range(NV):
    if find(i) != bodyRoot or dom(i) not in headBones: continue
    y = pos[i*3+1]
    if y < Y0 or y > Y1: continue
    hx += pos[i*3]; hz += pos[i*3+2]; hn += 1
headCX, headCZ = (hx/hn, hz/hn) if hn else (0.0, 0.0)
for i in range(NV):
    if find(i) != bodyRoot or dom(i) not in headBones: continue
    y = pos[i*3+1]
    if y < Y0 or y > Y1: continue
    dx, dz = pos[i*3]-headCX, pos[i*3+2]-headCZ
    r = math.hypot(dx, dz)
    a = int((math.atan2(dz, dx)/TAU + 1.0) * NA) % NA
    b = min(NB-1, max(0, int((y-Y0)/(Y1-Y0)*NB)))
    if r > prof[a*NB+b]: prof[a*NB+b] = r
for a in range(NA):
    col = [prof[a*NB+b] for b in range(NB)]
    top = max((b for b in range(NB) if col[b] > 0), default=-1)
    bot = min((b for b in range(NB) if col[b] > 0), default=-1)
    if top < 0:
        for b in range(NB): prof[a*NB+b] = 0.10
        continue
    rTop = col[top]
    for b in range(top+1, NB):
        u = min(1.0, (b-top)/4.0)
        prof[a*NB+b] = rTop*math.sqrt(max(0.0, 1-u*u)) + 0.004
    for b in range(bot): prof[a*NB+b] = col[bot]
    for b in range(bot, top+1):
        if prof[a*NB+b] == 0:
            lo, hi = b, b
            while lo > bot and prof[a*NB+lo] == 0: lo -= 1
            while hi < top and prof[a*NB+hi] == 0: hi += 1
            prof[a*NB+b] = lerp(prof[a*NB+lo], prof[a*NB+hi], (b-lo)/max(1, hi-lo))

def profAt(ang, y):
    fa = ((ang/TAU + 1.0) % 1.0) * NA
    a0 = int(fa) % NA; a1 = (a0+1) % NA; ta = fa - int(fa)
    fb = clamp((y-Y0)/(Y1-Y0)*NB, 0, NB-1.001)
    b0 = int(fb); b1 = min(NB-1, b0+1); tb = fb - b0
    return lerp(lerp(prof[a0*NB+b0], prof[a0*NB+b1], tb),
                lerp(prof[a1*NB+b0], prof[a1*NB+b1], tb), ta)

# ---------------------------------------------------------------------------
# 3. 髪の房を落とす
# ---------------------------------------------------------------------------
grp = {}
for i in range(NV):
    r = find(i)
    if r == bodyRoot: continue
    g = grp.setdefault(r, [0, 0, 0.0])       # n, out, sy
    y = pos[i*3+1]
    dx, dz = pos[i*3]-headCX, pos[i*3+2]-headCZ
    g[0] += 1; g[2] += y
    if y > 1.36 and math.hypot(dx, dz) > profAt(math.atan2(dz, dx), y)*0.93:
        g[1] += 1
isHair = {r for r, g in grp.items() if g[2]/g[0] > 1.38 and g[1] > g[0]*0.34}
skullTop = max((pos[i*3+1] for i in range(NV)
                if find(i) == bodyRoot and dom(i) in headBones), default=1.6)
def outside(i):
    y = pos[i*3+1]
    if y > skullTop - 0.004: return True
    if y < 1.46: return False
    dx, dz = pos[i*3]-headCX, pos[i*3+2]-headCZ
    return math.hypot(dx, dz) > profAt(math.atan2(dz, dx), y)*1.10
keep = []
for t in range(NT):
    a, b, c = idx[t*3], idx[t*3+1], idx[t*3+2]
    top = max(pos[a*3+1], pos[b*3+1], pos[c*3+1])
    if find(a) in isHair or (outside(a) and outside(b) and outside(c)) \
       or top > skullTop - 0.002:
        continue
    keep.append((a, b, c))
droppedV = sum(cnt[r] for r in isHair)

# ---------------------------------------------------------------------------
# 4. 体の区分け（下地）
# ---------------------------------------------------------------------------
SKIN, ROBE, HAKAMA, HAIR = 0, 1, 2, 3
mat = [SKIN]*NV
WAIST, HEM, SHOULDER, WRIST_R = 0.95, 1.30, 1.32, 0.26
for i in range(NV):
    y, x = pos[i*3+1], pos[i*3]
    if find(i) != bodyRoot or y > SHOULDER: continue
    if WAIST < y < HEM:
        mat[i] = SKIN if (abs(x) > 0.115 and abs(x) > WRIST_R) else ROBE
    elif y <= WAIST:
        mat[i] = HAKAMA

# ---------------------------------------------------------------------------
# 5. 生成（ボブ・白衣・帯・袴）
# ---------------------------------------------------------------------------
ex_pos, ex_nrm, ex_mat, ex_bi, ex_bw, ex_idx = [], [], [], [], [], []
def push(x, y, z, nx, ny, nz, m, j0, w0, j1=0, w1=0.0):
    i = NV + len(ex_pos)//3
    ex_pos.extend([x, y, z]); ex_nrm.extend([nx, ny, nz]); ex_mat.append(m)
    ex_bi.extend([j0, j1, 0, 0]); ex_bw.extend([w0, w1, 0.0, 0.0])
    return i
def quad(a, b, c, d): ex_idx.extend([a, b, c, a, c, d])

# --- ボブ ---
HA, HBR = 56, 22
crownY = skullTop - 0.003
def hemAt(ang):
    front = max(0.0, math.cos(ang - math.pi*0.5))
    side = abs(math.sin(ang - math.pi*0.5))
    return 1.497*front + 1.386*(1-front) - side*0.012
rows = []
for b in range(HBR+1):
    v = b/HBR; row = []
    for a in range(HA):
        ang = a/HA*TAU
        y = lerp(crownY, hemAt(ang), v**0.78)
        base = profAt(ang, min(y, crownY))
        side = abs(math.sin(ang - math.pi*0.5))
        flare = 0.012*smoothstep(0.30, 0.72, v) - (0.020 + 0.014*side)*smoothstep(0.78, 1.0, v)
        r = base + 0.008 + flare
        row.append((headCX + math.cos(ang)*r, y, headCZ + math.sin(ang)*r))
    rows.append(row)
hid = []
for row in rows:
    ids = []
    for p in row:
        nx, nz = p[0]-headCX, p[2]-headCZ
        l = math.hypot(nx, nz) or 1
        ids.append(push(p[0], p[1], p[2], nx/l*0.86, 0.35, nz/l*0.86, HAIR, headJ, 1.0))
    hid.append(ids)
for b in range(HBR):
    for a in range(HA):
        quad(hid[b][a], hid[b][(a+1) % HA], hid[b+1][(a+1) % HA], hid[b+1][a])
prev = hid[0]
r0 = math.hypot(rows[0][0][0]-headCX, rows[0][0][2]-headCZ)
for k in range(1, 5):
    u = k/4.0; ring = []
    for a in range(HA):
        ang = a/HA*TAU
        rr = profAt(ang, crownY)*math.cos(u*math.pi*0.5) + 0.008
        yy = crownY + math.sin(u*math.pi*0.5)*(r0*0.30)
        ring.append(push(headCX + math.cos(ang)*rr, yy, headCZ + math.sin(ang)*rr,
                         math.cos(ang)*math.cos(u*math.pi*0.5), math.sin(u*math.pi*0.5),
                         math.sin(ang)*math.cos(u*math.pi*0.5), HAIR, headJ, 1.0))
    for a in range(HA):
        quad(prev[a], ring[a], ring[(a+1) % HA], prev[(a+1) % HA])
    prev = ring
capc = push(headCX, crownY + r0*0.31, headCZ, 0, 1, 0, HAIR, headJ, 1.0)
for a in range(HA):
    ex_idx.extend([capc, prev[a], prev[(a+1) % HA]])

# --- 胴の輪郭 ---
TA, TB, TY0, TY1 = 28, 20, 0.94, 1.34
tprof = [0.0]*(TA*TB)
torsoBones = {hipsJ, spineJ, chestJ}
tx = tz = 0.0; tn = 0
for i in range(NV):
    y = pos[i*3+1]
    if y < TY0 or y > TY1 or find(i) != bodyRoot or dom(i) not in torsoBones: continue
    tx += pos[i*3]; tz += pos[i*3+2]; tn += 1
torCX, torCZ = (tx/tn, tz/tn) if tn else (0.0, 0.0)
for i in range(NV):
    y = pos[i*3+1]
    if y < TY0 or y > TY1 or find(i) != bodyRoot or dom(i) not in torsoBones: continue
    dx, dz = pos[i*3]-torCX, pos[i*3+2]-torCZ
    r = math.hypot(dx, dz)
    a = int((math.atan2(dz, dx)/TAU + 1.0)*TA) % TA
    b = min(TB-1, max(0, int((y-TY0)/(TY1-TY0)*TB)))
    if r > tprof[a*TB+b]: tprof[a*TB+b] = r
def torsoR(ang, y):
    fa = ((ang/TAU + 1.0) % 1.0)*TA
    a0 = int(fa) % TA; a1 = (a0+1) % TA; ta = fa - int(fa)
    b0 = int(clamp((y-TY0)/(TY1-TY0)*TB, 0, TB-1.001))
    m0 = max(tprof[a0*TB + min(TB-1, max(0, b0+d))] for d in range(-3, 4))
    m1 = max(tprof[a1*TB + min(TB-1, max(0, b0+d))] for d in range(-3, 4))
    r = lerp(m0, m1, ta)
    return r if r > 0.03 else 0.12

# --- 白衣 ---
RA, RB, rTop, rBot = 40, 14, 1.315, 0.955
rrows = []
for b in range(RB+1):
    v = b/RB; row = []
    for a in range(RA):
        ang = a/RA*TAU
        front = max(0.0, math.cos(ang - math.pi*0.5))
        collar = rTop - 0.085*(front**1.6)
        y = lerp(collar, rBot, v)
        r = torsoR(ang, y)*1.045 + 0.020
        row.append((torCX + math.cos(ang)*r, y, torCZ + math.sin(ang)*r, ang))
    rrows.append(row)
rid = []
for b, row in enumerate(rrows):
    v = b/RB; ids = []
    for p in row:
        w = smoothstep(0.15, 0.85, v)
        ids.append(push(p[0], p[1], p[2], math.cos(p[3])*0.96, 0.16, math.sin(p[3])*0.96,
                        ROBE, chestJ, 1-w, hipsJ if w > 0.5 else spineJ, w))
    rid.append(ids)
for b in range(RB):
    for a in range(RA):
        quad(rid[b][a], rid[b][(a+1) % RA], rid[b+1][(a+1) % RA], rid[b+1][a])
inner = []
for p in rrows[0]:
    r = math.hypot(p[0]-torCX, p[2]-torCZ)*0.62
    inner.append(push(torCX + math.cos(p[3])*r, p[1]+0.012, torCZ + math.sin(p[3])*r,
                      0, 1, 0, ROBE, chestJ, 1.0))
for a in range(RA):
    quad(inner[a], inner[(a+1) % RA], rid[0][(a+1) % RA], rid[0][a])

# --- 袴と帯 ---
hipBones = {hipsJ, thighL, thighR, spineJ}
px = pz = 0.0; pn = 0
for i in range(NV):
    y = pos[i*3+1]
    if y < 0.92 or y > 1.02 or find(i) != bodyRoot or dom(i) not in hipBones: continue
    px += pos[i*3]; pz += pos[i*3+2]; pn += 1
hipCX, hipCZ = (px/pn, pz/pn) if pn else (0.0, 0.0)
rs = []
for i in range(NV):
    y = pos[i*3+1]
    if y < 0.92 or y > 1.02 or find(i) != bodyRoot or dom(i) not in hipBones: continue
    rs.append(math.hypot(pos[i*3]-hipCX, pos[i*3+2]-hipCZ))
rs.sort()
hipR = rs[int(len(rs)*0.88)]*1.06 if len(rs) > 20 else 0.13
KA, KB, kTop, kBot = 64, 16, 1.02, 0.16
kid = []
for b in range(KB+1):
    v = b/KB; y = lerp(kTop, kBot, v); ids = []
    for a in range(KA):
        ang = a/KA*TAU
        pleat = 0.006*math.sin(ang*12.0)*smoothstep(0.10, 0.55, v)
        r = hipR*(1.02 + 0.62*(v**1.30)) + pleat
        legW = smoothstep(0.18, 0.85, v)
        x = hipCX + math.cos(ang)*r
        thigh = thighL if x - hipCX < 0 else thighR
        ids.append(push(x, y, hipCZ + math.sin(ang)*r,
                        math.cos(ang)*0.94, 0.26, math.sin(ang)*0.94,
                        HAKAMA, hipsJ, 1-legW, thigh, legW))
    kid.append(ids)
for b in range(KB):
    for a in range(KA):
        quad(kid[b][a], kid[b][(a+1) % KA], kid[b+1][(a+1) % KA], kid[b+1][a])
o0, o1 = [], []
for a in range(KA):
    ang = a/KA*TAU; r = hipR*1.06
    o0.append(push(hipCX + math.cos(ang)*r, 1.055, hipCZ + math.sin(ang)*r,
                   math.cos(ang), 0.2, math.sin(ang), ROBE, hipsJ, 1.0))
    o1.append(push(hipCX + math.cos(ang)*r, 0.965, hipCZ + math.sin(ang)*r,
                   math.cos(ang), -0.2, math.sin(ang), ROBE, hipsJ, 1.0))
for a in range(KA):
    quad(o0[a], o0[(a+1) % KA], o1[(a+1) % KA], o1[a])

NX = len(ex_pos)//3
NVA = NV + NX

# ---------------------------------------------------------------------------
# 6. 書き出し
# ---------------------------------------------------------------------------
allPos = pos + ex_pos
allNrm = nrm + ex_nrm
allJi  = ji + ex_bi
allJw  = jw + ex_bw
allMat = mat + ex_mat

tris = {SKIN: [], ROBE: [], HAKAMA: [], HAIR: []}
for (a, b, c) in keep:
    m = allMat[a]
    if allMat[b] == allMat[c] and allMat[b] != m: m = allMat[b]
    tris[m].extend([a, b, c])
for t in range(0, len(ex_idx), 3):
    a = ex_idx[t]
    tris[allMat[a]].extend([ex_idx[t], ex_idx[t+1], ex_idx[t+2]])

blob = bytearray(); views = []; accs = []
def add_view(data, fmt, target=None):
    while len(blob) % 4: blob.append(0)
    off = len(blob)
    blob.extend(struct.pack('<%d%s' % (len(data), fmt), *data))
    v = {'buffer': 0, 'byteOffset': off, 'byteLength': len(blob)-off}
    if target: v['bufferTarget'] = target
    views.append(v)
    return len(views)-1
def add_acc(data, fmt, ctype, atype, mn=None, mx=None):
    n = NCOMP[atype]
    bv = add_view(data, fmt)
    a = {'bufferView': bv, 'componentType': ctype, 'count': len(data)//n, 'type': atype}
    if mn: a['min'] = mn; a['max'] = mx
    accs.append(a)
    return len(accs)-1

A_POS = add_acc(allPos, 'f', 5126, 'VEC3',
                [min(allPos[0::3]), min(allPos[1::3]), min(allPos[2::3])],
                [max(allPos[0::3]), max(allPos[1::3]), max(allPos[2::3])])
A_NRM = add_acc(allNrm, 'f', 5126, 'VEC3')
A_JNT = add_acc(allJi, 'H', 5123, 'VEC4')
A_WGT = add_acc(allJw, 'f', 5126, 'VEC4')

# 表情モーフ（cute は焼き込んだので除く）。生成分はゼロを足す
keepT, keepN = [], []
for k, nm in enumerate(tnames):
    if nm == 'cute' or k >= len(targets): continue
    d = read_acc(targets[k]['POSITION']) + [0.0]*(NX*3)
    keepT.append({'POSITION': add_acc(d, 'f', 5126, 'VEC3')})
    keepN.append(nm)

A_IBM = J['skins'][0].get('inverseBindMatrices')
if A_IBM is not None:
    ibm = read_acc(A_IBM)
    A_IBM = add_acc(ibm, 'f', 5126, 'MAT4')

anims = []
for an in J.get('animations', []):
    smp = []
    for s in an['samplers']:
        i_t = add_acc(read_acc(s['input']), 'f', 5126, 'SCALAR')
        oa = J['accessors'][s['output']]
        i_o = add_acc(read_acc(s['output']), 'f', 5126, oa['type'])
        accs[i_t]['min'] = [min(read_acc(s['input']))]
        accs[i_t]['max'] = [max(read_acc(s['input']))]
        smp.append({'input': i_t, 'output': i_o,
                    'interpolation': s.get('interpolation', 'LINEAR')})
    anims.append({'name': an.get('name', ''), 'samplers': smp, 'channels': an['channels']})

MATS = [
    {'name': '肌', 'pbrMetallicRoughness': {
        'baseColorFactor': [0.86, 0.72, 0.63, 1], 'metallicFactor': 0, 'roughnessFactor': 0.62}},
    {'name': '白衣', 'pbrMetallicRoughness': {
        'baseColorFactor': [0.93, 0.92, 0.89, 1], 'metallicFactor': 0, 'roughnessFactor': 0.78}},
    {'name': '緋袴', 'pbrMetallicRoughness': {
        'baseColorFactor': [0.72, 0.13, 0.10, 1], 'metallicFactor': 0, 'roughnessFactor': 0.70}},
    {'name': '髪', 'pbrMetallicRoughness': {
        'baseColorFactor': [0.055, 0.045, 0.052, 1], 'metallicFactor': 0, 'roughnessFactor': 0.34}},
]

prims = []
for m in (SKIN, ROBE, HAKAMA, HAIR):
    if not tris[m]: continue
    p = {'attributes': {'POSITION': A_POS, 'NORMAL': A_NRM,
                        'JOINTS_0': A_JNT, 'WEIGHTS_0': A_WGT},
         'indices': add_acc(tris[m], 'I', 5125, 'SCALAR'),
         'material': m}
    if keepT: p['targets'] = keepT
    prims.append(p)

out = {
    'asset': {'version': '2.0', 'generator': 'export_dressed.py (dress.js と同じ処理)'},
    'scene': J.get('scene', 0),
    'scenes': J['scenes'],
    'nodes': J['nodes'],
    'meshes': [{'name': '巫女', 'primitives': prims,
                'extras': {'targetNames': keepN},
                'weights': [0.0]*len(keepT)}],
    'skins': [{'joints': jointNodes,
               **({'inverseBindMatrices': A_IBM} if A_IBM is not None else {})}],
    'materials': MATS,
    'bufferViews': views,
    'accessors': accs,
    'buffers': [{'byteLength': len(blob)}],
}
if anims: out['animations'] = anims

js = json.dumps(out, separators=(',', ':')).encode('utf-8')
js += b' ' * ((-len(js)) % 4)
bn = bytes(blob) + b'\x00' * ((-len(blob)) % 4)
glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(bn))
glb += struct.pack('<II', len(js), 0x4E4F534A) + js
glb += struct.pack('<II', len(bn), 0x004E4942) + bn
io.open(DST, 'wb').write(glb)

print('元        : %d 頂点 / %d 三角形' % (NV, NT))
print('髪を外した: %d 房 / %s 頂点' % (len(isHair), format(droppedV, ',')))
print('生成      : %s 頂点（ボブ・白衣・帯・袴）' % format(NX, ','))
print('出力      : %s' % DST)
print('  頂点 %s / 三角形 %s / 材質 %d / 表情 %s'
      % (format(NVA, ','), format(sum(len(v) for v in tris.values())//3, ','),
         len(MATS), ','.join(keepN)))
