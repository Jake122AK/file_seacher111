#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""動作確認用の人型 .obj を作る。

    python3 game/make_test_obj.py [出力先.obj]

自動リグが読む3つの手がかりを、すべて意図的に持たせてある：
  ・脚が2本 → 中心線に隙間がある高さがある（股下が出る）
  ・指が5本、互いに離れている（掃引で分離できる）
  ・眼球が独立したシェル（union-find で目として出る）
単位は cm、身長 168cm、A ポーズ。
"""
import math, io, os, sys

DST = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    os.path.dirname(os.path.abspath(__file__)), 'autorig_test_dummy.obj')

V = []; F = []

def add(verts, faces):
    b = len(V) + 1
    V.extend(verts)
    for f in faces: F.append([i + b for i in f])

def capsule(a, b, r0, r1, seg=18, rings=20):
    """a から b へ、両端が丸い筒。"""
    ax = [b[i] - a[i] for i in range(3)]
    L = math.sqrt(sum(c * c for c in ax)) or 1e-6
    ax = [c / L for c in ax]
    up = [0, 0, 1] if abs(ax[2]) < 0.9 else [1, 0, 0]
    e1 = [up[1]*ax[2]-up[2]*ax[1], up[2]*ax[0]-up[0]*ax[2], up[0]*ax[1]-up[1]*ax[0]]
    n = math.sqrt(sum(c*c for c in e1)) or 1; e1 = [c/n for c in e1]
    e2 = [ax[1]*e1[2]-ax[2]*e1[1], ax[2]*e1[0]-ax[0]*e1[2], ax[0]*e1[1]-ax[1]*e1[0]]
    verts = []; rows = []
    for i in range(rings + 1):
        t = i / rings
        # 端で半径が 0 に落ちるように、球状のプロファイルを掛ける
        prof = math.sin(math.pi * min(1.0, max(0.0, t)) ) ** 0.5 if False else 1.0
        rr = r0 + (r1 - r0) * t
        cap = 0.0
        if t < 0.12: cap = math.sqrt(max(0.0, 1 - ((0.12 - t) / 0.12) ** 2))
        elif t > 0.88: cap = math.sqrt(max(0.0, 1 - ((t - 0.88) / 0.12) ** 2))
        else: cap = 1.0
        rr *= cap * prof
        c = [a[k] + ax[k] * L * t for k in range(3)]
        row = []
        for j in range(seg):
            th = j / seg * math.tau
            p = [c[k] + (e1[k] * math.cos(th) + e2[k] * math.sin(th)) * rr for k in range(3)]
            row.append(len(verts)); verts.append(p)
        rows.append(row)
    faces = []
    for i in range(rings):
        for j in range(seg):
            k = (j + 1) % seg
            faces.append([rows[i][j], rows[i+1][j], rows[i+1][k], rows[i][k]])
    add(verts, faces)

def ellipsoid(c, r, seg=24, rings=16):
    verts = []; rows = []
    for i in range(rings + 1):
        ph = i / rings * math.pi
        row = []
        for j in range(seg):
            th = j / seg * math.tau
            p = [c[0] + r[0]*math.sin(ph)*math.cos(th),
                 c[1] + r[1]*math.cos(ph),
                 c[2] + r[2]*math.sin(ph)*math.sin(th)]
            row.append(len(verts)); verts.append(p)
        rows.append(row)
    faces = []
    for i in range(rings):
        for j in range(seg):
            k = (j + 1) % seg
            faces.append([rows[i][j], rows[i+1][j], rows[i+1][k], rows[i][k]])
    add(verts, faces)

def box(c, h):
    verts = [[c[0]+sx*h[0], c[1]+sy*h[1], c[2]+sz*h[2]]
             for sx in (-1,1) for sy in (-1,1) for sz in (-1,1)]
    faces = [[0,1,3,2],[4,6,7,5],[0,4,5,1],[2,3,7,6],[0,2,6,4],[1,5,7,3]]
    add(verts, faces)

# ---- 脚 ----
for s in (-1, 1):
    x = s * 9.6
    capsule([x, 8.0, 0], [x, 45.0, 0], 5.8, 5.2)          # 脛
    # 腿は上に行くほど太り、股下の高さでだけ内側が中心線に届く。
    # ここを間違えると（軸を寄せすぎ / 太らせすぎ）、脚が腿の途中で
    # くっついてしまい、股下がそこだと推定される。実際そうなった。
    capsule([x, 45.0, 0], [x, 80.0, 0], 6.6, 9.2)         # 腿
    box([x, 3.5, 3.0], [4.6, 3.5, 9.5])                   # 足
def tube(profile, seg=22):
    """(y, rx, rz) の並びから、継ぎ目のない筒を作る。

    胴をカプセルの積み重ねで作ると、継ぎ目ごとに半径が 0 に落ちて
    くびれる。実際そうなって「ウエストが股下より下」と推定された。
    胴はひと繋ぎの断面列で作るのが正しい。"""
    verts = []; rows = []
    for (y, rx, rz) in profile:
        row = []
        for j in range(seg):
            th = j / seg * math.tau
            row.append(len(verts)); verts.append([rx*math.cos(th), y, rz*math.sin(th)])
        rows.append(row)
    faces = []
    for i in range(len(profile) - 1):
        for j in range(seg):
            k = (j + 1) % seg
            faces.append([rows[i][j], rows[i+1][j], rows[i+1][k], rows[i][k]])
    for (idx, rev) in ((0, True), (len(rows) - 1, False)):     # 端を塞ぐ
        c = len(verts); verts.append([0, profile[idx][0], 0])
        for j in range(seg):
            k = (j + 1) % seg
            faces.append([c, rows[idx][k], rows[idx][j]] if rev else [c, rows[idx][j], rows[idx][k]])
    add(verts, faces)

# ---- 胴 : 腰から首まで一本の筒 ----
tube([(79.0, 12.4, 9.4), (85.0, 13.2, 10.0), (92.0, 12.2, 9.4),
      (99.0, 10.4, 8.2), (106.0, 11.0, 8.6), (114.0, 12.4, 9.6),
      (122.0, 13.4, 10.2), (129.0, 12.2, 9.2), (133.0, 7.4, 6.4),
      (137.0, 5.2, 5.0), (142.0, 5.0, 4.8)])
# ---- 腕 (A ポーズ) ----
for s in (-1, 1):
    sh = [s * 16.0, 128.0, 0]
    el = [s * 30.0, 104.0, -1.0]
    wr = [s * 41.0, 84.0, -1.5]
    capsule(sh, el, 5.2, 4.0)
    capsule(el, wr, 4.0, 3.0)
    # 手のひら
    palm = [s * 44.5, 77.5, -1.5]
    capsule(wr, palm, 3.0, 3.4)
    # 指 : 掌の先から扇状に 4 本 + 親指
    d = [palm[i] - wr[i] for i in range(3)]
    n = math.sqrt(sum(c*c for c in d)); d = [c/n for c in d]
    for i, (off, L) in enumerate([(-2.7, 7.2), (-0.9, 8.0), (0.9, 7.6), (2.7, 6.2)]):
        b0 = [palm[0] + d[0]*1.2, palm[1] + d[1]*1.2, palm[2] + off]
        b1 = [b0[0] + d[0]*L, b0[1] + d[1]*L, b0[2] + off*0.42]
        capsule(b0, b1, 1.05, 0.85, seg=10, rings=8)
    # 親指は他の指よりずっと手前から生える。ここを他の指と同じ高さから
    # 生やすと「付け根がいちばん手首に近い指」という判定に引っかからず、
    # 親指として扱われない（実際そうなった）。
    th0 = [palm[0] - d[0]*4.2, palm[1] - d[1]*4.2, palm[2] + 4.4]
    th1 = [th0[0] + d[0]*3.0, th0[1] + d[1]*3.0, th0[2] + 4.2]
    capsule(th0, th1, 1.35, 1.05, seg=10, rings=10)
# ---- 頭 ----
ellipsoid([0, 152.0, 0.5], [8.4, 10.6, 9.4])
# 眼球 : 独立したシェル
for s in (-1, 1):
    ellipsoid([s * 3.4, 154.0, 7.4], [1.5, 1.5, 1.5], seg=14, rings=10)

out = io.StringIO()
out.write('# autorig test dummy - 168 cm, A-pose, 5 digits per hand, separate eyeballs\n')
out.write('o dummy\n')
for p in V: out.write('v %.4f %.4f %.4f\n' % (p[0], p[1], p[2]))
for f in F: out.write('f ' + ' '.join(str(i) for i in f) + '\n')
io.open(DST, 'w', encoding='utf-8').write(out.getvalue())
ys = [p[1] for p in V]
print('verts %d  faces %d  height %.1f cm  size %.0f KB'
      % (len(V), len(F), max(ys) - min(ys), len(out.getvalue()) / 1024))
