#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
character.html を hiyorimi.html から生成する。

キャラクターだけを、神社を組まずに見るためのビューア。
レンダラ（a_core / b_shaders / c2_astro / d_render）とキャラクター本体
（h_kitsune）は hiyorimi.html から**そのまま**持ってくる。
つまり見え方は本編と完全に同じで、周りが無いだけ。

    python3 game/build_character.py

キャラクターを直すときは hiyorimi.html の h_kitsune.js を直して、
これを流し直す。実装が二重化しないようにするための構成。
"""
import io, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'hiyorimi.html')
DST = os.path.join(HERE, 'character.html')

src = io.open(SRC, encoding='utf-8').read()

MARK = '/* ==== %s ==== */'
ORDER = ['a_core.js', 'b_shaders_a.js', 'b_shaders_b.js', 'c_scene.js', 'c2_astro.js',
         'd_render.js', 'f_kyonshi.js', 'g_keidai.js', 'h_kitsune.js', 'e_main.js']


def section(name):
    i = src.index(MARK % name)
    k = ORDER.index(name)
    if k + 1 < len(ORDER):
        j = src.index(MARK % ORDER[k + 1])
    else:
        j = src.index('</script>', i)
    return src[i:j]


# ---- the renderer, verbatim ------------------------------------------------
core = section('a_core.js')
shA = section('b_shaders_a.js')
shB = section('b_shaders_b.js')
astro = section('c2_astro.js')
render = section('d_render.js')
kitsune = section('h_kitsune.js')

# ---- MAT lives in the scene section; lift just that table ------------------
sc = section('c_scene.js')
i = sc.index('const MAT = {')
mat_table = sc[i:sc.index('};', i) + 3]

# ---- strip the corridor camera out of d_render -----------------------------
# groundHeightAt / registerAreas / updateCamera all know about the path and the
# precinct. The viewer supplies its own orbit camera instead.
cut0 = render.index('/* ---------------- camera update ---------------- */')
head, tail = render[:cut0], render[cut0:]
keep = tail[:tail.index('function groundHeightAt')]      # KEYS / touchLook / joy
render = head + keep

missing = [n for n in ('function groundHeightAt', 'registerAreas', 'function updateCamera') if n in render]
assert not missing, missing

# ---- what is left of the world, for a studio -------------------------------
STUDIO = '''/* ==== c_studio.js ==== */
/* =========================================================================
   STUDIO : キャラクターだけを見るための最小の世界

   本編の伏見稲荷は丸ごと外してある。残っているのは、キャラクターが
   立つ床と、レンダラが世界に対して尋ねてくる数個の口だけ。地面が平ら
   だと接地とプロポーションの誤りがそのまま出るので、評価用としては
   境内より正確でもある。
   ========================================================================= */

''' + mat_table + '''

/* the renderer asks the world for these; here they are trivial */
const KY = { lights: [], list: [] };
const WORLD = {
  areas: [], boxes: [],
  groundAt(x, z) { return { y: 0, solid: true }; },
  resolve(p, r) { }
};
function keidaiGroundY(x, z) { return 0; }
function groundHeightAt(x, z) { return { y: 0, s: 0, t: 0 }; }

/* ---------------- the set ----------------
   A flat plaza, and a low stone dais under the character. The dais is not
   decoration: a contact shadow against a known plane is the fastest way to
   see whether the feet are actually on the ground.                        */
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

function buildDais(r, h, seg, mat) {
  const g = new Geo(), top = [], bot = [];
  for (let j = 0; j <= seg; j++) {
    const a = (j / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
    top.push(g.push(r * c, h, r * s, 0, 1, 0, 0.5 + c * 0.5, 0.5 + s * 0.5, mat));
    bot.push(g.push(r * c, 0, r * s, 0, 1, 0, 0.5 + c * 0.5, 0.5 + s * 0.5, mat));
  }
  const ctr = g.push(0, h, 0, 0, 1, 0, 0.5, 0.5, mat);
  for (let j = 0; j < seg; j++) g.tri(ctr, top[j], top[j + 1]);
  // the rim, with its own normals so it catches a highlight
  const rt = [], rb = [];
  for (let j = 0; j <= seg; j++) {
    const a = (j / seg) * TAU, c = Math.cos(a), s = Math.sin(a);
    rt.push(g.push(r * c, h, r * s, c, 0, s, (j / seg) * 6, 0, mat));
    rb.push(g.push(r * c, 0, r * s, c, 0, s, (j / seg) * 6, 0.5, mat));
  }
  for (let j = 0; j < seg; j++) g.quad(rt[j], rb[j], rb[j + 1], rt[j + 1]);
  return g;
}

function buildScene(quality) {
  const draws = [], shadowDraws = [], lights = [];
  const detail = quality >= 2;

  const floor = new Mesh(buildPlane(90, detail ? 48 : 16, MAT.STONE, 26));
  draws.push({ mesh: floor, name: 'floor' });
  shadowDraws.push({ mesh: floor });

  const dais = new Mesh(buildDais(1.65, 0.075, detail ? 72 : 24, MAT.GRANITE));
  draws.push({ mesh: dais, name: 'dais' });
  shadowDraws.push({ mesh: dais });

  for (const m of [floor, dais]) m.setInstances([{ m: M4.create(), tint: [1, 1, 1, 0.3] }]);

  R.toriiTs = [];
  return { draws, shadowDraws, lights };
}
'''

# ---- the viewer -----------------------------------------------------------
VIEWER = r'''/* ==== e_char.js ==== */
/* =========================================================================
   VIEWER : boot, orbit camera, UI
   ========================================================================= */

const QUALITY = [
  { name: '低', scale: 0.62, shadow: 1024, mat: 512, ao: true, ssr: false, vol: true, taa: true, dof: false },
  { name: '中', scale: 0.82, shadow: 1536, mat: 512, ao: true, ssr: true, vol: true, taa: true, dof: true },
  { name: '高', scale: 1.00, shadow: 2048, mat: 1024, ao: true, ssr: true, vol: true, taa: true, dof: true },
];

function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 900);
}

function resize() {
  const q = QUALITY[R.quality];
  const dpr = Math.min(window.devicePixelRatio || 1, 2.0);
  const cw = R.canvas.clientWidth || window.innerWidth;
  const ch = R.canvas.clientHeight || window.innerHeight;
  const w = Math.max(320, Math.round(cw * dpr * q.scale * R.userScale));
  const h = Math.max(200, Math.round(ch * dpr * q.scale * R.userScale));
  R.canvas.width = Math.round(cw * dpr);
  R.canvas.height = Math.round(ch * dpr);
  if (w !== R.w || h !== R.h) allocTargets(w, h);
}

function applyQuality(qi, rebuildShadows) {
  R.quality = qi;
  const q = QUALITY[qi];
  CFG.ao = q.ao; CFG.ssr = q.ssr ? 1.0 : 0.0; CFG.volumetric = q.vol;
  CFG.taa = q.taa; CFG.dof = q.dof && CFG.dofUser;
  if (rebuildShadows) {
    for (const s of R.shadow) { gl.deleteTexture(s.tex); gl.deleteFramebuffer(s.fb); }
    R.shadow = [makeShadowRT(q.shadow), makeShadowRT(q.shadow), makeShadowRT(Math.max(1024, q.shadow >> 1))];
  }
  resize();
}

/* ---------------- orbit camera ----------------
   The character is the subject, so the camera goes round it rather than
   through it. Distance and target height are damped; a hard cut between
   framings makes it impossible to tell whether a change is in the model or
   in the shot.                                                             */
const ORB = {
  yaw: 0.24, pitch: -0.03,
  dist: 3.3, distT: 3.3,
  ty: 0.86, tyT: 0.86,
  spin: false, spinSpeed: 0.35
};

/* named framings. Heights are the character's own landmarks, so they stay
   correct when the model changes underneath them. */
const SHOTS = {
  full:  { dist: 3.30, ty: 0.86, fov: 30 },
  half:  { dist: 1.55, ty: 1.24, fov: 30 },
  face:  { dist: 0.50, ty: 1.575, fov: 30 },
  hand:  { dist: 0.46, ty: 0.80, fov: 30 },
  foot:  { dist: 0.60, ty: 0.16, fov: 32 },
  wide:  { dist: 5.60, ty: 0.90, fov: 34 }
};
function shot(k, yaw) {
  const s = SHOTS[k]; if (!s) return;
  ORB.distT = s.dist; ORB.tyT = s.ty;
  CAM.fovTarget = s.fov * PI / 180;
  if (yaw !== undefined) ORB.yaw = yaw;
  R.expoSnap = true; R.histValid = false;
}

function updateCamera(dt) {
  CAM.fov += (CAM.fovTarget - CAM.fov) * Math.min(1, dt * 11);
  if (ORB.spin) ORB.yaw += dt * ORB.spinSpeed;
  ORB.dist += (ORB.distT - ORB.dist) * Math.min(1, dt * 8);
  ORB.ty += (ORB.tyT - ORB.ty) * Math.min(1, dt * 8);
  ORB.pitch = clamp(ORB.pitch, -1.15, 1.15);

  const cp = Math.cos(ORB.pitch);
  CAM.pos = [Math.sin(ORB.yaw) * cp * ORB.dist,
             ORB.ty + Math.sin(ORB.pitch) * ORB.dist,
             Math.cos(ORB.yaw) * cp * ORB.dist];
  const dir = norm(sub([0, ORB.ty, 0], CAM.pos));
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
  if (CFG.dof) CFG.focusDist += (ORB.dist - CFG.focusDist) * Math.min(1, dt * 3);
}

/* ---------------- part visibility ----------------
   Stripping the costume off is the only way to judge the body, and hiding
   the hair is the only way to judge the skull. The draw lists are rebuilt
   from a master copy rather than flagged, so nothing in the renderer has to
   learn about visibility. */
const GROUPS = {
  clothes: ['top', 'sleeve', 'hakama', 'obi'],
  hair: ['hair'],
  ears: ['ear', 'earIn'],
  tail: ['tail0', 'tail1', 'tail2', 'tail3']
};
const HIDDEN = {};
function setGroup(name, on) {
  HIDDEN[name] = !on;
  const dead = new Set();
  for (const k in HIDDEN) if (HIDDEN[k]) for (const p of GROUPS[k]) dead.add('kit_' + p);
  const live = R.kitDraws.filter(d => !dead.has(d.name));
  R.scene.draws.length = 0;
  R.scene.draws.push(...R.baseDraws, ...live);
  R.scene.shadowDraws.length = 0;
  R.scene.shadowDraws.push(...R.shadowBase);
  for (const d of live) R.scene.shadowDraws.push({ mesh: d.mesh, zMax: d.zMax });
  R.histValid = false;
}

/* ---------------- sun controls ---------------- */
function setHour(v, snap) {
  CFG.hourTarget = ((v % 24) + 24) % 24;
  const el = document.getElementById('hour');
  if (el && snap) el.value = CFG.hourTarget;
}
function setSekki(v, snap) {
  CFG.sekkiTarget = ((Math.round(v) % 24) + 24) % 24;
  const el = document.getElementById('sekki');
  if (el && snap) el.value = CFG.sekkiTarget;
}
function refreshLiveReadout() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('a_el', (CFG.sunElev * 180 / PI).toFixed(1) + '°');
  set('a_az', worldToBearing(R.sunDir).toFixed(0) + '°');
  set('a_hm', fmtHM(CFG.hour));
  set('a_sk', SEKKI[Math.round(CFG.sekki) % 24]);
}
function refreshHUD() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('a_tri', (R.triCount || 0).toLocaleString());
  set('a_cam', ORB.dist.toFixed(2) + ' m');
}

/* ---------------- input ---------------- */
function setupInput() {
  const c = R.canvas;
  let drag = null;
  const pos = e => ({ x: e.touches ? e.touches[0].clientX : e.clientX,
                      y: e.touches ? e.touches[0].clientY : e.clientY });
  const down = e => { drag = pos(e); };
  const move = e => {
    if (!drag) return;
    const p = pos(e);
    ORB.yaw -= (p.x - drag.x) * 0.006;
    ORB.pitch += (p.y - drag.y) * 0.005;
    drag = p;
    if (e.touches) e.preventDefault();
  };
  const up = () => { drag = null; };
  c.addEventListener('mousedown', down);
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
  c.addEventListener('touchstart', down, { passive: true });
  c.addEventListener('touchmove', move, { passive: false });
  addEventListener('touchend', up);
  c.addEventListener('wheel', e => {
    e.preventDefault();
    ORB.distT = clamp(ORB.distT * Math.exp(e.deltaY * 0.0012), 0.28, 14);
  }, { passive: false });

  addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    KEYS[k] = true;
    if (k === '1') shot('full');
    if (k === '2') shot('half');
    if (k === '3') shot('face');
    if (k === '4') shot('hand');
    if (k === '5') shot('foot');
    if (k === '6') shot('wide');
    if (k === 'f') shot(null, ORB.yaw = 0);
    if (k === 'g') ORB.yaw = PI;
    if (k === 'r') { ORB.spin = !ORB.spin; syncUI(); }
    if (k === 'h') { CFG.showUI = !CFG.showUI; document.getElementById('ui').style.display = CFG.showUI ? '' : 'none'; }
    if (k === ' ') e.preventDefault();
  });
  addEventListener('keyup', e => { KEYS[e.key.toLowerCase()] = false; });
}

/* ---------------- UI ---------------- */
function bindSlider(id, get, set, fmt) {
  const el = document.getElementById(id); if (!el) return;
  const out = document.getElementById(id + '_v');
  const sync = () => { if (out) out.textContent = fmt ? fmt(+el.value) : el.value; };
  el.value = get();
  sync();
  el.addEventListener('input', () => { set(+el.value); sync(); });
}
function bindToggle(id, get, set) {
  const el = document.getElementById(id); if (!el) return;
  el.checked = get();
  el.addEventListener('change', () => set(el.checked));
}
function syncUI() {
  const el = document.getElementById('spin'); if (el) el.checked = ORB.spin;
}
function setupUI() {
  bindSlider('sekki', () => CFG.sekkiTarget, v => setSekki(v, false), v => SEKKI[Math.round(v) % 24]);
  bindSlider('hour', () => CFG.hourTarget, v => setHour(v, false), fmtHM);
  bindSlider('expo', () => CFG.exposure, v => CFG.exposure = v,
    v => (v >= 1 ? '+' : '') + ((v - 1) * 100).toFixed(0) + '%');
  bindSlider('fovs', () => CAM.fovTarget * 57.3, v => CAM.fovTarget = v / 57.3, v => v.toFixed(0) + '°');
  bindSlider('rscale', () => 1.0, v => { R.userScale = v; resize(); }, v => (v * 100).toFixed(0) + '%');
  bindToggle('spin', () => ORB.spin, v => ORB.spin = v);
  bindToggle('g_cloth', () => true, v => setGroup('clothes', v));
  bindToggle('g_hair', () => true, v => setGroup('hair', v));
  bindToggle('g_ears', () => true, v => setGroup('ears', v));
  bindToggle('g_tail', () => true, v => setGroup('tail', v));
  bindToggle('dof', () => CFG.dof, v => { CFG.dofUser = v; CFG.dof = v && QUALITY[R.quality].dof; });
  const q = document.getElementById('qual');
  if (q) { q.value = R.quality; q.addEventListener('change', () => applyQuality(+q.value, true)); }
  for (const b of document.querySelectorAll('[data-shot]'))
    b.addEventListener('click', () => shot(b.dataset.shot));
  for (const b of document.querySelectorAll('[data-yaw]'))
    b.addEventListener('click', () => { ORB.yaw = +b.dataset.yaw * PI / 180; R.histValid = false; });
}

/* ---------------- boot ---------------- */
async function boot() {
  const canvas = document.getElementById('gl');
  R.canvas = canvas;
  R.userScale = 1.0;
  CFG.dofUser = true;
  gl = canvas.getContext('webgl2', {
    antialias: false, depth: true, stencil: false, alpha: false,
    powerPreference: 'high-performance', preserveDrawingBuffer: true
  });
  if (!gl) { document.getElementById('err').style.display = 'block'; return; }
  if (!gl.getExtension('EXT_color_buffer_float')) {
    document.getElementById('err').textContent = 'このデバイスは EXT_color_buffer_float に対応していません。';
    document.getElementById('err').style.display = 'block'; return;
  }
  gl.getExtension('OES_texture_float_linear');
  gl.getExtension('EXT_float_blend');

  const status = document.getElementById('status');
  const step = async (msg, fn) => { status.textContent = msg; await new Promise(r => setTimeout(r, 12)); fn(); };

  const QS = new URLSearchParams(location.search);
  R.quality = QS.has('q') ? clamp(parseInt(QS.get('q')), 0, 2) : (isMobile() ? 1 : 2);
  const q = Object.assign({}, QUALITY[R.quality]);
  if (QS.has('mat')) q.mat = parseInt(QS.get('mat'));
  if (QS.has('shadow')) q.shadow = parseInt(QS.get('shadow'));
  R.sceneDetail = QS.has('sd') ? parseInt(QS.get('sd')) : 2;

  fullscreenInit();
  await step('シェーダをコンパイル中…', () => initPrograms());
  await step('質感をベイク中…', () => {
    bakeMaterials(q.mat);
    // no decals in the studio, but the g-buffer pass still binds the slot
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    R.decalTex = t;
  });
  await step('空と環境光を計算中…', () => {
    R.skyCube = makeCube(256, 7);
    R.irrCube = makeCube(32, 1);
    R.prefCube = makeCube(128, 6);
    R.shadow = [makeShadowRT(q.shadow), makeShadowRT(q.shadow), makeShadowRT(Math.max(1024, q.shadow >> 1))];
    R.cascadeVP = [M4.create(), M4.create(), M4.create()];
    R.meter = [makeRT(1, 1, { format: 'rgba16f' }), makeRT(1, 1, { format: 'rgba16f' })];
    R.expoTex = R.meter[1].tex;
    updateSun(0);
  });
  await step('床を敷いています…', () => { R.scene = buildScene(R.sceneDetail); });
  await step('狐人を彫っています…', () => {
    initKitsune(R.sceneDetail >= 1);
    placeKitsune(0, 0.075, 0, 0);
    R.kitDraws = R.scene.draws.filter(d => d.name && d.name.startsWith('kit_'));
    R.baseDraws = R.scene.draws.filter(d => !(d.name && d.name.startsWith('kit_')));
    const kitMesh = new Set(R.kitDraws.map(d => d.mesh));
    R.shadowBase = R.scene.shadowDraws.filter(d => !kitMesh.has(d.mesh));
    let t = 0;
    for (const k in KIT.mesh) t += KIT.mesh[k].count / 3;
    R.triCount = Math.round(t);
  });
  await step('準備完了', () => {
    applyQuality(R.quality, false);
    resize();
    bakeSky();
    setSekki(15, true); CFG.sekki = 15;
    setHour(11.0, true); CFG.hour = 11.0;
    updateSun(0);
    R.expoSnap = true;
  });

  document.getElementById('loading').style.opacity = '0';
  setTimeout(() => document.getElementById('loading').style.display = 'none', 700);

  addEventListener('resize', resize);
  setupInput();
  setupUI();
  if (QS.get('ui') === '0') { document.getElementById('ui').style.display = 'none'; CFG.showUI = false; }

  let last = performance.now(), acc = 0, frames = 0;
  function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.06);
    last = now;
    R.time += dt;
    acc += dt; frames++;
    if (acc > 0.5) {
      const el = document.getElementById('fps');
      if (el) el.textContent = Math.round(frames / acc) + ' fps';
      acc = 0; frames = 0;
    }
    updateSun(dt);
    updateCamera(dt);
    if (R.frame % 6 === 0) refreshHUD();
    renderFrame(dt);
    R.frame++;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.__exposure = function () {
    if (!R.expoTex || !R.meter) return null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, R.meter[R.meterIdx ^ 1].fb);
    gl.readBuffer(gl.COLOR_ATTACHMENT0);
    const b = new Float32Array(4);
    try { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, b); }
    catch (e) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); return null; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { e: b[0], L: b[1] };
  };
  window.__DBG = { CFG, R, CAM, ORB, QUALITY, updateSun, sunENU, shot, setGroup,
                   KIT, JOINTS, poseKitsune, placeKitsune, resize };
  window.__ready = true;
}
addEventListener('load', boot);
'''

# ---- page shell -----------------------------------------------------------
SHELL_HEAD = '''<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover">
<title>狐人 — キャラクタービューア</title>
<style>
  *{box-sizing:border-box}
  html,body{margin:0;height:100%;background:#0a0c10;overflow:hidden;
    font:13px/1.5 -apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",system-ui,sans-serif;
    color:#e6e9ef;-webkit-text-size-adjust:100%}
  #gl{position:fixed;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}
  #gl:active{cursor:grabbing}
  #ui{position:fixed;inset:0;pointer-events:none}
  #panel{position:absolute;top:12px;left:12px;width:264px;max-height:calc(100% - 24px);
    overflow-y:auto;pointer-events:auto;background:rgba(12,15,21,.82);
    -webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);
    border:1px solid rgba(255,255,255,.09);border-radius:12px;padding:12px 13px 14px}
  h1{font-size:13px;margin:0 0 2px;letter-spacing:.10em;font-weight:600}
  .sub{font-size:10.5px;color:#8b95a6;margin:0 0 11px;letter-spacing:.04em}
  fieldset{border:0;border-top:1px solid rgba(255,255,255,.08);margin:11px 0 0;padding:9px 0 0}
  legend{font-size:10px;color:#7f8a9c;letter-spacing:.14em;padding:0 5px 0 0}
  .row{display:flex;align-items:center;gap:8px;margin:6px 0}
  .row label{flex:0 0 52px;font-size:11px;color:#a6b0c0}
  .row .v{flex:0 0 56px;text-align:right;font-variant-numeric:tabular-nums;font-size:11px;color:#cfd6e2}
  input[type=range]{flex:1;min-width:0;height:16px;-webkit-appearance:none;background:transparent}
  input[type=range]::-webkit-slider-runnable-track{height:3px;border-radius:2px;background:rgba(255,255,255,.16)}
  input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:13px;height:13px;margin-top:-5px;
    border-radius:50%;background:#e6e9ef;border:0}
  input[type=range]::-moz-range-track{height:3px;border-radius:2px;background:rgba(255,255,255,.16)}
  input[type=range]::-moz-range-thumb{width:13px;height:13px;border:0;border-radius:50%;background:#e6e9ef}
  .btns{display:flex;flex-wrap:wrap;gap:5px;margin-top:4px}
  button,select{font:inherit;font-size:11px;color:#dfe4ec;background:rgba(255,255,255,.07);
    border:1px solid rgba(255,255,255,.12);border-radius:7px;padding:4px 9px;cursor:pointer}
  button:hover{background:rgba(255,255,255,.14)}
  .chk{display:flex;align-items:center;gap:6px;font-size:11px;color:#a6b0c0;margin:5px 0}
  .chk input{accent-color:#c9d3e4}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}
  #stat{position:absolute;top:12px;right:12px;pointer-events:none;text-align:right;
    font-variant-numeric:tabular-nums;font-size:11px;color:#93a0b3;line-height:1.7;
    background:rgba(12,15,21,.62);border-radius:9px;padding:7px 11px;
    border:1px solid rgba(255,255,255,.07)}
  #stat b{color:#e6e9ef;font-weight:600}
  #hint{position:absolute;left:0;right:0;bottom:12px;text-align:center;font-size:10.5px;
    color:#6f7b8d;pointer-events:none}
  #loading{position:fixed;inset:0;background:#0a0c10;display:flex;flex-direction:column;
    align-items:center;justify-content:center;gap:12px;transition:opacity .6s;z-index:9}
  #loading .k{font-size:22px;letter-spacing:.34em;color:#d8dee9}
  #status{font-size:11px;color:#79839a;letter-spacing:.06em}
  #err{position:fixed;inset:0;display:none;align-items:center;justify-content:center;
    background:#0a0c10;color:#e6e9ef;padding:24px;text-align:center;z-index:10}
  @media(max-width:560px){#panel{width:calc(100% - 24px)}}
</style>
</head>
<body>
<canvas id="gl"></canvas>
<div id="ui">
  <div id="panel">
    <h1>狐人 — キャラクタービューア</h1>
    <p class="sub">神社は組み込まず、造形だけを見るための版</p>

    <fieldset><legend>ショット</legend>
      <div class="btns">
        <button data-shot="full">全身</button>
        <button data-shot="half">上半身</button>
        <button data-shot="face">顔</button>
        <button data-shot="hand">手</button>
        <button data-shot="foot">足</button>
        <button data-shot="wide">引き</button>
      </div>
      <div class="btns" style="margin-top:6px">
        <button data-yaw="0">正面</button>
        <button data-yaw="45">斜め</button>
        <button data-yaw="90">真横</button>
        <button data-yaw="180">背面</button>
      </div>
      <div class="chk"><input type="checkbox" id="spin"><label for="spin">ターンテーブル（R）</label></div>
      <div class="row"><label>画角</label><input type="range" id="fovs" min="14" max="60" step="1"><span class="v" id="fovs_v"></span></div>
    </fieldset>

    <fieldset><legend>表示</legend>
      <div class="grid2">
        <div class="chk"><input type="checkbox" id="g_cloth" checked><label for="g_cloth">衣装</label></div>
        <div class="chk"><input type="checkbox" id="g_hair" checked><label for="g_hair">髪</label></div>
        <div class="chk"><input type="checkbox" id="g_ears" checked><label for="g_ears">耳</label></div>
        <div class="chk"><input type="checkbox" id="g_tail" checked><label for="g_tail">尾</label></div>
      </div>
    </fieldset>

    <fieldset><legend>光</legend>
      <div class="row"><label>時刻</label><input type="range" id="hour" min="0" max="24" step="0.02"><span class="v" id="hour_v"></span></div>
      <div class="row"><label>節気</label><input type="range" id="sekki" min="0" max="23" step="1"><span class="v" id="sekki_v"></span></div>
      <div class="row"><label>露出</label><input type="range" id="expo" min="0.4" max="2.4" step="0.01"><span class="v" id="expo_v"></span></div>
    </fieldset>

    <fieldset><legend>描画</legend>
      <div class="row"><label>解像度</label><input type="range" id="rscale" min="0.5" max="1.6" step="0.05"><span class="v" id="rscale_v"></span></div>
      <div class="chk"><input type="checkbox" id="dof" checked><label for="dof">被写界深度</label></div>
      <div class="btns"><select id="qual"><option value="0">低</option><option value="1">中</option><option value="2">高</option></select></div>
    </fieldset>
  </div>

  <div id="stat">
    <div><b id="fps">—</b></div>
    <div>三角形 <b id="a_tri">—</b></div>
    <div>距離 <b id="a_cam">—</b></div>
    <div><b id="a_hm">—</b> / <b id="a_sk">—</b></div>
    <div>高度 <b id="a_el">—</b> 方位 <b id="a_az">—</b></div>
  </div>
  <div id="hint">ドラッグで回転 / ホイールで寄り引き / 1–6 ショット / R ターンテーブル / H パネル</div>
</div>
<div id="loading"><div class="k">狐人</div><div id="status">初期化中…</div></div>
<div id="err">お使いのブラウザは WebGL2 に対応していません。</div>
<script>
'''

SHELL_TAIL = '''</script>
</body>
</html>
'''

out = (SHELL_HEAD
       + core + shA + shB + STUDIO + astro + render + kitsune + VIEWER
       + SHELL_TAIL)

io.open(DST, 'w', encoding='utf-8').write(out)
print('wrote %s  (%.0f KB)' % (DST, len(out) / 1024))
