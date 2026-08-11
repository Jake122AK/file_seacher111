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


# ---------------------------------------------------------------- 表情
def find_face(P, IDX, L):
    """顔のパーツの位置を測る。目は独立したシェルなので連結成分で拾い、
    残りは目と頭の箱からの比率で置く。

    測った値（参考モデル、身長1.65m 正規化）:
        目の中心 (±0.050, 1.456, 0.064)  半径 0.026  各165頂点
        中心線の前面 z : 1.426 で極大 0.1043（鼻先）
                        1.462 で極小 0.0816（鼻根・眼窩）
                        1.522 で極大 0.1152（額）
    アニメ顔なので**額が鼻より前に出ています**。「いちばん前の点＝鼻先」
    という素直な探し方は、この種のモデルでは額を拾います。
    """
    NV, H = len(P), L['H']
    lab = components(NV, IDX)
    grp = {}
    for i, r in enumerate(lab):
        grp.setdefault(r, []).append(i)
    cand = []
    for vs in grp.values():
        if not (24 <= len(vs) <= NV * 0.12):
            continue
        xs = [P[i][0] for i in vs]; ys = [P[i][1] for i in vs]; zs = [P[i][2] for i in vs]
        c = (sum(xs) / len(vs), sum(ys) / len(vs), sum(zs) / len(vs))
        dim = (max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs))
        dmax, dmin = max(dim), max(1e-6, min(dim))
        if not (H * 0.008 < dmax < H * 0.075) or c[1] < L['neck']:
            continue
        if not (H * 0.008 < abs(c[0]) < H * 0.055):
            continue
        cand.append({'c': c, 'v': vs, 'r': dmax * 0.5, 'ball': dmax / dmin < 1.7})
    # 目のあたりには板も球もある。まつ毛やアイラインは板、眼球は球。
    # 大きさだけで選ぶと、まつ毛の板を「目」と呼んでしまう（実際そうなった）。
    # 球状のものを目の中心とし、その周りのシェルをまとめて目のグループにする。
    eyes = []
    for a in cand:
        if not a['ball'] or a['c'][0] >= 0:
            continue
        for b in cand:
            if not b['ball'] or b['c'][0] <= 0:
                continue
            if abs(abs(a['c'][0]) - b['c'][0]) > H * 0.006:
                continue
            if abs(a['c'][1] - b['c'][1]) > H * 0.006:
                continue
            if not eyes:
                eyes = [a, b]
    if not eyes:
        return None
    # まつ毛・虹彩・眼球をまとめる。目を大きくするとき、眼球だけ広げて
    # まつ毛を置き去りにしたら破綻する。
    eyeSet = set()
    for e in eyes:
        for o in cand:
            if o['c'][0] * e['c'][0] <= 0:
                continue
            if math.dist(o['c'], e['c']) < e['r'] * 1.3:
                eyeSet |= set(o['v'])
                e.setdefault('grp', []).extend(o['v'])
        e['v'] = e.get('grp', e['v'])
    ey = (eyes[0]['c'][1] + eyes[1]['c'][1]) * 0.5
    R = (eyes[0]['r'] + eyes[1]['r']) * 0.5

    head = [i for i in range(NV) if P[i][1] > L['neck'] and i not in eyeSet]
    # 中心線の前面を高さで刻む : 鼻先は「目より下にある極大」
    prof = {}
    for i in head:
        if abs(P[i][0]) > H * 0.007:
            continue
        b = int((P[i][1] - L['neck']) / (H * 0.007))
        prof[b] = max(prof.get(b, -9), P[i][2])
    ys = sorted(prof)
    nose = (ey - H * 0.018, 0.0)
    best = -9
    for b in ys:
        y = L['neck'] + (b + 0.5) * H * 0.007
        if not (ey - H * 0.055 < y < ey - H * 0.004):
            continue
        if prof[b] > best:
            best, nose = prof[b], (y, prof[b])
    chin = min((P[i][1] for i in head if abs(P[i][0]) < H * 0.02 and P[i][2] > nose[1] * 0.3),
               default=L['neck'])
    mouth = chin + (nose[0] - chin) * 0.44
    return {'eyes': eyes, 'eyeSet': eyeSet, 'ey': ey, 'R': R, 'ex': abs(eyes[1]['c'][0]),
            'ez': (eyes[0]['c'][2] + eyes[1]['c'][2]) * 0.5,
            'noseY': nose[0], 'noseZ': nose[1], 'chin': chin, 'mouth': mouth,
            'head': head, 'front': max(P[i][2] for i in head)}


def _fall(d, r):
    t = clamp(1.0 - d / r, 0.0, 1.0)
    return t * t * (3 - 2 * t)


def face_shapes(ob, P, IDX, L):
    """表情をシェイプキーとして焼く。glTF ではモーフターゲットになる。"""
    F = find_face(P, IDX, L)
    if not F:
        print('目のシェルが見つからないので表情は作りません')
        return []
    R, ey, ex, ez = F['R'], F['ey'], F['ex'], F['ez']
    print('顔: 目 (±%.3f, %.3f, %.3f) 半径 %.3f / 鼻先 y %.3f z %.3f / 口 %.3f / 顎 %.3f'
          % (ex, ey, ez, R, F['noseY'], F['noseZ'], F['mouth'], F['chin']))
    NV = len(P)
    eyeSet = F['eyeSet']
    face = [i for i in F['head'] if P[i][2] > ez - R * 2.0]     # 顔の前半分

    def blink(shut=1.0):
        d = {}
        for i in face:
            for e in F['eyes']:
                c = e['c']
                h = math.hypot(P[i][0] - c[0], (P[i][2] - c[2]) * 0.7)
                if h > R * 1.55:
                    continue
                w = _fall(h, R * 1.55)
                dy = P[i][1] - c[1]
                if dy > -R * 0.10:                     # 上まぶた : 下ろす
                    t = w * clamp(dy / (R * 1.15), 0.0, 1.0)
                    tgt = c[1] - R * 0.04
                    v = d.setdefault(i, [0.0, 0.0, 0.0])
                    v[1] += (tgt - P[i][1]) * t * shut
                    v[2] += R * 0.09 * t * shut        # 眼球より前に出す
                elif dy > -R * 0.85:                   # 下まぶた : 少し上げる
                    t = w * clamp((dy + R * 0.85) / (R * 0.75), 0.0, 1.0)
                    v = d.setdefault(i, [0.0, 0.0, 0.0])
                    v[1] += R * 0.16 * t * shut
        return d

    def smile(a=1.0):
        d = {}
        for i in F['head']:
            x, y, z = P[i]
            if z < ez:
                continue
            # 口角 : 口の高さ、中心から少し外
            for sx in (-1, 1):
                cx = sx * R * 0.62
                h = math.hypot(x - cx, (y - F['mouth']) * 1.5)
                w = _fall(h, R * 0.95)
                if w <= 0:
                    continue
                v = d.setdefault(i, [0.0, 0.0, 0.0])
                v[1] += R * 0.42 * w * a
                v[0] += sx * R * 0.24 * w * a
                v[2] -= R * 0.10 * w * a
            # 頬が上がる
            for sx in (-1, 1):
                h = math.hypot(x - sx * R * 1.05, (y - (F['mouth'] + R * 0.72)) * 1.2)
                w = _fall(h, R * 1.1)
                if w > 0:
                    v = d.setdefault(i, [0.0, 0.0, 0.0])
                    v[1] += R * 0.19 * w * a
                    v[2] += R * 0.09 * w * a
        return d

    def mouth_open(a=1.0):
        """顎を蝶番で回す。顎より上と後ろは動かさない。"""
        d = {}
        piv = (0.0, F['mouth'] + R * 0.34, ez - R * 0.9)
        ang = math.radians(26) * a
        for i in F['head']:
            x, y, z = P[i]
            if y > piv[1] or z < piv[2]:
                continue
            t = clamp((piv[1] - y) / (piv[1] - F['chin'] + 1e-6), 0.0, 1.0)
            t = t * t * (3 - 2 * t)
            dy, dz = y - piv[1], z - piv[2]
            c, s = math.cos(ang * t), math.sin(ang * t)
            d[i] = [0.0, (dy * c - dz * s) - dy, (dy * s + dz * c) - dz]
        return d

    def brow(up=1.0):
        d = {}
        for i in F['head']:
            x, y, z = P[i]
            if z < ez:
                continue
            for sx in (-1, 1):
                h = math.hypot(x - sx * ex, (y - (ey + R * 0.95)) * 1.4)
                w = _fall(h, R * 1.5)
                if w > 0:
                    v = d.setdefault(i, [0.0, 0.0, 0.0])
                    v[1] += R * 0.22 * w * up
                    v[2] += R * 0.05 * w * abs(up)
        return d

    def wide(a=1.0):
        """驚き : まぶたを開いて、眼球をわずかに前へ。"""
        d = {}
        for i in face:
            for e in F['eyes']:
                c = e['c']
                h = math.hypot(P[i][0] - c[0], (P[i][2] - c[2]) * 0.7)
                w = _fall(h, R * 1.5)
                if w <= 0:
                    continue
                dy = P[i][1] - c[1]
                v = d.setdefault(i, [0.0, 0.0, 0.0])
                v[1] += (R * 0.17 if dy > 0 else -R * 0.10) * w * a
        for e in F['eyes']:
            for i in e['v']:
                d.setdefault(i, [0.0, 0.0, 0.0])[2] += R * 0.05 * a
        return d

    def cute(a=1.0):
        """アニメ寄りの寄せ : 目を大きく・少し下げ、鼻を控えめに、顎を細く。"""
        d = {}
        # 眼球を広げすぎるとまぶたの開口部からはみ出す（実際そうなった）。
        # 拡大は控えめにして、開口部のほうを大きく広げる。
        for e in F['eyes']:
            c = e['c']
            for i in e['v']:
                v = d.setdefault(i, [0.0, 0.0, 0.0])
                for k in range(3):
                    v[k] += (P[i][k] - c[k]) * 0.10 * a
                v[1] -= R * 0.06 * a
        for i in F['head']:
            x, y, z = P[i]
            # 目の開口部を広げる（眼球に合わせて）
            for e in F['eyes']:
                c = e['c']
                if z < ez - R * 0.6:
                    continue
                dx, dy = x - c[0], y - c[1]
                h = math.hypot(dx, dy)
                if h > R * 1.7 or h < 1e-6:
                    continue
                w = _fall(h, R * 1.7) * (1 - _fall(h, R * 0.55))
                v = d.setdefault(i, [0.0, 0.0, 0.0])
                v[0] += dx / h * R * 0.26 * w * a
                v[1] += (dy / h * R * 0.26 - R * 0.06) * w * a
            # 鼻を控えめに
            h = math.hypot(x, (y - F['noseY']) * 1.1)
            w = _fall(h, R * 0.85)
            if w > 0 and z > ez:
                d.setdefault(i, [0.0, 0.0, 0.0])[2] -= (F['noseZ'] - ez) * 0.22 * w * a
            # 顎を細く、短く
            t = clamp((F['mouth'] - y) / max(1e-6, F['mouth'] - F['chin']), 0.0, 1.0)
            if t > 0:
                t = t * t
                v = d.setdefault(i, [0.0, 0.0, 0.0])
                v[0] -= x * 0.16 * t * a
                v[1] += (F['chin'] - y) * -0.14 * t * a
            # 頭を少し大きく（目の上）
            if y > ey + R * 0.5:
                u = clamp((y - ey - R * 0.5) / (L['yhi'] - ey), 0.0, 1.0)
                v = d.setdefault(i, [0.0, 0.0, 0.0])
                v[0] += x * 0.05 * u * a
                v[1] += (y - ey) * 0.04 * u * a
        return d

    SHAPES = [('blink', blink), ('smile', smile), ('mouth_open', mouth_open),
              ('brow_up', lambda: brow(1.0)), ('brow_down', lambda: brow(-0.75)),
              ('eye_wide', wide), ('cute', cute)]
    me = ob.data
    if me.shape_keys is None:
        ob.shape_key_add(name='Basis', from_mix=False)
    base = [v.co.copy() for v in me.vertices]
    made = []
    for name, fn in SHAPES:
        d = fn()
        k = ob.shape_key_add(name=name, from_mix=False)
        for i, dl in d.items():
            k.data[i].co = base[i] + to_blender(dl)
        made.append(name)
    print('表情: ' + ' / '.join(made))
    return made


# ---------------------------------------------------------------- 歩行
def local_axis(pb, world_axis):
    """世界軸をこのボーンのローカル座標に持ち込む。

    ローカル軸は骨の向きとロールで決まるので、腿と上腕と指では「前後に振る
    軸」が別々になる。番号を決め打ちすると、腕を振ったつもりが捻れる。

    最初は「一番近いローカル軸に丸める」実装だった。これは間違いで、実測で
    出た：腕の軸が世界 Z から数十度ずれていたせいで、振るたびに前へ流れ、
    歩行中ずっと手が体の前 +0.12〜+0.33 m にあった（左右にも肩より 0.18 m
    外へ張り出していた）。丸めずに、そのまま座標変換する。
    """
    return (pb.bone.matrix_local.to_3x3().inverted() @ world_axis).normalized()


def two_bone_ik(l1, l2, df, dz):
    """股関節から見た足首の位置 (前 df, 下 dz) を、腿と脛の角度に解く。

    返すのは (腿の角度, 脛の相対角度)。どちらも「前が正、鉛直が0」。
    膝は前に折れないので脛の相対角は常に負。
    """
    d = math.hypot(df, dz)
    lim = (l1 + l2) * 0.999
    if d > lim:
        df *= lim / d; dz *= lim / d; d = lim
    d = max(d, abs(l1 - l2) * 1.001 + 1e-6)
    phi = math.atan2(df, dz)
    ca = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1.0, 1.0)
    ck = clamp((l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2), -1.0, 1.0)
    return phi + math.acos(ca), -(math.pi - math.acos(ck))


def smooth(t):
    t = clamp(t, 0.0, 1.0)
    return t * t * (3 - 2 * t)


class Rig:
    """クリップを焼くための、この骨格についての寸法と道具一式。"""

    def __init__(self, arm, L, FG):
        self.arm, self.L, self.FG = arm, L, FG
        self.X, self.Y, self.Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))
        self.hipZ = L['hip'] - L['H'] * 0.01
        self.l1 = self.hipZ - L['knee']
        self.l2 = L['knee'] - L['ankle']
        self.leg = self.l1 + self.l2
        self.ankle0 = L['ankle']
        self.legX = L['legX']
        already = math.atan2(max(0.0, L['armYc'] - L['wristY']),
                             max(1e-4, L['wristX'] - L['shoulderX']))
        self.drop = max(0.0, (1.26 if L['armsOut'] else 0.10) - already)
        self.rows = {s: sorted([f for f in FG if f['side'] == s], key=lambda f: f['q'])
                     for s in (-1, 1)}

    # ---- 姿勢を組み立てる ----
    def new_pose(self):
        return {'ops': {}, 'loc': Vector((0, 0, 0))}

    def add(self, po, name, axis, ang):
        po['ops'].setdefault(name, []).append((axis, ang))

    def leg_ik(self, po, k, ax, af, au, hz, foot_ang):
        """足首を (左右 ax, 前後 af, 高さ au) に置く。hz は股関節の高さ。

        股から足首までを 3 次元で解く。横方向は世界 Y まわりの開き（内転外転）、
        残りを矢状面で 2 骨 IK に渡す。これがないと足が骨盤と同じ幅の 2 本の
        レールの上を進むことになり、実際の歩行の狭い足幅にならない。
        """
        lat = ax - self.legX * (-1 if k == 'L' else 1)
        down = hz - au
        ab = math.atan2(lat, max(1e-4, down))
        dz = math.hypot(lat, down)
        th, sh = two_bone_ik(self.l1, self.l2, af, dz)
        self.add(po, 'thigh' + k, self.Y, -ab)
        self.add(po, 'thigh' + k, self.X, -th)
        self.add(po, 'shin' + k, self.X, -sh)
        # 足の角度は「地面と平行」を基準に、そこからの転がりを足す
        self.add(po, 'foot' + k, self.X, -(-(th + sh) + foot_ang))
        return th

    def arms(self, po, k, sgn, swing, elbow=math.radians(26), lift=0.0):
        """腕。真横を向いた休めの姿勢では、前後に振る軸は鉛直の Z。
        世界 X まわりに回しても腕が捻れるだけで前へ出ない。"""
        self.add(po, 'upArm' + k, self.Y, sgn * (self.drop + lift))
        self.add(po, 'upArm' + k, self.Z, sgn * swing)
        self.add(po, 'loArm' + k, self.Z, -sgn * elbow)

    def hands(self, po, k, sgn, grip):
        for n, f in enumerate(self.rows[sgn]):
            g = grip * (0.40 if f['thumb'] else 1.0)
            self.add(po, 'fg%da%s' % (n, k), self.Y, sgn * g * math.radians(62))
            self.add(po, 'fg%db%s' % (n, k), self.Y, sgn * g * math.radians(74))


def foot_roll(p, st):
    """立脚中の足首の転がり。踵接地→足裏全接地→蹴り出し。

    立脚のあいだずっと足裏が地面と平行、というのがいちばん不自然に見える。
    返すのは (足の角度, 足首を持ち上げる量)。蹴り出しでは踵が浮くので、
    足首は爪先を軸に持ち上がる。
    """
    D = math.radians
    if p < 0.06:                       # 踵接地 : 爪先が上を向いている
        return -D(9) * (1 - p / 0.06), 0.0
    if p < st * 0.62:                  # 足裏全接地
        return 0.0, 0.0
    t = (p - st * 0.62) / (st - st * 0.62)
    a = D(26) * smooth(t)              # 蹴り出し
    return a, 0.055 * smooth(t)


def gait(R, ph, stride, cadence_lift, st, hip_drop, bob, arm_gain, lean,
         base=0.55, grip=0.30, airborne=0.0, elbow=math.radians(28)):
    """歩きと走りに共通の1歩ぶんの姿勢。ph は 0..1。"""
    D = math.radians
    po = R.new_pose()
    # 骨盤の高さ : 両足接地の瞬間がいちばん低い（走りは滞空で上がる）
    bobz = -bob * math.cos(4 * math.pi * ph)
    hz = R.hipZ - hip_drop + bobz + airborne * max(0.0, -math.cos(4 * math.pi * ph))
    thighs = {}
    for k, sgn in (('L', -1), ('R', 1)):
        p = (ph if k == 'L' else ph + 0.5) % 1.0
        if p < st:
            t = p / st
            af = stride * (0.5 - t)
            fa, rise = foot_roll(p / st * st, st)
            au = R.ankle0 + rise
        else:
            t = (p - st) / (1.0 - st)
            af = stride * (-0.5 + smooth(t))
            au = R.ankle0 + cadence_lift * math.sin(math.pi * t)
            fa = -D(7) * smooth(t)          # 遊脚の終わりに爪先を上げる
        # 足幅 : 骨盤の幅そのままだと蟹股に見える
        ax = R.legX * (-1 if k == 'L' else 1) * base
        thighs[k] = R.leg_ik(po, k, ax, af, au, hz, fa)
    for k, sgn in (('L', -1), ('R', 1)):
        th = thighs[k]
        # 肘は腕が前に出るときだけ深くなる
        R.arms(po, k, sgn, -th * arm_gain, elbow * (1.0 + max(0.0, -th) * 0.8))
        R.hands(po, k, sgn, grip)
    # 骨盤 : 遊脚側が下がる（トレンデレンブルグ）。左右への体重移動も。
    sw = math.sin(2 * math.pi * ph)
    R.add(po, 'hips', R.Z, sw * D(5))
    R.add(po, 'hips', R.Y, -sw * D(4))
    R.add(po, 'chest', R.Z, -sw * D(8))
    R.add(po, 'spine', R.X, -lean)
    # 頭は胸の捻れを打ち消して、進行方向を向いたままにする
    R.add(po, 'neck', R.Z, sw * D(5))
    R.add(po, 'head', R.X, lean * 0.6)
    # 骨盤の実際の移動量は、IK に渡した股関節の高さと**同じでなければならない**。
    # 滞空ぶんを IK にだけ渡して骨盤に渡していなかったせいで、走りで足が
    # 2cm 地面にめり込んでいた。差分は hz からそのまま取る。
    po['loc'] = local_axis(R.arm.pose.bones['hips'], R.Z) * (hz - R.hipZ) \
        + local_axis(R.arm.pose.bones['hips'], R.X) * (-sw * R.leg * 0.028)
    return po


def clip_walk(R, ph):
    return gait(R, ph, stride=R.leg * 0.54, cadence_lift=R.leg * 0.13, st=0.62,
                hip_drop=R.leg * 0.044, bob=R.leg * 0.026, arm_gain=0.95,
                lean=math.radians(3), grip=0.30, elbow=math.radians(30))


def clip_run(R, ph):
    return gait(R, ph, stride=R.leg * 0.92, cadence_lift=R.leg * 0.30, st=0.38,
                hip_drop=R.leg * 0.075, bob=R.leg * 0.050, arm_gain=1.35,
                lean=math.radians(11), base=0.35, grip=0.62,
                airborne=R.leg * 0.055, elbow=math.radians(84))


def clip_idle(R, ph):
    """立ち。足は動かない。呼吸と、左右への体重移動だけ。"""
    D = math.radians
    po = R.new_pose()
    br = math.sin(2 * math.pi * ph * 2)          # 呼吸は1周期に2回
    sw = math.sin(2 * math.pi * ph)
    hz = R.hipZ - R.leg * 0.012 + br * 0.004
    for k, sgn in (('L', -1), ('R', 1)):
        ax = R.legX * (-1 if k == 'L' else 1) * 0.62
        th = R.leg_ik(po, k, ax, sw * R.leg * 0.012 * sgn, R.ankle0, hz, 0.0)
        R.arms(po, k, sgn, -sw * D(2) * sgn, D(14), D(3))
        R.hands(po, k, sgn, 0.26)
    R.add(po, 'hips', R.Y, -sw * D(3))
    R.add(po, 'chest', R.X, br * D(2))
    R.add(po, 'spine', R.Z, sw * D(2))
    R.add(po, 'neck', R.Z, -sw * D(2))
    R.add(po, 'head', R.Z, math.sin(2 * math.pi * ph * 0.5) * D(6))
    po['loc'] = local_axis(R.arm.pose.bones['hips'], R.Z) * (br * 0.004 - R.leg * 0.012) \
        + local_axis(R.arm.pose.bones['hips'], R.X) * (sw * R.leg * 0.020)
    return po


def clip_jump(R, ph):
    """しゃがむ → 跳ぶ → 空中 → 着地 → 戻る。"""
    D = math.radians
    po = R.new_pose()
    CR, TO, LD, RC = 0.20, 0.30, 0.72, 0.88
    if ph < CR:
        t = smooth(ph / CR); h = -R.leg * 0.22 * t; tuck = 0.0; arm = -D(50) * t
    elif ph < TO:
        t = smooth((ph - CR) / (TO - CR)); h = -R.leg * 0.22 * (1 - t); tuck = 0.0
        arm = -D(50) * (1 - t) + D(60) * t
    elif ph < LD:
        t = (ph - TO) / (LD - TO)
        h = R.leg * 0.46 * math.sin(math.pi * t)
        tuck = R.leg * 0.30 * math.sin(math.pi * t)
        arm = D(60) * (1 - t) - D(20) * t
    elif ph < RC:
        t = smooth((ph - LD) / (RC - LD)); h = -R.leg * 0.26 * t; tuck = 0.0
        arm = -D(20) - D(30) * t
    else:
        t = smooth((ph - RC) / (1 - RC)); h = -R.leg * 0.26 * (1 - t); tuck = 0.0
        arm = -D(50) * (1 - t)
    hz = R.hipZ + h
    for k, sgn in (('L', -1), ('R', 1)):
        ax = R.legX * (-1 if k == 'L' else 1) * 0.62
        au = R.ankle0 + tuck
        fa = D(24) * (tuck / max(1e-6, R.leg * 0.30)) if tuck else 0.0
        R.leg_ik(po, k, ax, tuck * 0.35, au, hz, fa)
        R.arms(po, k, sgn, arm, D(40) + abs(arm) * 0.45, D(6))
        R.hands(po, k, sgn, 0.42 if ph < TO else 0.20)
    R.add(po, 'spine', R.X, -min(0.0, h) / R.leg * D(56) - max(0.0, h) / R.leg * D(10))
    R.add(po, 'chest', R.X, -min(0.0, h) / R.leg * D(30))
    po['loc'] = local_axis(R.arm.pose.bones['hips'], R.Z) * h
    return po


CLIPS = [('idle', 64, clip_idle), ('walk', 32, clip_walk),
         ('run', 24, clip_run), ('jump', 40, clip_jump)]


def bake(arm, L, FG, frames, name, fn):
    """1クリップぶんを焼いて、NLA トラックに積む。"""
    from mathutils import Quaternion
    R = Rig(arm, L, FG)
    P = arm.pose.bones
    for pb in P:
        pb.rotation_mode = 'QUATERNION'
    if arm.animation_data is None:
        arm.animation_data_create()
    act = bpy.data.actions.new(name)
    arm.animation_data.action = act
    try:
        if arm.animation_data.action_slot is None and act.slots:
            arm.animation_data.action_slot = act.slots[0]
    except AttributeError:
        pass
    for fr in range(1, frames + 2):          # 最後は最初と同じ姿勢＝ループ
        po = fn(R, (fr - 1) / frames)
        for pb in P:
            pb.rotation_quaternion = Quaternion()
            pb.location = (0, 0, 0)
        for nm, ops in po['ops'].items():
            pb = P.get(nm)
            if not pb:
                continue
            q = Quaternion()
            for ax, ang in ops:
                q = q @ Quaternion(local_axis(pb, ax), ang)
            pb.rotation_quaternion = q
        P['hips'].location = po['loc']
        for pb in P:
            pb.keyframe_insert('rotation_quaternion', frame=fr)
        P['hips'].keyframe_insert('location', frame=fr)
    for fc in action_fcurves(act):
        for kp in fc.keyframe_points:
            kp.interpolation = 'BEZIER'
    tr = arm.animation_data.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 1, act)
    arm.animation_data.action = None
    return act


def bake_all(arm, L, FG):
    for name, frames, fn in CLIPS:
        bake(arm, L, FG, frames, name, fn)
    print('クリップ: ' + ' / '.join('%s(%dF)' % (n, f + 1) for n, f, _ in CLIPS))


def action_fcurves(act):
    """Blender 4.4 以降のアクションはスロット付きで、F カーブは
    layers/strips/channelbags の下にある。4.3 以前は act.fcurves に直接。"""
    if hasattr(act, 'fcurves') and len(act.fcurves):
        return list(act.fcurves)
    out = []
    for layer in getattr(act, 'layers', []):
        for strip in layer.strips:
            for cb in getattr(strip, 'channelbags', []):
                out.extend(cb.fcurves)
    return out


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
    face_shapes(ob, P, IDX, L)
    bake_all(arm, L, FG)

    bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB',
                              export_animations=True, export_skins=True,
                              export_animation_mode='ACTIONS',
                              export_morph=True)
    print('書き出し: %s (%.0f KB)' % (dst, os.path.getsize(dst) / 1024))
    return ob, arm, L, FG


if __name__ == '__main__':
    src, dst = parse_args()
    build(src, dst)
