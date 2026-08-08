#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
rigplay.html を hiyorimi.html から生成する。

任意の人型 OBJ をドロップすると、骨格を自動で当てて、スキニングして、
歩かせる。モデルは同梱しない — 開いた人が自分のファイルを落とす。

    python3 game/build_rigplay.py
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'hiyorimi.html')
DST = os.path.join(HERE, 'rigplay.html')

src = io.open(SRC, encoding='utf-8').read()
MARK = '/* ==== %s ==== */'
ORDER = ['a_core.js', 'b_shaders_a.js', 'b_shaders_b.js', 'c_scene.js', 'c2_astro.js',
         'd_render.js', 'f_kyonshi.js', 'g_keidai.js', 'h_kitsune.js', 'e_main.js']


def section(name):
    i = src.index(MARK % name)
    k = ORDER.index(name)
    j = src.index(MARK % ORDER[k + 1]) if k + 1 < len(ORDER) else src.index('</script>', i)
    return src[i:j]


core = section('a_core.js')
shA = section('b_shaders_a.js')
shB = section('b_shaders_b.js')
astro = section('c2_astro.js')
render = section('d_render.js')

sc = section('c_scene.js')
i = sc.index('const MAT = {')
mat_table = sc[i:sc.index('};', i) + 3]

cut0 = render.index('/* ---------------- camera update ---------------- */')
head, tail = render[:cut0], render[cut0:]
render = head + tail[:tail.index('function groundHeightAt')]


def rep(text, a, b, n=1):
    assert text.count(a) == n, (text.count(a), a[:90])
    return text.replace(a, b)


# ---------------------------------------------------------------------------
# GPU skinning.
#
# The CPU path transformed 44,000 vertices in JavaScript and re-uploaded the
# whole vertex buffer every frame — twice the work of drawing them. The bone
# matrices go into a 1-row RGBA32F texture instead and the vertex shader does
# the blend, so a pose costs one texSubImage2D of a few hundred floats.
#
# The change is confined to this build: hiyorimi.html's own character is a
# different problem (it is BUILT per pose, not just transformed) and there is
# no reason to disturb it.
# ---------------------------------------------------------------------------
SKIN_DECL = '''layout(location=9) in vec4 aBI;
layout(location=10) in vec4 aBW;
uniform int uSkin;
uniform sampler2D uBones;
/* four consecutive texels are the four columns of one bone matrix */
mat4 boneAt(float f){
  int k = int(f)*4;
  return mat4(texelFetch(uBones, ivec2(k,   0), 0), texelFetch(uBones, ivec2(k+1, 0), 0),
              texelFetch(uBones, ivec2(k+2, 0), 0), texelFetch(uBones, ivec2(k+3, 0), 0));
}
'''
SKIN_BODY = '''  vec3 sPos = aPos; vec3 sNrm = aNrm;
  if(uSkin==1){
    mat4 S = boneAt(aBI.x)*aBW.x + boneAt(aBI.y)*aBW.y
           + boneAt(aBI.z)*aBW.z + boneAt(aBI.w)*aBW.w;
    sPos = (S*vec4(aPos,1.0)).xyz;
    sNrm = mat3(S)*aNrm;
  }
'''

for _vs in ('VS_GBUF', 'VS_SHADOW'):
    i0 = shA.index('const %s = `' % _vs)
    i1 = shA.index('`;', i0)
    blk = shA[i0:i1]
    # rename the reads FIRST — SKIN_BODY itself reads aPos and aNrm, and
    # substituting into it would define sPos in terms of itself
    blk = blk.replace('aPos', 'sPos').replace('aNrm', 'sNrm')
    blk = rep(blk, 'in vec3 sPos;', 'in vec3 aPos;')
    blk = rep(blk, 'in vec3 sNrm;', 'in vec3 aNrm;')
    blk = rep(blk, 'void main(){', SKIN_DECL + 'void main(){')
    blk = rep(blk, '  mat4 M = uInstanced==1 ? aInst : uModel;',
              SKIN_BODY + '  mat4 M = uInstanced==1 ? aInst : uModel;')
    shA = shA[:i0] + blk + shA[i1:]

render = rep(render, "    u1f(prog, 'uWind', d.wind || 0);",
             "    u1f(prog, 'uWind', d.wind || 0);\n"
             "    u1i(prog, 'uSkin', d.skin ? 1 : 0);\n"
             "    if (d.skin) tex(prog, 'uBones', 6, d.skin, gl.TEXTURE_2D);")

STUDIO = '''/* ==== c_studio.js ==== */
''' + mat_table + '''
const KY = { lights: [], list: [] };
const WORLD = { areas: [], boxes: [], groundAt() { return { y: 0, solid: true }; }, resolve() {} };
function keidaiGroundY() { return 0; }
function groundHeightAt() { return { y: 0, s: 0, t: 0 }; }
/* bakeMaterials paints the character's face into its own layer; there is no
   character here, so the slot just gets plain skin */
function bakeFaceLayer(arrA, arrB, res, layer) {
  const a = new Uint8Array(res * res * 4), b = new Uint8Array(res * res * 4);
  for (let i = 0; i < res * res; i++) {
    a[i * 4] = 232; a[i * 4 + 1] = 198; a[i * 4 + 2] = 182; a[i * 4 + 3] = 255;
    b[i * 4] = 128; b[i * 4 + 1] = 128; b[i * 4 + 2] = 126; b[i * 4 + 3] = 128;
  }
  for (const [tex, buf] of [[arrA, a], [arrB, b]]) {
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, layer, res, res, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
  }
}

function buildPlane(size, n, mat, uv) {
  const g = new Geo(), idx = [];
  for (let i = 0; i <= n; i++) {
    const row = [];
    for (let j = 0; j <= n; j++) {
      const x = (j / n - 0.5) * size, z = (i / n - 0.5) * size;
      row.push(g.push(x, 0, z, 0, 1, 0, (x / size + 0.5) * uv, (z / size + 0.5) * uv, mat));
    }
    idx.push(row);
  }
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++)
    g.quad(idx[i][j], idx[i + 1][j], idx[i + 1][j + 1], idx[i][j + 1]);
  return g;
}
function buildScene(quality) {
  const draws = [], shadowDraws = [], lights = [];
  const floor = new Mesh(buildPlane(90, quality >= 2 ? 48 : 16, MAT.STONE, 26));
  floor.setInstances([{ m: M4.create(), tint: [1, 1, 1, 0.3] }]);
  draws.push({ mesh: floor, name: 'floor' });
  shadowDraws.push({ mesh: floor });
  R.toriiTs = [];
  return { draws, shadowDraws, lights };
}
'''

RIG = r'''/* ==== r_rig.js ==== */
/* =========================================================================
   AUTORIG : 骨の入っていない人型メッシュに、骨を当てて、動かす

   A downloaded character is usually a static mesh — vertices and faces and
   nothing else. Everything below exists to turn that into something that
   walks: find where the joints must be from the shape of the mesh itself,
   bind every vertex to the bones near it, and drive the result with
   procedural cycles.

   Nothing here knows anything about a particular model. The landmarks are
   read out of the geometry.
   ========================================================================= */

/* ---------------- OBJ ---------------- */
function parseOBJ(text) {
  const P = [], IDX = [];
  const lines = text.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const s = lines[li];
    if (s.charCodeAt(0) === 118 && s.charCodeAt(1) === 32) {          // "v "
      const t = s.split(/\s+/);
      P.push(+t[1], +t[2], +t[3]);
    } else if (s.charCodeAt(0) === 102 && s.charCodeAt(1) === 32) {   // "f "
      const t = s.trim().split(/\s+/);
      const n = t.length - 1;
      const v = [];
      for (let k = 1; k <= n; k++) {
        let a = t[k]; const sl = a.indexOf('/'); if (sl >= 0) a = a.slice(0, sl);
        let i = +a; if (i < 0) i = P.length / 3 + i; else i -= 1;
        v.push(i);
      }
      for (let k = 1; k < n - 1; k++) IDX.push(v[0], v[k], v[k + 1]);
    }
  }
  return { P: new Float64Array(P), IDX: IDX };
}

/* ---------------- landmark finding ----------------
   Every measurement below is taken off the mesh, in the pose it arrived
   in. The assumptions are only that it is roughly upright, roughly
   symmetric about x = 0, and standing with the arms out or down. */
function findLandmarks(P) {
  const NV = P.length / 3;
  let ylo = 1e9, yhi = -1e9, xmax = 0;
  for (let i = 0; i < NV; i++) {
    const y = P[i * 3 + 1];
    if (y < ylo) ylo = y; if (y > yhi) yhi = y;
    const ax = Math.abs(P[i * 3]); if (ax > xmax) xmax = ax;
  }
  const H = yhi - ylo;

  /* ---- the arms, sliced along |x| ----
     The first attempt assumed the arms were horizontal at one height and
     read the shoulder 30cm too low. Real "T-poses" are usually an A: this
     model's fingertips are at 60% of its height, not 84%. Slicing by |x|
     and watching each slice's VERTICAL EXTENT collapse finds the shoulder
     whatever angle the arm is at — a slice through the torso is as tall as
     a torso, a slice through an arm is as tall as an arm. */
  const AS = 90, sl = [];
  for (let k = 0; k < AS; k++) sl.push({ n: 0, ylo: 1e9, yhi: -1e9, ys: 0, zs: 0 });
  const kOf = x => clamp(Math.floor(Math.abs(x) / xmax * AS), 0, AS - 1);
  for (let i = 0; i < NV; i++) {
    const s = sl[kOf(P[i * 3])];
    s.n++; s.ys += P[i * 3 + 1]; s.zs += P[i * 3 + 2];
    if (P[i * 3 + 1] < s.ylo) s.ylo = P[i * 3 + 1];
    if (P[i * 3 + 1] > s.yhi) s.yhi = P[i * 3 + 1];
  }
  let kSh = AS - 1;
  for (let k = 2; k < AS; k++)
    if (sl[k].n > 6 && sl[k].yhi - sl[k].ylo < H * 0.15) { kSh = k; break; }
  /* the CENTROID of that slice sits at the middle of the deltoid, which is
     a hand's breadth below the joint; the top of the slice is the acromion */
  const shTop = sl[kSh].yhi;
  const armsOut = kSh < AS * 0.8 && xmax > H * 0.20;
  const rad = new Float64Array(AS);
  for (let i = 0; i < NV; i++) {
    const k = kOf(P[i * 3]);
    if (k < kSh || !sl[k].n) continue;
    const d = Math.hypot(P[i * 3 + 1] - sl[k].ys / sl[k].n, P[i * 3 + 2] - sl[k].zs / sl[k].n);
    if (d > rad[k]) rad[k] = d;
  }
  const minRad = (a, b) => {
    let bi = clamp(a, kSh, AS - 1), bv = 1e9;
    for (let k = clamp(a, 0, AS - 1); k <= clamp(b, 0, AS - 1); k++)
      if (sl[k].n > 6 && rad[k] > 0 && rad[k] < bv) { bv = rad[k]; bi = k; }
    return bi;
  };
  /* Anatomical fractions first, a local radius minimum only as a
     refinement. Taking the minimum outright put the elbow and the wrist
     4cm apart on this model, because the arm's radius profile is
     monotonic and both searches just returned their own boundary. */
  const span = AS - kSh;
  const near = (want, w) => {
    const a = clamp(want - w, kSh, AS - 2), b = clamp(want + w, kSh, AS - 2);
    const m = minRad(a, b);
    return (m > a && m < b) ? m : want;                 // interior minimum only
  };
  const kEl = near(kSh + Math.round(span * 0.42), Math.round(span * 0.09));
  const kWr = near(kSh + Math.round(span * 0.76), Math.round(span * 0.08));
  const xOf = k => (k + 0.5) / AS * xmax;
  const axY = k => (sl[k].n ? sl[k].ys / sl[k].n : ylo + H * 0.8);
  const axZ = k => (sl[k].n ? sl[k].zs / sl[k].n : 0);

  /* ---- legs and torso, in height bands ----
     64 bands, not 220: a surface mesh's rings are sparse and at 0.8cm a
     band can be empty, which made every statistic below noise. */
  const NB = 64;
  const bn = new Int32Array(NB), cen = new Int32Array(NB);
  /* the same census restricted to the trunk column. An A-pose puts the
     hands beside the hips, and a hand is a thousand vertices none of which
     are anywhere near the midline — counted with the trunk it drags the
     midline RATIO under any threshold and the crotch lands in the belly. */
  const tn = new Int32Array(NB), tc = new Int32Array(NB);
  const rx0 = new Float64Array(NB).fill(1e9), rx1 = new Float64Array(NB).fill(-1e9);
  const rz0 = new Float64Array(NB).fill(1e9), rz1 = new Float64Array(NB).fill(-1e9);
  const tw = new Float64Array(NB);
  const bOf = y => clamp(Math.floor((y - ylo) / H * NB), 0, NB - 1);
  for (let i = 0; i < NV; i++) {
    const x = P[i * 3], z = P[i * 3 + 2], b = bOf(P[i * 3 + 1]);
    bn[b]++;
    if (Math.abs(x) < H * 0.006) cen[b]++;             // is the midline solid?
    if (Math.abs(x) < H * 0.09) { tn[b]++; if (Math.abs(x) < H * 0.006) tc[b]++; }
    if (Math.abs(x) < H * 0.20 && Math.abs(x) > tw[b]) tw[b] = Math.abs(x);
    if (x > 0) {                                       // the right leg only
      if (x < rx0[b]) rx0[b] = x; if (x > rx1[b]) rx1[b] = x;
      if (z < rz0[b]) rz0[b] = z; if (z > rz1[b]) rz1[b] = z;
    }
  }
  const yOf = b => ylo + (b + 0.5) / NB * H;

  /* 股下 : the highest band whose midline is empty, counted in the trunk
     column only. Between the legs there is nothing at x = 0; above the
     crotch there always is, whether that is skin or a pair of shorts. */
  let bCrotch = Math.round(NB * 0.46);
  for (let b = 1; b < NB * 0.60; b++)
    if (tn[b] > 16 && tc[b] < tn[b] * 0.02) bCrotch = b;
  bCrotch = clamp(bCrotch, Math.round(NB * 0.34), Math.round(NB * 0.56));
  /* 足首 : where the FOOT stops. A foot is long in z and narrow in x; a leg
     is round. Scanning up, the ankle is the first band whose section stops
     being long. Taking the smallest cross-section instead found the calf,
     because a foot's area beats an ankle's. */
  let bAnkle = 1;
  for (let b = 1; b < NB * 0.22; b++) {
    if (bn[b] < 10 || rx1[b] <= rx0[b]) continue;
    const w = rx1[b] - rx0[b], d = rz1[b] - rz0[b];
    if (d < w * 1.5) { bAnkle = b; break; }
  }
  let best = 1e9;
  // 膝 : narrowest leg between them, pulled toward the middle
  let bKnee = Math.round((bAnkle + bCrotch) / 2); best = 1e9;
  for (let b = bAnkle + 2; b < bCrotch - 1; b++) {
    /* a band that caught only a fragment of a ring reads as a very narrow
       leg — 12 vertices where its neighbours have 50. Those are noise, not
       the knee, and they were winning the search. */
    if (bn[b] < 18 || rx1[b] < rx0[b]) continue;
    /* the knee joint sits almost exactly halfway from ankle to crotch; the
       narrowest band on its own lands just under it, on the tendon above
       the calf, so the search is anchored and the width only refines it */
    const t = Math.abs((b - bAnkle) / Math.max(1, bCrotch - bAnkle) - 0.52);
    const sc = (rx1[b] - rx0[b]) * (1 + t * 4.5);
    if (sc < best) { best = sc; bKnee = b; }
  }
  const bLeg = Math.round(bAnkle + (bCrotch - bAnkle) * 0.55);
  const legX = (rx0[bLeg] < rx1[bLeg]) ? (rx0[bLeg] + rx1[bLeg]) / 2 : H * 0.05;

  const yShoulder = clamp(shTop - H * 0.018, ylo + H * 0.70, ylo + H * 0.86);
  const bSh = bOf(yShoulder);
  // 腰 : narrowest trunk between the crotch and the shoulder
  let bWaist = Math.round((bCrotch + bSh) / 2); best = 1e9;
  for (let b = bCrotch + 1; b < bSh - 1; b++)
    if (bn[b] > 20 && tw[b] > 0 && tw[b] < best) { best = tw[b]; bWaist = b; }
  /* 首 : NOT by width. Hair occupies exactly this band and is narrower
     than the shoulders under it, so the narrowest-band test lands on the
     trapezius every time. A neck is a fixed fraction of stature above the
     shoulder and that is far more reliable. */
  const yNeck = yShoulder + H * 0.060;

  let toeZ = -1e9;
  for (let i = 0; i < NV; i++)
    if (P[i * 3 + 1] < ylo + H * 0.05 && P[i * 3 + 2] > toeZ) toeZ = P[i * 3 + 2];

  return {
    H, ylo, yhi, xmax, armsOut,
    ankle: yOf(bAnkle), knee: yOf(bKnee), crotch: yOf(bCrotch),
    hip: yOf(bCrotch) + H * 0.045, waist: yOf(bWaist), neck: yNeck,
    shoulder: yShoulder, legX,
    shoulderX: xOf(kSh), elbowX: xOf(kEl), wristX: xOf(kWr),
    armYc: yShoulder, armZ: axZ(kSh),
    elbowY: axY(kEl), elbowZ: axZ(kEl),
    wristY: axY(kWr), wristZ: axZ(kWr),
    tipY: axY(AS - 2), tipZ: axZ(AS - 2),
    toeZ
  };
}

/* ---------------- fingers, jaw, eyes ----------------
   The seven landmarks above give a body. What they do not give is anything
   that reads as ALIVE up close: a hand that never closes, a face that never
   moves. These three are found by different means each, because they leave
   different traces in a mesh. */
function findExtras(P, IDX, L) {
  const NV = P.length / 3, H = L.H;
  const out = { fingers: [], jaw: null, eyes: [] };

  /* ---- 顎 ----
     Nothing in the mesh marks a jaw hinge — it is inside the head. It is,
     however, in a very predictable place relative to the head's own box,
     so the box is what gets measured. */
  let hz0 = 1e9, hz1 = -1e9, hn = 0;
  for (let i = 0; i < NV; i++) if (P[i * 3 + 1] > L.neck) {
    hn++; const z = P[i * 3 + 2]; if (z < hz0) hz0 = z; if (z > hz1) hz1 = z;
  }
  if (hn > 200 && hz1 > hz0) {
    const hh = L.yhi - L.neck, dz = hz1 - hz0;
    out.jaw = { pivot: [0, L.neck + hh * 0.29, hz0 + dz * 0.30],
                chin: [0, L.neck + hh * 0.05, hz0 + dz * 0.84],
                lim: L.neck + hh * 0.50 };
  }

  /* ---- 指 ----
     The obvious method — histogram the hand across its own axis and look
     for gaps — does not work, and measuring said so plainly: a relaxed
     hand has its fingers TOUCHING, and the palm fills whatever gap is
     left, so the histogram is one solid lobe from index to little.

     What does separate them is topology. Cut the hand at some distance
     along its axis and take the connected components of what is left: past
     the knuckles the only thing joining two fingers is the palm, and the
     palm has just been cut away. One cut is not enough either, because the
     four long fingers only part at 56% of the hand while the thumb has
     already ended by then — so the cut is SWEPT from the fingertips down,
     and each digit is recorded at its greatest extent before it merges
     into anything else. */
  for (const s of [-1, 1]) {
    const w = [s * L.wristX, L.wristY, L.wristZ];
    const tp = [s * L.xmax, L.tipY, L.tipZ];
    const d = [tp[0] - w[0], tp[1] - w[1], tp[2] - w[2]];
    const len = Math.hypot(d[0], d[1], d[2]);
    if (len < H * 0.04) continue;
    for (let k = 0; k < 3; k++) d[k] /= len;
    let up = [0, 1, 0];
    if (Math.abs(d[1]) > 0.9) up = [0, 0, 1];
    const dt = up[0] * d[0] + up[1] * d[1] + up[2] * d[2];
    const e1 = [up[0] - d[0] * dt, up[1] - d[1] * dt, up[2] - d[2] * dt];
    const l1 = Math.hypot(e1[0], e1[1], e1[2]) || 1;
    for (let k = 0; k < 3; k++) e1[k] /= l1;
    const e2 = [d[1] * e1[2] - d[2] * e1[1], d[2] * e1[0] - d[0] * e1[2], d[0] * e1[1] - d[1] * e1[0]];

    // every vertex of the hand, with its distance along the hand axis
    const hand = [], tAt = new Float64Array(NV);
    for (let i = 0; i < NV; i++) {
      if (s * P[i * 3] <= 0) continue;
      const vx = P[i * 3] - w[0], vy = P[i * 3 + 1] - w[1], vz = P[i * 3 + 2] - w[2];
      const t = (vx * d[0] + vy * d[1] + vz * d[2]) / len;
      if (t < 0.20 || t > 1.6) continue;
      const px = vx - d[0] * t * len, py = vy - d[1] * t * len, pz = vz - d[2] * t * len;
      if (Math.hypot(px, py, pz) > H * 0.055) continue;
      tAt[i] = t; hand.push(i);
    }
    if (hand.length < 120) continue;
    const inHand = new Uint8Array(NV);
    for (const i of hand) inHand[i] = 1;
    const faces = [];
    for (let t = 0; t < IDX.length; t += 3)
      if (inHand[IDX[t]] && inHand[IDX[t + 1]] && inHand[IDX[t + 2]]) faces.push(t);

    const par = new Int32Array(NV);
    const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const digits = [];
    for (let cut = 0.88; cut > 0.24; cut -= 0.04) {
      for (const i of hand) par[i] = i;
      for (const f of faces) {
        if (tAt[IDX[f]] < cut || tAt[IDX[f + 1]] < cut || tAt[IDX[f + 2]] < cut) continue;
        for (let k = 1; k < 3; k++) {
          const a = find(IDX[f]), b = find(IDX[f + k]);
          if (a !== b) par[b] = a;
        }
      }
      const comp = new Map();
      for (const i of hand) {
        if (tAt[i] < cut) continue;
        const r = find(i);
        let e = comp.get(r); if (!e) { e = []; comp.set(r, e); }
        e.push(i);
      }
      for (const list of comp.values()) {
        if (list.length < 24) continue;
        const has = new Set(list);
        /* frozen digits still count as owners. Without that, the palm — by
           then made of nothing but digits that have already met — looks
           like a brand new component and gets recorded as a sixth finger. */
        const own = digits.filter(g => has.has(g.seed));
        const live = own.filter(g => !g.frozen);
        if (own.length === 0) {
          if (cut < 0.30 || digits.length >= 5) continue;
          let seed = list[0];
          for (const i of list) if (tAt[i] > tAt[seed]) seed = i;
          digits.push({ seed, verts: list.slice(), frozen: false });
        } else if (live.length === 1 && own.length === 1) {
          live[0].verts = list.slice();
        } else {
          for (const g of live) g.frozen = true;    // they have met in the palm
        }
      }
    }
    const good = digits.filter(g => g.verts.length >= 24).slice(0, 6);
    if (good.length < 3) continue;                  // not a hand we can read

    const spread = [e1[0], e1[1], e1[2]];
    {   // the direction the digits fan out in, for ordering and for the curl axis
      let ma = 0, mb = 0, n = 0;
      for (const g of good) for (const i of g.verts) {
        const vx = P[i * 3] - w[0], vy = P[i * 3 + 1] - w[1], vz = P[i * 3 + 2] - w[2];
        ma += vx * e1[0] + vy * e1[1] + vz * e1[2];
        mb += vx * e2[0] + vy * e2[1] + vz * e2[2]; n++;
      }
      ma /= n; mb /= n;
      let caa = 0, cbb = 0, cab = 0;
      for (const g of good) for (const i of g.verts) {
        const vx = P[i * 3] - w[0], vy = P[i * 3 + 1] - w[1], vz = P[i * 3 + 2] - w[2];
        const a = vx * e1[0] + vy * e1[1] + vz * e1[2] - ma;
        const b = vx * e2[0] + vy * e2[1] + vz * e2[2] - mb;
        caa += a * a; cbb += b * b; cab += a * b;
      }
      const ph = 0.5 * Math.atan2(2 * cab, caa - cbb), cp = Math.cos(ph), sp2 = Math.sin(ph);
      for (let k = 0; k < 3; k++) spread[k] = e1[k] * cp + e2[k] * sp2;
    }

    const made = [];
    for (const g of good) {
      // fit a line through the digit: centroid, then a few power iterations
      const c = [0, 0, 0];
      for (const i of g.verts) for (let k = 0; k < 3; k++) c[k] += P[i * 3 + k];
      for (let k = 0; k < 3; k++) c[k] /= g.verts.length;
      let u = d.slice();
      for (let it = 0; it < 12; it++) {
        const o = [0, 0, 0];
        for (const i of g.verts) {
          const vx = P[i * 3] - c[0], vy = P[i * 3 + 1] - c[1], vz = P[i * 3 + 2] - c[2];
          const pr = vx * u[0] + vy * u[1] + vz * u[2];
          o[0] += vx * pr; o[1] += vy * pr; o[2] += vz * pr;
        }
        const l = Math.hypot(o[0], o[1], o[2]); if (l < 1e-12) break;
        u = [o[0] / l, o[1] / l, o[2] / l];
      }
      if (u[0] * d[0] + u[1] * d[1] + u[2] * d[2] < 0) u = [-u[0], -u[1], -u[2]];
      let r0 = 1e9, r1 = -1e9;
      for (const i of g.verts) {
        const r = (P[i * 3] - c[0]) * u[0] + (P[i * 3 + 1] - c[1]) * u[1] + (P[i * 3 + 2] - c[2]) * u[2];
        if (r < r0) r0 = r; if (r > r1) r1 = r;
      }
      if (r1 - r0 < H * 0.012) continue;
      /* the component starts where the cut was, not at the knuckle, so the
         root is extrapolated back down the digit's own axis */
      const rb = r0 - (r1 - r0) * 0.32;
      const at = r => [c[0] + u[0] * r, c[1] + u[1] * r, c[2] + u[2] * r];
      const base = at(rb), tip = at(r1);
      const bt = ((base[0] - w[0]) * d[0] + (base[1] - w[1]) * d[1] + (base[2] - w[2]) * d[2]) / len;
      const sq = (base[0] - w[0]) * spread[0] + (base[1] - w[1]) * spread[1] + (base[2] - w[2]) * spread[2];
      made.push({ side: s, base, mid: at(rb + (r1 - rb) * 0.46), tip, spread, baseT: bt, q: sq,
                  knuckle: [w[0] + d[0] * len * 0.42, w[1] + d[1] * len * 0.42, w[2] + d[2] * len * 0.42] });
    }
    if (made.length < 3) continue;
    made.sort((a, b) => a.q - b.q);
    /* the thumb is the digit that starts nearest the wrist — not simply the
       outermost one, because a hand with no thumb found would otherwise
       have an index finger animated as one */
    const med = made.map(f => f.baseT).sort((a, b) => a - b)[made.length >> 1];
    let th = made[0];
    for (const f of made) if (f.baseT < th.baseT) th = f;
    if (th.baseT < med - 0.08) th.thumb = true;
    for (const f of made) out.fingers.push(f);
  }

  /* ---- 目 ----
     Eyeballs are usually their own closed shells floating inside the head.
     A union-find over the index buffer finds every shell in the model; the
     ones that are small, high, forward and mirrored are the eyes. Models
     that sculpt the eyes into the face give nothing here, and get nothing. */
  const par = new Int32Array(NV);
  for (let i = 0; i < NV; i++) par[i] = i;
  const find = a => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
  for (let t = 0; t < IDX.length; t += 3) {
    const a = find(IDX[t]), b = find(IDX[t + 1]), c = find(IDX[t + 2]);
    if (a !== b) par[b] = a;
    const c2 = find(c), a2 = find(a);
    if (a2 !== c2) par[c2] = a2;
  }
  const comp = new Map();
  for (let i = 0; i < NV; i++) {
    const r = find(i);
    let e = comp.get(r);
    if (!e) { e = { n: 0, lo: [1e9, 1e9, 1e9], hi: [-1e9, -1e9, -1e9], c: [0, 0, 0], v: [] }; comp.set(r, e); }
    e.n++; e.v.push(i);
    for (let k = 0; k < 3; k++) {
      const x = P[i * 3 + k];
      e.c[k] += x; if (x < e.lo[k]) e.lo[k] = x; if (x > e.hi[k]) e.hi[k] = x;
    }
  }
  const cand = [];
  for (const e of comp.values()) {
    if (e.n < 24 || e.n > NV * 0.12) continue;
    for (let k = 0; k < 3; k++) e.c[k] /= e.n;
    const dmax = Math.max(e.hi[0] - e.lo[0], e.hi[1] - e.lo[1], e.hi[2] - e.lo[2]);
    if (dmax > H * 0.075 || dmax < H * 0.008) continue;
    if (e.c[1] < L.neck) continue;                             // must be in the head
    if (Math.abs(e.c[0]) < H * 0.008 || Math.abs(e.c[0]) > H * 0.055) continue;
    cand.push(e);
  }
  for (const a of cand) for (const b of cand) {
    if (a.c[0] >= 0 || b.c[0] <= 0) continue;
    if (Math.abs(Math.abs(a.c[0]) - b.c[0]) > H * 0.006) continue;
    if (Math.abs(a.c[1] - b.c[1]) > H * 0.006) continue;
    if (!out.eyes.length) out.eyes = [a, b];
  }
  return out;
}

/* ---------------- the skeleton ----------------
   Translation-only rest transforms: every bone's rest matrix is a pure
   offset from its parent, so an animation is a plain rotation about the
   bone's own head and nothing has to be un-twisted first. */
function buildSkeleton(L, X) {
  const B = [], byName = {};
  const bone = (name, parent, head) => {
    const b = { name, parent: parent === null ? -1 : byName[parent], head, idx: B.length };
    byName[name] = B.length; B.push(b); return b;
  };
  const H = L.H;
  bone('root', null, [0, L.hip, 0]);
  bone('hips', 'root', [0, L.hip, 0]);
  bone('spine', 'hips', [0, L.waist, 0]);
  bone('chest', 'spine', [0, lerp(L.waist, L.shoulder, 0.62), 0]);
  bone('neck', 'chest', [0, L.neck, 0]);
  bone('head', 'neck', [0, L.neck + H * 0.035, 0]);
  bone('headTip', 'head', [0, L.yhi, 0]);
  for (const s of [-1, 1]) {
    const k = s < 0 ? 'L' : 'R';
    bone('clav' + k, 'chest', [s * L.shoulderX * 0.35, L.shoulder + H * 0.012, L.armZ * 0.5]);
    bone('upArm' + k, 'clav' + k, [s * L.shoulderX, L.armYc, L.armZ]);
    bone('loArm' + k, 'upArm' + k, [s * L.elbowX, L.elbowY, L.elbowZ]);
    bone('hand' + k, 'loArm' + k, [s * L.wristX, L.wristY, L.wristZ]);
    /* with fingers of its own the hand bone must stop at the knuckles, or
       its segment runs straight down the middle of them and wins every
       weight it should have lost */
    const fg = X.fingers.filter(f => f.side === s);
    bone('handTip' + k, 'hand' + k, fg.length ? fg[0].knuckle : [s * L.xmax, L.tipY, L.tipZ]);
    fg.forEach((f, n) => {
      const ax = fingerAxis(f);
      bone('fg' + n + 'a' + k, 'hand' + k, f.base).axis = ax;
      bone('fg' + n + 'b' + k, 'fg' + n + 'a' + k, f.mid).axis = ax;
      bone('fg' + n + 't' + k, 'fg' + n + 'b' + k, f.tip);
    });
    bone('thigh' + k, 'hips', [s * L.legX, L.hip - H * 0.01, 0]);
    bone('shin' + k, 'thigh' + k, [s * L.legX, L.knee, 0]);
    bone('foot' + k, 'shin' + k, [s * L.legX, L.ankle, 0]);
    bone('toe' + k, 'foot' + k, [s * L.legX, L.ylo + H * 0.012, L.toeZ * 0.7]);
  }
  if (X.jaw) {
    bone('jaw', 'head', X.jaw.pivot).axis = [1, 0, 0];
    bone('jawTip', 'jaw', X.jaw.chin);
  }
  X.eyes.forEach((e, n) => {
    bone('eye' + n, 'head', [e.c[0], e.c[1], e.c[2]]).verts = e.v;
    bone('eye' + n + 'Tip', 'eye' + n, [e.c[0], e.c[1], e.c[2] + H * 0.02]);
  });
  // rest world = head position, rest local = offset from the parent's head
  for (const b of B) {
    const p = b.parent >= 0 ? B[b.parent].head : [0, 0, 0];
    b.off = [b.head[0] - p[0], b.head[1] - p[1], b.head[2] - p[2]];
    b.restW = M4.create();
    M4.compose(b.restW, b.head, 0, [1, 1, 1], 0, 0);
    b.invRest = M4.create(); M4.invert(b.invRest, b.restW);
    b.rot = [0, 0, 0];
    b.ang = 0;
    b.world = M4.create();
  }
  return { B, byName };
}

/* A finger curls about one axis and it is not a world axis: it is the
   normal of the plane the finger swings in, which is across the hand.
   Euler angles cannot express that without unwinding the whole arm first,
   so bones that need it carry an explicit axis instead. */
function fingerAxis(f) {
  const v = [f.tip[0] - f.base[0], f.tip[1] - f.base[1], f.tip[2] - f.base[2]];
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  for (let k = 0; k < 3; k++) v[k] /= l;
  // the axis is the fan direction, squared up against this finger's own
  const dp = f.spread[0] * v[0] + f.spread[1] * v[1] + f.spread[2] * v[2];
  const a = [f.spread[0] - v[0] * dp, f.spread[1] - v[1] * dp, f.spread[2] - v[2] * dp];
  const la = Math.hypot(a[0], a[1], a[2]) || 1;
  for (let k = 0; k < 3; k++) a[k] /= la;
  /* which way is closed? A hand at the side has its palm against the thigh,
     so a curling fingertip travels toward the midline. Pick the sign that
     does that rather than trusting the principal axis to come out one way. */
  const cx = a[1] * v[2] - a[2] * v[1];
  return (cx * -f.side > 0) ? a : [-a[0], -a[1], -a[2]];
}

/* offset + a rotation of `ang` about `ax`, as a column-major mat4 */
function axisLocal(out, off, ax, ang) {
  const c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  const [x, y, z] = ax;
  out[0] = t * x * x + c;     out[1] = t * x * y + s * z; out[2] = t * x * z - s * y; out[3] = 0;
  out[4] = t * x * y - s * z; out[5] = t * y * y + c;     out[6] = t * y * z + s * x; out[7] = 0;
  out[8] = t * x * z + s * y; out[9] = t * y * z - s * x; out[10] = t * z * z + c;    out[11] = 0;
  out[12] = off[0]; out[13] = off[1]; out[14] = off[2]; out[15] = 1;
  return out;
}

/* ---------------- binding ----------------
   Weight by distance to the bone SEGMENT, not to the joint: a point on the
   forearm is near the elbow and near the wrist and must belong to the bone
   between them, not to whichever joint happens to be closer. */
function bindSkin(P, SK, L, X) {
  const NV = P.length / 3, B = SK.B;
  // only bones with a real length take weight; the tips are there to give
  // their parents a direction
  const use = [];
  for (const b of B) {
    if (b.name === 'root' || b.name.endsWith('Tip') || b.verts) continue;
    const kid = B.find(c => c.parent === b.idx);
    if (!kid) continue;
    const g = { i: b.idx, a: b.head, b: kid.head, name: b.name };
    if (b.name === 'jaw') g.jawLim = X.jaw.lim;
    // a finger is 15mm across and its neighbour is 20mm away; the general
    // falloff is far too soft to keep them apart
    if (b.name.startsWith('fg')) g.tight = 9.0;
    use.push(g);
  }
  const BI = new Uint8Array(NV * 4), BW = new Float32Array(NV * 4);
  const sc = [];
  for (let v = 0; v < NV; v++) {
    const px = P[v * 3], py = P[v * 3 + 1], pz = P[v * 3 + 2];
    sc.length = 0;
    for (let u = 0; u < use.length; u++) {
      const g = use[u];
      const bx = g.b[0] - g.a[0], by = g.b[1] - g.a[1], bz = g.b[2] - g.a[2];
      const bb = bx * bx + by * by + bz * bz;
      const t = bb > 1e-12 ? clamp(((px - g.a[0]) * bx + (py - g.a[1]) * by + (pz - g.a[2]) * bz) / bb, 0, 1) : 0;
      let d = Math.hypot(px - g.a[0] - bx * t, py - g.a[1] - by * t, pz - g.a[2] - bz * t);
      // a left bone must not claim a right vertex
      if (g.name.endsWith('L') && px > L.H * 0.01) d += L.H;
      if (g.name.endsWith('R') && px < -L.H * 0.01) d += L.H;
      /* The jaw's segment is INSIDE the head, so the back of the skull is
         as close to it as the chin is. Nothing in the geometry distinguishes
         them — the constraint is anatomical and has to be stated. */
      if (g.jawLim && (py > g.jawLim || pz < g.a[2])) d += L.H;
      sc.push([g.i, 1 / Math.pow(d + L.H * 0.006, g.tight || 4.5)]);
    }
    sc.sort((a, b) => b[1] - a[1]);
    let tot = 0;
    for (let k = 0; k < 4; k++) tot += sc[k][1];
    for (let k = 0; k < 4; k++) { BI[v * 4 + k] = sc[k][0]; BW[v * 4 + k] = sc[k][1] / tot; }
  }
  return { BI, BW };
}

/* An eyeball is its own shell, so it does not need weighting at all — every
   vertex of it belongs to that eye and to nothing else. Doing this AFTER
   the smoothing pass matters: smoothing runs over the mesh graph and the
   eye shares no edge with the face, so a blurred eye would be pulled by
   whatever the face is doing and drift out of its socket. */
function bindRigid(SK, BI, BW) {
  for (const b of SK.B) {
    if (!b.verts) continue;
    for (const v of b.verts) {
      BI[v * 4] = b.idx; BW[v * 4] = 1;
      for (let k = 1; k < 4; k++) { BI[v * 4 + k] = 0; BW[v * 4 + k] = 0; }
    }
  }
}

/* Smooth the weights over the mesh graph. Distance binding alone leaves a
   hard line across a shoulder; two passes of averaging turn that into the
   fold a shoulder actually makes. */
function smoothWeights(IDX, NV, NB, BI, BW, passes) {
  const nb = new Array(NV);
  for (let i = 0; i < NV; i++) nb[i] = [];
  for (let t = 0; t < IDX.length; t += 3) {
    const a = IDX[t], b = IDX[t + 1], c = IDX[t + 2];
    nb[a].push(b, c); nb[b].push(a, c); nb[c].push(a, b);
  }
  let W = new Float32Array(NV * NB);
  for (let v = 0; v < NV; v++) for (let k = 0; k < 4; k++) W[v * NB + BI[v * 4 + k]] += BW[v * 4 + k];
  const T = new Float32Array(NV * NB);
  for (let p = 0; p < passes; p++) {
    for (let v = 0; v < NV; v++) {
      const L = nb[v], n = L.length;
      for (let k = 0; k < NB; k++) T[v * NB + k] = W[v * NB + k] * 0.42;
      if (n) for (const j of L) for (let k = 0; k < NB; k++) T[v * NB + k] += W[j * NB + k] * 0.58 / n;
    }
    W.set(T);
  }
  for (let v = 0; v < NV; v++) {
    const top = [];
    for (let k = 0; k < NB; k++) if (W[v * NB + k] > 1e-4) top.push([k, W[v * NB + k]]);
    top.sort((a, b) => b[1] - a[1]);
    let tot = 0;
    for (let k = 0; k < 4; k++) tot += (top[k] ? top[k][1] : 0);
    for (let k = 0; k < 4; k++) {
      BI[v * 4 + k] = top[k] ? top[k][0] : 0;
      BW[v * 4 + k] = top[k] ? top[k][1] / tot : 0;
    }
  }
}

/* ---------------- the model ---------------- */
const RIG = {
  ready: false, mesh: null, SK: null, L: null, X: null,
  BI: null, BW: null, NV: 0, boneTex: null, boneData: null,
  clip: 'walk', time: 0, speed: 1, playing: true, tris: 0
};

function loadModel(text, status) {
  status('メッシュを読み込み中…');
  const { P, IDX } = parseOBJ(text);
  const NV = P.length / 3;
  if (!NV || !IDX.length) { status('OBJ に頂点か面がありません'); return false; }

  status('骨格を推定中…');
  const L = findLandmarks(P);
  // normalise: put the feet on the ground and scale to 1.65 m
  const s = 1.65 / L.H;
  for (let i = 0; i < P.length; i += 3) {
    P[i] *= s; P[i + 1] = (P[i + 1] - L.ylo) * s; P[i + 2] *= s;
  }
  /* heights shift with the feet to the floor; lengths only scale */
  const HEIGHTS = ['ankle', 'knee', 'crotch', 'hip', 'waist', 'shoulder', 'neck',
                   'armYc', 'elbowY', 'wristY', 'tipY', 'yhi'];
  const LENGTHS = ['H', 'legX', 'shoulderX', 'elbowX', 'wristX', 'xmax',
                   'armZ', 'elbowZ', 'wristZ', 'tipZ', 'toeZ'];
  for (const k of HEIGHTS) L[k] = (L[k] - L.ylo) * s;
  for (const k of LENGTHS) L[k] = L[k] * s;
  L.ylo = 0;

  status('手と顔を探しています…');
  const X = findExtras(P, IDX, L);

  status('骨を当てています…');
  const SK = buildSkeleton(L, X);

  status('スキンウェイトを計算中…');
  const { BI, BW } = bindSkin(P, SK, L, X);
  smoothWeights(IDX, NV, SK.B.length, BI, BW, 2);
  bindRigid(SK, BI, BW);

  status('メッシュを構築中…');
  const g = new Geo();
  const N = new Float64Array(NV * 3);
  for (let t = 0; t < IDX.length; t += 3) {
    const a = IDX[t] * 3, b = IDX[t + 1] * 3, c = IDX[t + 2] * 3;
    const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
    const vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
  }
  const N0 = new Float32Array(NV * 3);
  for (let i = 0; i < NV; i++) {
    const l = Math.hypot(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]) || 1;
    N0[i * 3] = N[i * 3] / l; N0[i * 3 + 1] = N[i * 3 + 1] / l; N0[i * 3 + 2] = N[i * 3 + 2] / l;
    g.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N0[i * 3], N0[i * 3 + 1], N0[i * 3 + 2],
      (Math.atan2(P[i * 3], P[i * 3 + 2]) / TAU + 0.5) * 2.0, P[i * 3 + 1] * 2.2, MAT.PLASTER);
  }
  for (let t = 0; t < IDX.length; t += 3) g.tri(IDX[t], IDX[t + 1], IDX[t + 2]);

  if (RIG.mesh) {
    const cut = d => d.mesh !== RIG.mesh;
    R.scene.draws = R.scene.draws.filter(cut);
    R.scene.shadowDraws = R.scene.shadowDraws.filter(cut);
  }
  const mesh = new Mesh(g);
  mesh.setInstances([{ m: M4.create(), tint: [0.90, 0.86, 0.83, 0.3] }]);

  /* ---- the skin goes on the GPU ----
     Two extra vertex attributes (bone index, bone weight) and a one-row
     RGBA32F texture holding every bone matrix. A pose is then a 4KB upload
     instead of 44,000 matrix blends in JavaScript. */
  const NBn = SK.B.length;
  const bi = new Float32Array(NV * 4), bw = new Float32Array(NV * 4);
  for (let i = 0; i < NV * 4; i++) { bi[i] = BI[i]; bw[i] = BW[i]; }
  gl.bindVertexArray(mesh.vao);
  for (const [loc, data] of [[9, bi], [10, bw]]) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 16, 0);
  }
  gl.bindVertexArray(null);
  if (RIG.boneTex) gl.deleteTexture(RIG.boneTex);
  const boneTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, boneTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, NBn * 4, 1, 0, gl.RGBA, gl.FLOAT, null);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
    gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
    gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);

  R.scene.draws.push({ mesh, name: 'model', skin: boneTex });
  R.scene.shadowDraws.push({ mesh, skin: boneTex });

  Object.assign(RIG, {
    ready: true, mesh, SK, L, X, NV, BI, BW, boneTex,
    boneData: new Float32Array(NBn * 16),
    tris: IDX.length / 3
  });
  R.histValid = false;
  status('');
  return true;
}

/* ---------------- pose & animation ---------------- */
function poseRig(t) {
  const B = RIG.SK.B, N = RIG.SK.byName, L = RIG.L;
  for (const b of B) { b.rot[0] = b.rot[1] = b.rot[2] = 0; b.ang = 0; }
  const set = (n, x, y, z) => { const b = B[N[n]]; if (b) { b.rot[0] = x || 0; b.rot[1] = y || 0; b.rot[2] = z || 0; } };
  const ang = (n, a) => { const b = B[N[n]]; if (b) b.ang = a; };
  const D = Math.PI / 180;
  let rootY = 0, rootZ = 0;

  /* From a T-pose the arms have to come down before anything else reads as
     a person. If the model arrived with its arms already down this is
     nearly zero. */
  /* how far the arm already hangs: from the shoulder to the wrist in the
     rest pose. A T-pose needs the full 72 degrees, an A-pose much less. */
  const Lm = RIG.L;
  const already = Math.atan2(Math.max(0, Lm.armYc - Lm.wristY), Math.max(1e-4, Lm.wristX - Lm.shoulderX));
  const drop = Math.max(0, (Lm.armsOut ? 1.26 : 0.10) - already);

  const A = RIG.clip;
  if (A === 'idle') {
    const br = Math.sin(t * 1.5);
    set('chest', br * 1.2 * D);
    set('spine', br * 0.8 * D);
    set('head', -br * 0.8 * D, Math.sin(t * 0.42) * 5 * D);
    set('upArmL', 4 * D, 0, drop + 4 * D - br * 1.2 * D);
    set('upArmR', 4 * D, 0, -drop - 4 * D + br * 1.2 * D);
    set('loArmL', 12 * D, 0, 8 * D);
    set('loArmR', 12 * D, 0, -8 * D);
    rootY = br * 0.006;
  } else if (A === 'walk' || A === 'run') {
    const run = A === 'run';
    const f = t * (run ? 4.6 : 2.6);
    const ph = f * TAU;
    const sw = run ? 42 : 24, kn = run ? 78 : 46, arm = run ? 46 : 22;
    for (const [k, o] of [['L', 0], ['R', Math.PI]]) {
      const p = ph + o, sp = Math.sin(p), cp = Math.cos(p);
      set('thigh' + k, sp * sw * D);
      // the knee only bends one way, and hardest just after the foot leaves
      const bend = Math.max(0, Math.sin(p - 0.9)) ;
      set('shin' + k, -(bend * kn + (run ? 12 : 6)) * D);
      set('foot' + k, (Math.sin(p + 1.6) * (run ? 22 : 14) + (run ? 6 : 2)) * D);
      const s = k === 'L' ? 1 : -1;
      set('upArm' + k, -sp * arm * D, 0, s * (drop + (run ? 14 : 6) * D));
      set('loArm' + k, ((run ? 48 : 20) + Math.max(0, -sp) * (run ? 34 : 14)) * D, 0, s * 6 * D);
    }
    set('spine', (run ? 7 : 2) * D, Math.sin(ph) * (run ? 5 : 3) * D);
    set('chest', 0, -Math.sin(ph) * (run ? 9 : 5) * D);
    set('head', (run ? -5 : -1) * D, Math.sin(ph) * 2 * D);
    rootY = -Math.abs(Math.cos(ph)) * (run ? 0.055 : 0.022) + (run ? 0.030 : 0.010);
    rootZ = Math.sin(ph * 2) * 0.006;
  } else if (A === 'jump') {
    const p = (t * 0.75) % 1;                    // 0..1 over the whole jump
    const air = p > 0.22 && p < 0.80;
    const crouch = p < 0.22 ? Math.sin(p / 0.22 * Math.PI) : 0;
    const fly = air ? Math.sin((p - 0.22) / 0.58 * Math.PI) : 0;
    const land = p >= 0.80 ? Math.sin((p - 0.80) / 0.20 * Math.PI) : 0;
    const c = crouch + land;
    for (const k of ['L', 'R']) {
      set('thigh' + k, (c * 52 - fly * 26) * D);
      set('shin' + k, (-c * 86 - fly * 52) * D);
      set('foot' + k, (c * 32 + fly * 26) * D);
      const s = k === 'L' ? 1 : -1;
      set('upArm' + k, (c * 40 - fly * 120) * D, 0, s * (drop - fly * 40 * D));
      set('loArm' + k, (18 + c * 30) * D, 0, s * 6 * D);
    }
    set('spine', c * 16 * D);
    set('chest', c * 10 * D);
    rootY = fly * 0.42 - c * 0.16;
  }

  /* ---- 指・顎・目 ----
     Everything above moves the figure. These three are what make it look
     inhabited, and none of them belongs in the leg cycle above: a hand
     closes and opens on its own clock, and eyes never sit still. */
  const nf = RIG.X ? RIG.X.fingers.length : 0;
  if (nf) {
    /* how closed the hand is, 0 = flat, 1 = fist */
    const grip = A === 'run' ? 0.86
      : A === 'jump' ? 0.20 + 0.55 * Math.max(0, Math.sin(t * 2.4))
      : A === 'walk' ? 0.34 + 0.10 * Math.sin(t * 2.6)
      : 0.30 + 0.07 * Math.sin(t * 0.9);
    for (const s of [-1, 1]) {
      const k = s < 0 ? 'L' : 'R';
      const row = RIG.X.fingers.filter(q => q.side === s);
      row.forEach((f, n) => {
        /* a thumb does not close nearly as far as the rest, and a hand with
           every digit at the same angle reads as a claw */
        const g = grip * (f.thumb ? 0.40 : 0.86 + 0.16 * (n / Math.max(1, row.length - 1)));
        ang('fg' + n + 'a' + k, g * 62 * D);
        ang('fg' + n + 'b' + k, g * 74 * D);
      });
    }
  }
  if (N.jaw !== undefined) {
    const open = A === 'run' ? 0.55 + 0.30 * Math.sin(t * 9.2)
      : A === 'jump' ? 0.35 + 0.30 * Math.sin(t * 3.0)
      : 0.06 + 0.05 * Math.sin(t * 1.3);
    ang('jaw', open * 13 * D);
  }
  if (N.eye0 !== undefined) {
    /* saccades, not a sweep. Eyes hold still and then jump; a smoothly
       panning eye is the single most unsettling thing a face can do. */
    const step = Math.floor(t * 0.7);
    const rnd = s => { const v = Math.sin(s * 12.9898) * 43758.5453; return v - Math.floor(v); };
    const hold = clamp((t * 0.7 - step) * 9, 0, 1);
    const yaw = (rnd(step) - 0.5) * 0.30, pit = (rnd(step + 91) - 0.5) * 0.16;
    const yaw0 = (rnd(step - 1) - 0.5) * 0.30, pit0 = (rnd(step + 90) - 0.5) * 0.16;
    for (const e of ['eye0', 'eye1']) if (N[e] !== undefined)
      set(e, lerp(pit0, pit, hold), lerp(yaw0, yaw, hold), 0);
  }

  // solve
  const tmp = M4.create();
  for (const b of B) {
    const off = b.name === 'root' ? [b.off[0], b.off[1] + rootY, b.off[2] + rootZ] : b.off;
    if (b.axis) axisLocal(tmp, off, b.axis, b.ang);
    else M4.compose(tmp, off, b.rot[1], [1, 1, 1], b.rot[0], b.rot[2]);
    if (b.parent >= 0) M4.mul(b.world, B[b.parent].world, tmp); else M4.copy(b.world, tmp);
  }
  skinModel();
}

function skinModel() {
  const { SK, boneData, boneTex } = RIG;
  const B = SK.B, tmp = M4.create();
  for (let i = 0; i < B.length; i++) {
    M4.mul(tmp, B[i].world, B[i].invRest);
    boneData.set(tmp, i * 16);
  }
  gl.bindTexture(gl.TEXTURE_2D, boneTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, B.length * 4, 1, gl.RGBA, gl.FLOAT, boneData);
}

'''

VIEWER = r'''/* ==== e_rig.js ==== */
const QUALITY = [
  { name: '低', scale: 0.62, shadow: 1024, mat: 512, ao: true, ssr: false, vol: true, taa: true, dof: false },
  { name: '中', scale: 0.82, shadow: 1536, mat: 512, ao: true, ssr: true, vol: true, taa: true, dof: false },
  { name: '高', scale: 1.00, shadow: 2048, mat: 1024, ao: true, ssr: true, vol: true, taa: true, dof: false },
];
function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
}
function resize() {
  const q = QUALITY[R.quality];
  const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
  const cw = R.canvas.clientWidth || innerWidth, ch = R.canvas.clientHeight || innerHeight;
  const w = Math.max(320, Math.round(cw * dpr * q.scale * R.userScale));
  const h = Math.max(200, Math.round(ch * dpr * q.scale * R.userScale));
  R.canvas.width = Math.round(cw * dpr); R.canvas.height = Math.round(ch * dpr);
  if (w !== R.w || h !== R.h) allocTargets(w, h);
}
function applyQuality(qi, rebuild) {
  R.quality = qi;
  const q = QUALITY[qi];
  CFG.ao = q.ao; CFG.ssr = q.ssr ? 1.0 : 0.0; CFG.volumetric = q.vol; CFG.taa = q.taa; CFG.dof = false;
  if (rebuild) {
    for (const s of R.shadow) { gl.deleteTexture(s.tex); gl.deleteFramebuffer(s.fb); }
    R.shadow = [makeShadowRT(q.shadow), makeShadowRT(q.shadow), makeShadowRT(Math.max(1024, q.shadow >> 1))];
  }
  resize();
}

/* d_render calls these from updateSun; without them boot throws on the
   very first frame and never sets __ready. */
function setHour(v) { CFG.hourTarget = ((v % 24) + 24) % 24; }
function refreshLiveReadout() {}

const ORB = { yaw: 0.30, pitch: -0.02, dist: 3.4, distT: 3.4, ty: 0.90, tyT: 0.90,
              tx: 0, txT: 0, spin: false };
function updateCamera(dt) {
  CAM.fov += (CAM.fovTarget - CAM.fov) * Math.min(1, dt * 11);
  if (ORB.spin) ORB.yaw += dt * 0.35;
  ORB.dist += (ORB.distT - ORB.dist) * Math.min(1, dt * 8);
  ORB.ty += (ORB.tyT - ORB.ty) * Math.min(1, dt * 8);
  ORB.tx += (ORB.txT - ORB.tx) * Math.min(1, dt * 8);
  ORB.pitch = clamp(ORB.pitch, -1.15, 1.15);
  const cp = Math.cos(ORB.pitch);
  /* the pivot pans sideways too — a hand is 60cm off the axis and there is
     no way to look at one closely without it */
  CAM.pos = [ORB.tx + Math.sin(ORB.yaw) * cp * ORB.dist, ORB.ty + Math.sin(ORB.pitch) * ORB.dist,
             Math.cos(ORB.yaw) * cp * ORB.dist];
  const dir = norm(sub([ORB.tx, ORB.ty, 0], CAM.pos));
  CAM.yaw = Math.atan2(dir[0], -dir[2]);
  CAM.pitch = Math.asin(clamp(dir[1], -1, 1));
  M4.copy(CAM.prevViewProj, CAM.viewProj);
  M4.lookAt(CAM.view, CAM.pos, add(CAM.pos, dir), [0, 1, 0]);
  M4.perspective(CAM.projNoJitter, CAM.fov, R.w / R.h, CAM.near, CAM.far);
  M4.copy(CAM.proj, CAM.projNoJitter);
  if (CFG.taa) {
    const i = R.jitterIdx % 8;
    CAM.proj[8] += (HALTON2[i] - 0.5) * 2 / R.w;
    CAM.proj[9] += (HALTON3[i] - 0.5) * 2 / R.h;
    R.jitterIdx++;
  }
  M4.mul(CAM.viewProj, CAM.proj, CAM.view);
  M4.invert(CAM.invViewProj, CAM.viewProj);
  M4.invert(CAM.invProj, CAM.proj);
}

function status(msg) {
  const el = document.getElementById('note');
  el.textContent = msg || '';
  el.style.display = msg ? '' : 'none';
}
function setClip(c) {
  RIG.clip = c;
  for (const b of document.querySelectorAll('[data-clip]'))
    b.classList.toggle('on', b.dataset.clip === c);
}
function setupInput() {
  const c = R.canvas;
  let drag = null, pinch = 0;
  const pos = e => ({ x: e.touches ? e.touches[0].clientX : e.clientX, y: e.touches ? e.touches[0].clientY : e.clientY });
  const d2 = e => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  c.addEventListener('mousedown', e => { drag = pos(e); drag.pan = e.shiftKey || e.button === 2; });
  c.addEventListener('contextmenu', e => e.preventDefault());
  c.addEventListener('touchstart', e => { if (e.touches.length > 1) { pinch = d2(e); drag = null; } else drag = pos(e); }, { passive: true });
  const move = e => {
    if (e.touches && e.touches.length > 1) { const d = d2(e); if (pinch) ORB.distT = clamp(ORB.distT * (pinch / d), 0.3, 14); pinch = d; e.preventDefault(); return; }
    if (!drag) return;
    const p = pos(e);
    const pan = drag.pan;
    if (drag.pan) {
      ORB.txT = clamp(ORB.txT - (p.x - drag.x) * ORB.dist * 0.0016, -2, 2);
      ORB.tyT = clamp(ORB.tyT + (p.y - drag.y) * ORB.dist * 0.0016, -0.5, 2.4);
    } else { ORB.yaw -= (p.x - drag.x) * 0.006; ORB.pitch += (p.y - drag.y) * 0.005; }
    drag = p; drag.pan = pan; if (e.touches) e.preventDefault();
  };
  addEventListener('mousemove', move);
  c.addEventListener('touchmove', move, { passive: false });
  addEventListener('mouseup', () => drag = null);
  addEventListener('touchend', () => { drag = null; pinch = 0; });
  c.addEventListener('wheel', e => { e.preventDefault(); ORB.distT = clamp(ORB.distT * Math.exp(e.deltaY * 0.0012), 0.3, 14); }, { passive: false });
  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k === '1') setClip('idle'); if (k === '2') setClip('walk');
    if (k === '3') setClip('run');  if (k === '4') setClip('jump');
    if (k === ' ') { e.preventDefault(); RIG.playing = !RIG.playing; }
    if (k === 'r') ORB.spin = !ORB.spin;
  });

  // ---- drop a model on it ----
  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  for (const ev of ['dragenter', 'dragover', 'dragleave', 'drop']) addEventListener(ev, stop, false);
  addEventListener('dragover', () => document.body.classList.add('drag'));
  addEventListener('dragleave', () => document.body.classList.remove('drag'));
  addEventListener('drop', e => {
    document.body.classList.remove('drag');
    const f = e.dataTransfer.files[0]; if (f) readFile(f);
  });
  document.getElementById('file').addEventListener('change', e => {
    const f = e.target.files[0]; if (f) readFile(f);
  });
}
function readFile(f) {
  if (!/\.obj$/i.test(f.name)) { status('.obj を渡してください'); return; }
  status('読み込み中… ' + f.name);
  const r = new FileReader();
  r.onload = () => {
    setTimeout(() => {
      try {
        if (loadModel(r.result, status)) {
          document.getElementById('drop').style.display = 'none';
          document.getElementById('info').textContent =
            f.name + ' — ' + RIG.tris.toLocaleString() + ' 三角形 / ' + RIG.SK.B.length + ' ボーン';
          poseRig(0);
        }
      } catch (err) { status('読み込みに失敗: ' + err.message); }
    }, 30);
  };
  r.readAsText(f);
}

async function boot() {
  const canvas = document.getElementById('gl');
  R.canvas = canvas; R.userScale = 1.0; CFG.dofUser = false;
  gl = canvas.getContext('webgl2', { antialias: false, depth: true, alpha: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: true });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) {
    document.getElementById('err').style.display = 'flex'; return;
  }
  gl.getExtension('OES_texture_float_linear'); gl.getExtension('EXT_float_blend');
  const st = document.getElementById('status');
  const step = async (m, fn) => { st.textContent = m; await new Promise(r => setTimeout(r, 12)); fn(); };
  const QS = new URLSearchParams(location.search);
  R.quality = QS.has('q') ? clamp(parseInt(QS.get('q')), 0, 2) : (isMobile() ? 1 : 2);
  const q = Object.assign({}, QUALITY[R.quality]);
  fullscreenInit();
  await step('シェーダをコンパイル中…', () => initPrograms());
  await step('質感をベイク中…', () => {
    bakeMaterials(q.mat);
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    R.decalTex = t;
  });
  await step('空を計算中…', () => {
    R.skyCube = makeCube(256, 7); R.irrCube = makeCube(32, 1); R.prefCube = makeCube(128, 6);
    R.shadow = [makeShadowRT(q.shadow), makeShadowRT(q.shadow), makeShadowRT(Math.max(1024, q.shadow >> 1))];
    R.cascadeVP = [M4.create(), M4.create(), M4.create()];
    R.meter = [makeRT(1, 1, { format: 'rgba16f' }), makeRT(1, 1, { format: 'rgba16f' })];
    R.expoTex = R.meter[1].tex;
    updateSun(0);
  });
  await step('床を敷いています…', () => { R.scene = buildScene(2); });
  await step('準備完了', () => {
    applyQuality(R.quality, false); resize(); bakeSky();
    CFG.sekkiTarget = CFG.sekki = 15; CFG.hourTarget = CFG.hour = 10.5;
    updateSun(0); R.expoSnap = true;
  });
  document.getElementById('loading').style.opacity = '0';
  setTimeout(() => document.getElementById('loading').style.display = 'none', 700);
  addEventListener('resize', resize);
  setupInput();
  for (const b of document.querySelectorAll('[data-clip]'))
    b.addEventListener('click', () => setClip(b.dataset.clip));
  document.getElementById('speed').addEventListener('input', e => RIG.speed = +e.target.value);
  const qs = document.getElementById('qual');
  qs.value = R.quality;
  qs.addEventListener('change', () => applyQuality(+qs.value, true));
  setClip('walk');

  let last = performance.now(), acc = 0, frames = 0;
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.06); last = now;
    R.time += dt; acc += dt; frames++;
    if (acc > 0.5) { document.getElementById('fps').textContent = Math.round(frames / acc) + ' fps'; acc = 0; frames = 0; }
    updateSun(dt); updateCamera(dt);
    if (RIG.ready) { if (RIG.playing) RIG.time += dt * RIG.speed; poseRig(RIG.time); }
    renderFrame(dt); R.frame++;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  window.__DBG = { CFG, R, CAM, ORB, RIG, loadModel, poseRig, setClip, resize, updateSun };
  window.__ready = true;
}
addEventListener('load', boot);
'''

SHELL_HEAD = '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>Autorig — OBJ を落とすと歩き出す</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:#0a0c10;overflow:hidden;color:#e6e9ef;
    font:13px/1.5 -apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",system-ui,sans-serif}
  #gl{position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
  #gl:active{cursor:grabbing}
  #ui{position:fixed;inset:0;pointer-events:none}
  #bar{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);pointer-events:auto;
    display:flex;gap:6px;align-items:center;background:rgba(12,15,21,.86);border-radius:12px;
    padding:8px 10px;border:1px solid rgba(255,255,255,.09);
    -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);flex-wrap:wrap;justify-content:center;
    max-width:calc(100vw - 20px)}
  button,select,label.f{font:inherit;font-size:12px;color:#dfe4ec;background:rgba(255,255,255,.07);
    border:1px solid rgba(255,255,255,.12);border-radius:8px;padding:5px 11px;cursor:pointer}
  button:hover,label.f:hover{background:rgba(255,255,255,.15)}
  button.on{background:#dfe4ec;color:#12151b;border-color:#dfe4ec}
  input[type=range]{width:96px;height:16px;-webkit-appearance:none;background:transparent}
  input[type=range]::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:rgba(255,255,255,.18)}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;margin-top:-5px;border-radius:50%;background:#e6e9ef;border:0}
  input[type=range]::-moz-range-track{height:3px;border-radius:2px;background:rgba(255,255,255,.18)}
  input[type=range]::-moz-range-thumb{width:13px;height:13px;border:0;border-radius:50%;background:#e6e9ef}
  #file{display:none}
  #stat{position:absolute;top:12px;right:12px;text-align:right;font-size:11px;color:#93a0b3;
    font-variant-numeric:tabular-nums;background:rgba(12,15,21,.6);border-radius:9px;padding:6px 10px;
    border:1px solid rgba(255,255,255,.07)}
  #stat b{color:#e6e9ef}
  #drop{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:14px;text-align:center;padding:24px;pointer-events:none}
  #drop .big{font-size:19px;letter-spacing:.06em}
  #drop .sm{font-size:12px;color:#8b95a6;max-width:30em;line-height:1.9}
  #drop label.f{pointer-events:auto;font-size:13px;padding:8px 18px}
  body.drag #drop{background:rgba(80,120,180,.16);outline:2px dashed rgba(190,215,255,.5);outline-offset:-14px}
  #note{position:absolute;left:50%;top:22px;transform:translateX(-50%);font-size:12px;
    background:rgba(12,15,21,.86);border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:7px 14px;display:none}
  #loading{position:fixed;inset:0;background:#0a0c10;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:12px;transition:opacity .6s;z-index:9}
  #loading .k{font-size:20px;letter-spacing:.3em;color:#d8dee9}
  #status{font-size:11px;color:#79839a}
  #err{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:#0a0c10;padding:24px;text-align:center;z-index:10}
</style>
</head>
<body>
<canvas id="gl"></canvas>
<div id="ui">
  <div id="drop">
    <div class="big">.obj を、ここに落としてください</div>
    <div class="sm">骨格を自動で推定し、スキンウェイトを計算して、歩かせます。<br>
      モデルはこのファイルには含まれません。読み込みは全部ブラウザの中で完結し、どこにも送信されません。</div>
    <label class="f" for="file">ファイルを選ぶ</label>
    <input id="file" type="file" accept=".obj">
  </div>
  <div id="note"></div>
  <div id="stat"><div><b id="fps">—</b></div><div id="info">—</div></div>
  <div id="bar">
    <button data-clip="idle">立ち</button>
    <button data-clip="walk">歩き</button>
    <button data-clip="run">走り</button>
    <button data-clip="jump">跳び</button>
    <input type="range" id="speed" min="0.15" max="2.2" step="0.05" value="1">
    <select id="qual"><option value="0">低</option><option value="1">中</option><option value="2">高</option></select>
  </div>
</div>
<div id="loading"><div class="k">AUTORIG</div><div id="status">初期化中…</div></div>
<div id="err">お使いのブラウザは WebGL2 に対応していません。</div>
<script>
'''

out = SHELL_HEAD + core + shA + shB + STUDIO + astro + render + RIG + VIEWER + '</script>\n</body>\n</html>\n'
io.open(DST, 'w', encoding='utf-8').write(out)
print('wrote %s (%.0f KB)' % (DST, len(out) / 1024))
