#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""骨の入っていない人型メッシュを Blender で正しくリグする。

    blender --background --python game/blender_autorig.py -- model.obj out.glb
    python3 game/blender_autorig.py model.obj out.glb        # bpy モジュール版

rigplay.html と同じ方法で関節を推定する。違うのはその先で、
スキンウェイトを距離のヒューリスティックではなく **Blender のヒートマップ
自動ウェイト**（Bone Heat Weighting）に任せる。あれは表面上の測地距離を
解いていて、私が書いた「骨の線分までのユークリッド距離」とは別物である。
肩が痩せる・腿が反対の脚を掴む といった症状の本命の解決になる。

出力は glTF (.glb)。スケルトンとウェイトとアニメーションが1ファイルに入る。

座標系
------
OBJ は Y が上、Blender は Z が上。ここでは読み込みを自前でやって
    Blender(x, y, z) = OBJ(x, -z, y)
に変換する。Blender の正面図は +Y 方向を見下ろすので、この向きだと
キャラクターは -Y を向く（Blender の慣習どおり）。
"""

import math, os, sys

import bpy
from mathutils import Vector

# ---------------------------------------------------------------- 引数
def parse_args():
    a = sys.argv
    if '--' in a:
        a = a[a.index('--') + 1:]
    else:
        a = [x for x in a[1:] if not x.startswith('-') and not x.endswith('.py')]
    src = a[0] if a else None
    dst = a[1] if len(a) > 1 else (os.path.splitext(src)[0] + '.glb' if src else None)
    if not src:
        sys.exit('使い方: blender --background --python blender_autorig.py -- model.obj [out.glb]')
    return src, dst


# ---------------------------------------------------------------- OBJ
def parse_obj(path):
    """rigplay.html の parseOBJ と同じ読み方。位置と面だけ見る。"""
    P, IDX = [], []
    with open(path, 'r', errors='replace') as f:
        for s in f:
            if s.startswith('v '):
                t = s.split()
                P.append((float(t[1]), float(t[2]), float(t[3])))
            elif s.startswith('f '):
                t = s.split()[1:]
                v = []
                for a in t:
                    i = int(a.split('/')[0])
                    v.append(len(P) + i if i < 0 else i - 1)
                for k in range(1, len(v) - 1):
                    IDX.append((v[0], v[k], v[k + 1]))
    return P, IDX


def clamp(x, a, b):
    return a if x < a else (b if x > b else x)


# ---------------------------------------------------------------- 関節の推定
def find_landmarks(P, IDX):
    """rigplay.html の findLandmarks の移植。前提は「概ね直立」「x=0 について
    概ね左右対称」「腕が横に出ている」だけ。"""
    NV = len(P)
    ylo = min(p[1] for p in P); yhi = max(p[1] for p in P)
    xmax = max(abs(p[0]) for p in P)
    H = yhi - ylo

    # --- 腕 : |x| でスライスして、上下の高さが崩れる位置が肩 ---
    AS = 90
    sl = [dict(n=0, ylo=1e9, yhi=-1e9, ys=0.0, zs=0.0) for _ in range(AS)]
    kOf = lambda x: clamp(int(abs(x) / xmax * AS), 0, AS - 1)
    for p in P:
        s = sl[kOf(p[0])]
        s['n'] += 1; s['ys'] += p[1]; s['zs'] += p[2]
        s['ylo'] = min(s['ylo'], p[1]); s['yhi'] = max(s['yhi'], p[1])
    kSh = AS - 1
    for k in range(2, AS):
        if sl[k]['n'] > 6 and sl[k]['yhi'] - sl[k]['ylo'] < H * 0.15:
            kSh = k; break
    shTop = sl[kSh]['yhi']
    armsOut = kSh < AS * 0.8 and xmax > H * 0.20

    rad = [0.0] * AS
    for p in P:
        k = kOf(p[0])
        if k < kSh or not sl[k]['n']:
            continue
        d = math.hypot(p[1] - sl[k]['ys'] / sl[k]['n'], p[2] - sl[k]['zs'] / sl[k]['n'])
        rad[k] = max(rad[k], d)

    def min_rad(a, b):
        bi, bv = clamp(a, kSh, AS - 1), 1e9
        for k in range(clamp(a, 0, AS - 1), clamp(b, 0, AS - 1) + 1):
            if sl[k]['n'] > 6 and 0 < rad[k] < bv:
                bv = rad[k]; bi = k
        return bi

    span = AS - kSh

    def near(want, w):
        a, b = clamp(want - w, kSh, AS - 2), clamp(want + w, kSh, AS - 2)
        m = min_rad(a, b)
        return m if a < m < b else want

    kEl = near(kSh + round(span * 0.42), round(span * 0.09))
    kWr = near(kSh + round(span * 0.76), round(span * 0.08))
    xOf = lambda k: (k + 0.5) / AS * xmax
    axY = lambda k: (sl[k]['ys'] / sl[k]['n']) if sl[k]['n'] else ylo + H * 0.8
    axZ = lambda k: (sl[k]['zs'] / sl[k]['n']) if sl[k]['n'] else 0.0

    # --- 高さバンド ---
    NB = 64
    bOf = lambda y: clamp(int((y - ylo) / H * NB), 0, NB - 1)
    bn = [0] * NB
    bx = [[] for _ in range(NB)]
    rx0 = [1e9] * NB; rx1 = [-1e9] * NB
    rz0 = [1e9] * NB; rz1 = [-1e9] * NB
    for p in P:
        b = bOf(p[1]); bn[b] += 1
        bx[b].append(abs(p[0]))
        if p[0] > 0:
            rx0[b] = min(rx0[b], p[0]); rx1[b] = max(rx1[b], p[0])
            rz0[b] = min(rz0[b], p[2]); rz1[b] = max(rz1[b], p[2])
    # 胴幅 : |x| をソートして、身長の3.5%を超える隙間で切る（最大値ではない）
    tw = [0.0] * NB
    for b in range(NB):
        a = sorted(bx[b])
        if not a:
            continue
        w = a[0]
        for i in range(1, len(a)):
            if a[i] - a[i - 1] > H * 0.035:
                break
            w = a[i]
        tw[b] = w
    yOf = lambda b: ylo + (b + 0.5) / NB * H

    # --- 股下 : バンドごとの連結成分。左右に並んだ2つが中心線をまたいで
    #     離れていれば脚。頂点を数える方式は低ポリゴンで壊れる。 ---
    COL = H * 0.16
    in_col = [abs(p[0]) < COL for p in P]
    fband = [[] for _ in range(NB)]
    for t in IDX:
        if not (in_col[t[0]] and in_col[t[1]] and in_col[t[2]]):
            continue
        fband[bOf((P[t[0]][1] + P[t[1]][1] + P[t[2]][1]) / 3.0)].append(t)

    par = list(range(NV))

    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]; a = par[a]
        return a

    def legs_apart(b):
        F = fband[b]
        if len(F) < 6:
            return False
        for t in F:
            for v in t:
                par[v] = v
        for t in F:
            for k in (1, 2):
                x, y = find(t[0]), find(t[k])
                if x != y:
                    par[y] = x
        cm = {}
        for t in F:
            for v in t:
                r = find(v); x = P[v][0]
                e = cm.setdefault(r, [0, 1e9, -1e9])
                e[0] += 1; e[1] = min(e[1], x); e[2] = max(e[2], x)
        cs = sorted((e for e in cm.values() if e[0] >= 9), key=lambda e: e[1])
        return any(cs[i][2] < 0 < cs[i + 1][1] for i in range(len(cs) - 1))

    bCrotch = -1
    for b in range(1, int(NB * 0.60)):
        if legs_apart(b):
            bCrotch = b
    if bCrotch < 0:
        bCrotch = round(NB * 0.46)
    bCrotch = clamp(bCrotch, round(NB * 0.30), round(NB * 0.56))

    # 足首 : 断面が z に長くなくなる最初のバンド（足は前後に長い、脚は丸い）
    bAnkle = 1
    for b in range(1, int(NB * 0.22)):
        if bn[b] < 10 or rx1[b] <= rx0[b]:
            continue
        if (rz1[b] - rz0[b]) < (rx1[b] - rx0[b]) * 1.5:
            bAnkle = b; break

    # 膝 : 足首〜股下で最も細い。中点(52%)に寄せる重みつき
    bKnee, best = (bAnkle + bCrotch) // 2, 1e9
    for b in range(bAnkle + 2, max(bAnkle + 3, bCrotch - 1)):
        if bn[b] < 18 or rx1[b] < rx0[b]:
            continue
        t = abs((b - bAnkle) / max(1, bCrotch - bAnkle) - 0.52)
        sc = (rx1[b] - rx0[b]) * (1 + t * 4.5)
        if sc < best:
            best, bKnee = sc, b
    bLeg = round(bAnkle + (bCrotch - bAnkle) * 0.55)
    legX = (rx0[bLeg] + rx1[bLeg]) / 2 if rx0[bLeg] < rx1[bLeg] else H * 0.05

    yShoulder = clamp(shTop - H * 0.018, ylo + H * 0.70, ylo + H * 0.86)
    bSh = bOf(yShoulder)
    bWaist, best = (bCrotch + bSh) // 2, 1e9
    for b in range(bCrotch + 1, max(bCrotch + 2, bSh - 1)):
        if bn[b] > 20 and 0 < tw[b] < best:
            best, bWaist = tw[b], b
    # 首は幅では測らない（髪がその高さを占め、しかも肩より細い）
    yNeck = yShoulder + H * 0.060

    toeZ = max((p[2] for p in P if p[1] < ylo + H * 0.05), default=0.0)

    return dict(H=H, ylo=ylo, yhi=yhi, xmax=xmax, armsOut=armsOut,
                ankle=yOf(bAnkle), knee=yOf(bKnee), crotch=yOf(bCrotch),
                hip=yOf(bCrotch) + H * 0.045, waist=yOf(bWaist), neck=yNeck,
                shoulder=yShoulder, legX=legX,
                shoulderX=xOf(kSh), elbowX=xOf(kEl), wristX=xOf(kWr),
                armYc=yShoulder, armZ=axZ(kSh),
                elbowY=axY(kEl), elbowZ=axZ(kEl),
                wristY=axY(kWr), wristZ=axZ(kWr),
                tipY=axY(AS - 2), tipZ=axZ(AS - 2), toeZ=toeZ)


def find_fingers(P, IDX, L):
    """掃引した切断面の連結成分で指を拾う。rigplay.html と同じ方法。"""
    NV, H = len(P), L['H']
    out = []
    for s in (-1, 1):
        w = (s * L['wristX'], L['wristY'], L['wristZ'])
        tp = (s * L['xmax'], L['tipY'], L['tipZ'])
        d = [tp[i] - w[i] for i in range(3)]
        ln = math.sqrt(sum(c * c for c in d))
        if ln < H * 0.04:
            continue
        d = [c / ln for c in d]
        up = (0, 0, 1) if abs(d[1]) > 0.9 else (0, 1, 0)
        dt = sum(up[i] * d[i] for i in range(3))
        e1 = [up[i] - d[i] * dt for i in range(3)]
        l1 = math.sqrt(sum(c * c for c in e1)) or 1
        e1 = [c / l1 for c in e1]
        e2 = [d[1]*e1[2]-d[2]*e1[1], d[2]*e1[0]-d[0]*e1[2], d[0]*e1[1]-d[1]*e1[0]]

        hand, tAt = [], [0.0] * NV
        for i, p in enumerate(P):
            if s * p[0] <= 0:
                continue
            v = (p[0] - w[0], p[1] - w[1], p[2] - w[2])
            t = sum(v[k] * d[k] for k in range(3)) / ln
            if t < 0.20 or t > 1.6:
                continue
            r = [v[k] - d[k] * t * ln for k in range(3)]
            if math.sqrt(sum(c * c for c in r)) > H * 0.055:
                continue
            tAt[i] = t; hand.append(i)
        if len(hand) < 120:
            continue
        inh = [False] * NV
        for i in hand:
            inh[i] = True
        faces = [t for t in IDX if inh[t[0]] and inh[t[1]] and inh[t[2]]]

        par = list(range(NV))
        def find(a):
            while par[a] != a:
                par[a] = par[par[a]]; a = par[a]
            return a

        digits = []
        cut = 0.88
        while cut > 0.24:
            for i in hand:
                par[i] = i
            for t in faces:
                if min(tAt[t[0]], tAt[t[1]], tAt[t[2]]) < cut:
                    continue
                for k in (1, 2):
                    a, b = find(t[0]), find(t[k])
                    if a != b:
                        par[b] = a
            comp = {}
            for i in hand:
                if tAt[i] >= cut:
                    comp.setdefault(find(i), []).append(i)
            for lst in comp.values():
                if len(lst) < 24:
                    continue
                has = set(lst)
                own = [g for g in digits if g['seed'] in has]
                live = [g for g in own if not g['frozen']]
                if not own:
                    if cut >= 0.30 and len(digits) < 5:
                        seed = max(lst, key=lambda i: tAt[i])
                        digits.append(dict(seed=seed, verts=list(lst), frozen=False))
                elif len(live) == 1 and len(own) == 1:
                    live[0]['verts'] = list(lst)
                else:
                    for g in live:
                        g['frozen'] = True
            cut -= 0.04

        good = [g for g in digits if len(g['verts']) >= 24][:6]
        if len(good) < 3:
            continue

        # 指が広がる向き（並び順と、カール軸に使う）
        pts = [i for g in good for i in g['verts']]
        ab = [(sum((P[i][k] - w[k]) * e1[k] for k in range(3)),
               sum((P[i][k] - w[k]) * e2[k] for k in range(3))) for i in pts]
        ma = sum(a for a, _ in ab) / len(ab); mb = sum(b for _, b in ab) / len(ab)
        caa = sum((a - ma) ** 2 for a, _ in ab)
        cbb = sum((b - mb) ** 2 for _, b in ab)
        cab = sum((a - ma) * (b - mb) for a, b in ab)
        ph = 0.5 * math.atan2(2 * cab, caa - cbb)
        spread = [e1[k] * math.cos(ph) + e2[k] * math.sin(ph) for k in range(3)]

        made = []
        for g in good:
            vs = g['verts']
            c = [sum(P[i][k] for i in vs) / len(vs) for k in range(3)]
            u = list(d)
            for _ in range(12):
                o = [0.0, 0.0, 0.0]
                for i in vs:
                    v = [P[i][k] - c[k] for k in range(3)]
                    pr = sum(v[k] * u[k] for k in range(3))
                    for k in range(3):
                        o[k] += v[k] * pr
                l = math.sqrt(sum(x * x for x in o))
                if l < 1e-12:
                    break
                u = [x / l for x in o]
            if sum(u[k] * d[k] for k in range(3)) < 0:
                u = [-x for x in u]
            rs = [sum((P[i][k] - c[k]) * u[k] for k in range(3)) for i in vs]
            r0, r1 = min(rs), max(rs)
            if r1 - r0 < H * 0.012:
                continue
            rb = r0 - (r1 - r0) * 0.32
            at = lambda r: [c[k] + u[k] * r for k in range(3)]
            base, tip = at(rb), at(r1)
            bt = sum((base[k] - w[k]) * d[k] for k in range(3)) / ln
            q = sum((base[k] - w[k]) * spread[k] for k in range(3))
            made.append(dict(side=s, base=base, mid=at(rb + (r1 - rb) * 0.46),
                             tip=tip, baseT=bt, q=q, thumb=False,
                             knuckle=[w[k] + d[k] * ln * 0.42 for k in range(3)]))
        if len(made) < 3:
            continue
        made.sort(key=lambda f: f['q'])
        ends = (made[0], made[-1])
        th = ends[0] if ends[0]['baseT'] <= ends[1]['baseT'] else ends[1]
        if len(made) >= 4 and all(f is th or f['baseT'] >= th['baseT'] for f in made):
            th['thumb'] = True
        out.extend(made)
    return out


# ---------------------------------------------------------------- スキニング
def components(NV, IDX):
    """メッシュの連結成分。頂点番号 -> 代表番号 を返す。"""
    par = list(range(NV))

    def find(a):
        while par[a] != a:
            par[a] = par[par[a]]; a = par[a]
        return a

    for t in IDX:
        for k in (1, 2):
            a, b = find(t[0]), find(t[k])
            if a != b:
                par[b] = a
    return [find(i) for i in range(NV)]


def skin(ob, arm, P, IDX):
    """Blender のヒートマップ自動ウェイトを、掛かるところにだけ掛ける。

    ヒートマップは表面上で熱拡散を解く。だから「表面」がひと繋がりでないと
    解けない。参考モデルは **1,412 個の別々のシェル**でできていて（髪の房、
    服のパネル、眼球、まつ毛…）、最大の塊でも全体の 30% しかない。丸ごと
    渡すと Blender は解を見つけられず、39 個の頂点グループを作ってどれにも
    ウェイトを入れずに終わる ── 動かないリグができあがる。

    なので体の本体にだけヒートマップを掛け、残りのシェルは**最寄りの体表面
    から転写**する。これはリガーが髪や服に対して実際にやることでもある：
    髪は頭の動きに従うべきで、髪自身の熱拡散に従うべきではない。
    """
    NV = len(P)
    lab = components(NV, IDX)
    from collections import Counter
    cnt = Counter(lab)
    main = cnt.most_common(1)[0][0]
    body = [i for i in range(NV) if lab[i] == main]
    print('連結成分 %d 個、本体は %d 頂点 (%.0f%%)'
          % (len(cnt), len(body), 100.0 * len(body) / NV))

    # --- 本体だけの一時オブジェクトを作ってヒートマップを掛ける ---
    remap = {v: k for k, v in enumerate(body)}
    tri = [[remap[a] for a in t] for t in IDX if lab[t[0]] == main]
    tmp_me = bpy.data.meshes.new('tmp')
    tmp_me.from_pydata([to_blender(P[i]) for i in body], [], tri)
    tmp_me.validate(); tmp_me.update()
    tmp = bpy.data.objects.new('tmp', tmp_me)
    bpy.context.collection.objects.link(tmp)

    bpy.ops.object.select_all(action='DESELECT')
    tmp.select_set(True); arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    heat = True
    try:
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    except RuntimeError as e:
        print('ヒートマップが例外:', e)
        heat = False
    gi = {g.index: g.name for g in tmp.vertex_groups}
    W = [[] for _ in body]
    filled = 0
    for v in tmp_me.vertices:
        row = [(gi[e.group], e.weight) for e in v.groups if e.weight > 1e-4]
        W[v.index] = row
        if row:
            filled += 1
    print('ヒートマップ: %d / %d 頂点にウェイト' % (filled, len(body)))
    if not heat or filled < len(body) * 0.5:
        print('  → 解けなかったのでエンベロープに切り替えます')
        bpy.ops.object.select_all(action='DESELECT')
        tmp.select_set(True); arm.select_set(True)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.parent_set(type='ARMATURE_ENVELOPE')
        gi = {g.index: g.name for g in tmp.vertex_groups}
        for v in tmp_me.vertices:
            W[v.index] = [(gi[e.group], e.weight) for e in v.groups if e.weight > 1e-4]

    # --- 全頂点へ転写。境目が硬くならないよう近傍3点の距離逆数で混ぜる ---
    from mathutils import kdtree
    kd = kdtree.KDTree(len(body))
    for k, i in enumerate(body):
        kd.insert(to_blender(P[i]), k)
    kd.balance()

    groups = {}
    for b in arm.data.bones:
        groups[b.name] = ob.vertex_groups.new(name=b.name)
    for i in range(NV):
        acc = {}
        if lab[i] == main:
            for n, w in W[remap[i]]:
                acc[n] = acc.get(n, 0.0) + w
        else:
            near = kd.find_n(to_blender(P[i]), 3)
            tot = 0.0
            for co, k, d in near:
                iw = 1.0 / (d + 1e-4)
                tot += iw
                for n, w in W[k]:
                    acc[n] = acc.get(n, 0.0) + w * iw
            if tot:
                for n in acc:
                    acc[n] /= tot
        s = sum(acc.values())
        if s <= 1e-6:
            continue
        for n, w in acc.items():
            groups[n].add([i], w / s, 'REPLACE')

    bpy.data.objects.remove(tmp, do_unlink=True)
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    m = ob.modifiers.new('armature', 'ARMATURE')
    m.object = arm
    nz = sum(1 for v in ob.data.vertices if any(e.weight > 1e-4 for e in v.groups))
    print('スキニング完了: %d / %d 頂点にウェイト' % (nz, NV))


# ---------------------------------------------------------------- Blender
def to_blender(p):
    """OBJ(Y上) -> Blender(Z上)。正面が -Y を向く。"""
    return Vector((p[0], -p[2], p[1]))


def build(src, dst):
    P, IDX = parse_obj(src)
    if not P or not IDX:
        sys.exit('OBJ に頂点か面がありません: ' + src)
    print('読み込み: %d 頂点 / %d 三角形' % (len(P), len(IDX)))

    L = find_landmarks(P, IDX)
    # 身長 1.65 m、足を床に
    s = 1.65 / L['H']
    P = [((p[0]) * s, (p[1] - L['ylo']) * s, (p[2]) * s) for p in P]
    for k in ('ankle', 'knee', 'crotch', 'hip', 'waist', 'shoulder', 'neck',
              'armYc', 'elbowY', 'wristY', 'tipY', 'yhi'):
        L[k] = (L[k] - L['ylo']) * s
    for k in ('H', 'legX', 'shoulderX', 'elbowX', 'wristX', 'xmax',
              'armZ', 'elbowZ', 'wristZ', 'tipZ', 'toeZ'):
        L[k] = L[k] * s
    L['ylo'] = 0.0
    FG = find_fingers(P, IDX, L)
    print('関節: 足首%.1f 膝%.1f 股下%.1f 腰骨%.1f ウエスト%.1f 肩%.1f 首%.1f cm'
          % tuple(L[k] * 100 for k in
                  ('ankle', 'knee', 'crotch', 'hip', 'waist', 'shoulder', 'neck')))
    print('指: %d 本（親指 %d）' % (len(FG), sum(1 for f in FG if f['thumb'])))

    bpy.ops.wm.read_factory_settings(use_empty=True)
    me = bpy.data.meshes.new('body')
    me.from_pydata([to_blender(p) for p in P], [], [list(t) for t in IDX])
    me.validate()
    me.update()
    ob = bpy.data.objects.new('body', me)
    bpy.context.collection.objects.link(ob)
    # 面が粗いままだと自動ウェイトも粗い。スムーズシェーディングだけ入れる
    for poly in me.polygons:
        poly.use_smooth = True

    # ---- アーマチュア ----
    arm_data = bpy.data.armatures.new('rig')
    arm = bpy.data.objects.new('rig', arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode='EDIT')
    EB = arm_data.edit_bones
    H = L['H']

    def bone(name, parent, head, tail):
        b = EB.new(name)
        b.head = to_blender(head)
        b.tail = to_blender(tail)
        if parent:
            b.parent = EB[parent]
            b.use_connect = (b.head - EB[parent].tail).length < 1e-5
        return b

    chest_y = L['waist'] + (L['shoulder'] - L['waist']) * 0.62
    bone('hips', None, (0, L['hip'], 0), (0, L['waist'], 0))
    bone('spine', 'hips', (0, L['waist'], 0), (0, chest_y, 0))
    bone('chest', 'spine', (0, chest_y, 0), (0, L['neck'], 0))
    bone('neck', 'chest', (0, L['neck'], 0), (0, L['neck'] + H * 0.035, 0))
    bone('head', 'neck', (0, L['neck'] + H * 0.035, 0), (0, L['yhi'], 0))

    for sgn in (-1, 1):
        k = 'L' if sgn < 0 else 'R'
        sh = (sgn * L['shoulderX'], L['armYc'], L['armZ'])
        el = (sgn * L['elbowX'], L['elbowY'], L['elbowZ'])
        wr = (sgn * L['wristX'], L['wristY'], L['wristZ'])
        row = sorted([f for f in FG if f['side'] == sgn], key=lambda f: f['q'])
        kn = row[0]['knuckle'] if row else (sgn * L['xmax'], L['tipY'], L['tipZ'])
        bone('clav' + k, 'chest', (sgn * L['shoulderX'] * 0.35, L['shoulder'] + H * 0.012,
                                   L['armZ'] * 0.5), sh)
        bone('upArm' + k, 'clav' + k, sh, el)
        bone('loArm' + k, 'upArm' + k, el, wr)
        bone('hand' + k, 'loArm' + k, wr, kn)
        for n, f in enumerate(row):
            bone('fg%da%s' % (n, k), 'hand' + k, f['base'], f['mid'])
            bone('fg%db%s' % (n, k), 'fg%da%s' % (n, k), f['mid'], f['tip'])
        lx = sgn * L['legX']
        bone('thigh' + k, 'hips', (lx, L['hip'] - H * 0.01, 0), (lx, L['knee'], 0))
        bone('shin' + k, 'thigh' + k, (lx, L['knee'], 0), (lx, L['ankle'], 0))
        bone('foot' + k, 'shin' + k, (lx, L['ankle'], 0),
             (lx, L['ylo'] + H * 0.012, L['toeZ'] * 0.7))
    bpy.ops.object.mode_set(mode='OBJECT')

    skin(ob, arm, P, IDX)

    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB',
                              export_animations=True, export_skins=True)
    print('書き出し: %s (%.0f KB)' % (dst, os.path.getsize(dst) / 1024))
    return ob, arm, L, FG


if __name__ == '__main__':
    src, dst = parse_args()
    build(src, dst)
