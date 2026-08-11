#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""shrineplay.html を hiyorimi.html から生成する。

    python3 game/build_shrineplay.py

伏見稲荷のワールドはそのまま、視点を三人称にして、リグ済みの .glb を
ドロップするとそのキャラクターを操作できるようにしたもの。

hiyorimi.html には手を入れず、生成時に差し込む：
  * 頂点シェーダに GPU スキニング（ボーン行列は1行の RGBA32F テクスチャ）
  * glTF (.glb) の読み込みと再生
  * 三人称カメラと、速度からクリップを選ぶ状態遷移

モデルは同梱しない。開いた人が自分の .glb を落とす。
"""
import base64, io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'hiyorimi.html')
MODEL = sys.argv[1] if len(sys.argv) > 1 else None
DST = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    HERE, 'shrine_game.html' if MODEL else 'shrineplay.html')

src = io.open(SRC, encoding='utf-8').read()


def rep(a, b, n=1):
    global src
    assert src.count(a) == n, (src.count(a), a[:100])
    src = src.replace(a, b)


# ---------------------------------------------------------------------------
# 1. GPU スキニング : 頂点シェーダ2本に差し込む
# ---------------------------------------------------------------------------
SKIN_DECL = '''layout(location=9) in vec4 aBI;
layout(location=10) in vec4 aBW;
layout(location=11) in vec3 aBlink;
uniform int uSkin;
uniform float uBlink;
uniform sampler2D uBones;
/* 4テクセルで1つのボーン行列（列ベクトル4本） */
/* 行がインスタンス。1回の描画で、全員べつべつの姿勢を取れる。 */
mat4 boneAt(float f, int row){
  int k = int(f)*4;
  return mat4(texelFetch(uBones, ivec2(k,   row), 0), texelFetch(uBones, ivec2(k+1, row), 0),
              texelFetch(uBones, ivec2(k+2, row), 0), texelFetch(uBones, ivec2(k+3, row), 0));
}
'''
SKIN_BODY = '''  vec3 sPos = aPos; vec3 sNrm = aNrm;
  /* まばたきだけは頂点属性で持つ。これを CPU 側のモーフでやると、影響
     頂点の**番号**がメッシュ全体に散っているせいで（35,069/44,838）、
     まばたきのたびに頂点バッファを丸ごと上げ直すことになる。 */
  if(uBlink > 0.0) sPos += aBlink*uBlink;
  if(uSkin==1){
    int row = uInstanced==1 ? gl_InstanceID : 0;
    mat4 S = boneAt(aBI.x,row)*aBW.x + boneAt(aBI.y,row)*aBW.y
           + boneAt(aBI.z,row)*aBW.z + boneAt(aBI.w,row)*aBW.w;
    sPos = (S*vec4(aPos,1.0)).xyz;
    sNrm = mat3(S)*aNrm;
  }
'''

for _vs in ('VS_GBUF', 'VS_SHADOW'):
    i0 = src.index('const %s = `' % _vs)
    i1 = src.index('`;', i0)
    blk = src[i0:i1]
    # aPos/aNrm の**読み出し**を先に名前替えする。SKIN_BODY 自身が aPos を
    # 読むので、後から置換すると sPos を sPos で定義することになる。
    blk = blk.replace('aPos', 'sPos').replace('aNrm', 'sNrm')
    blk = blk.replace('in vec3 sPos;', 'in vec3 aPos;').replace('in vec3 sNrm;', 'in vec3 aNrm;')
    blk = blk.replace('void main(){', SKIN_DECL + 'void main(){')
    blk = blk.replace('  mat4 M = uInstanced==1 ? aInst : uModel;',
                      SKIN_BODY + '  mat4 M = uInstanced==1 ? aInst : uModel;')
    src = src[:i0] + blk + src[i1:]

rep("    u1f(prog, 'uWind', d.wind || 0);",
    "    u1f(prog, 'uWind', d.wind || 0);\n"
    "    u1i(prog, 'uSkin', d.skin ? 1 : 0);\n"
    "    if (d.skin) tex(prog, 'uBones', 6, d.skin, gl.TEXTURE_2D);\n"
    "    u1f(prog, 'uBlink', d.blink || 0);")

# ---------------------------------------------------------------------------
# 2. 三人称カメラのフック
# ---------------------------------------------------------------------------
rep("""  CAM.pitch = clamp(CAM.pitch, -1.25, 1.25);

  const dir = [Math.sin(CAM.yaw) * Math.cos(CAM.pitch), Math.sin(CAM.pitch), -Math.cos(CAM.yaw) * Math.cos(CAM.pitch)];
  M4.copy(CAM.prevViewProj, CAM.viewProj);""",
"""  CAM.pitch = clamp(CAM.pitch, -1.25, 1.25);

  const dir = [Math.sin(CAM.yaw) * Math.cos(CAM.pitch), Math.sin(CAM.pitch), -Math.cos(CAM.yaw) * Math.cos(CAM.pitch)];
  if (PLAY.ready) thirdPerson(dt, dir);
  M4.copy(CAM.prevViewProj, CAM.viewProj);""")

rep("    updateKyonshi(dt);", "    updateKyonshi(dt);\n    updatePlayer(dt);")

# 参道を伸ばす（210m -> 520m、標高差 +28m）。鳥居・灯籠・木立・下草はすべて
# PATH_LEN を見て並ぶので、ここ1行で全部が伸びる。描画は CAM.t±78 で間引かれる。
rep('const PATH_LEN = 210;', 'const PATH_LEN = 520;')

# 観光地なので、キョンシーは出さない
rep('  const spots = [[34, -0.9], [52, 1.0], [70, -0.6], [88, 0.8], [106, -1.0], [124, 0.7], [142, -0.5]];',
    '  const spots = [];        // 参拝客だけの世界にする')

# 移動の計算は**プレイヤーの位置**に対して行う。三人称でカメラを後ろへ
# 引いたあと、その位置をそのまま次のフレームの入力にしてはいけない。
rep("function updateCamera(dt) {",
    "function updateCamera(dt) {\n"
    "  /* 前のフレームで CAM.pos はカメラ位置に書き換わっている。移動も接地も\n"
    "     プレイヤーに対して行うものなので、先に戻す。これを忘れると、毎フレーム\n"
    "     カメラの後退ぶん（3.1m）と目線の高さのぶんが位置に足し込まれ続けて、\n"
    "     世界の下へ抜けていく（地面が消えて空中浮遊に見えた原因）。 */\n"
    "  if (PLAY.ready && PLAY.eye) { CAM.pos[0] = PLAY.eye[0]; CAM.pos[1] = PLAY.eye[1]; CAM.pos[2] = PLAY.eye[2]; }")

# ---------------------------------------------------------------------------
# 3. UI
# ---------------------------------------------------------------------------
rep('<div id="joy"><div id="joyknob"></div></div>',
    '''<div id="joy"><div id="joyknob"></div></div>
<div id="pdrop">
  <div class="big">リグ済みの .glb を、ここに落としてください</div>
  <div class="sm">blender_autorig.py が書き出したものがそのまま使えます。<br>
    idle / walk / run / jump が入っていれば、速度に応じて勝手に切り替わります。<br>
    落とさなくても一人称のまま歩けます（Esc でこの案内を消す）。</div>
  <label class="pf" for="pfile">ファイルを選ぶ</label>
  <input id="pfile" type="file">
</div>''')

rep('#joy{position:fixed;width:110px;height:110px;border-radius:50%;border:1.5px solid rgba(255,255,255,.16);',
    '''#pdrop{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;
    justify-content:center;gap:14px;text-align:center;padding:24px;z-index:8;
    background:rgba(6,8,12,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    font:13px/1.9 -apple-system,"Hiragino Kaku Gothic ProN","Noto Sans JP",system-ui,sans-serif;color:#e6e9ef}
  #pdrop .big{font-size:18px;letter-spacing:.05em}
  #pdrop .sm{font-size:12px;color:#98a2b3;max-width:32em}
  label.pf{font-size:13px;padding:9px 20px;border-radius:9px;cursor:pointer;
    color:#dfe4ec;background:rgba(255,255,255,.09);border:1px solid rgba(255,255,255,.14)}
  label.pf:hover{background:rgba(255,255,255,.17)}
  #pfile{position:absolute;width:1px;height:1px;opacity:0;pointer-events:none}
  body.pdrag #pdrop{background:rgba(40,80,140,.5)}
  #joy{position:fixed;width:110px;height:110px;border-radius:50%;border:1.5px solid rgba(255,255,255,.16);''')

# ---------------------------------------------------------------------------
# 4. 本体
# ---------------------------------------------------------------------------
PLAYER = r'''
/* ==== g_glb.js ==== */
/* =========================================================================
   glTF (.glb) の読み込みと再生、そして三人称の操作

   blender_autorig.py が書き出したものを、そのままこの世界に持ち込む。
   スキニングは頂点シェーダ、ポーズは1行の RGBA32F テクスチャで渡す。
   ========================================================================= */

/* テクスチャの無いモデルなので、粘土に近い色で置く。
   MAT.SKIN は本編のキャラクター用で、影がほとんど落ちないアニメ調の陰影が
   掛かる。参道に立たせると周囲から浮いて白いシルエットになったので、
   普通の PBR で塗られる MAT.LINEN にした。 */
const PLAY_TINT = [0.62, 0.58, 0.55, 0.30];
const GLB_CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
                 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const GLB_NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function parseGLB(buf) {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546C67) throw new Error('glb ではありません');
  let off = 12, json = null, bin = null;
  while (off + 8 <= dv.byteLength) {
    const len = dv.getUint32(off, true), type = dv.getUint32(off + 4, true);
    if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, off + 8, len)));
    else if (type === 0x004E4942) bin = { buf: buf, off: off + 8, len: len };
    off += 8 + len;
  }
  if (!json) throw new Error('JSON チャンクがありません');
  return { json, bin };
}

/* アクセサを素の配列で読む。byteStride を持つものがあるので、詰まっている
   前提で一気に new TypedArray するわけにはいかない。 */
function glbAcc(G, idx) {
  const a = G.json.accessors[idx];
  const n = GLB_NC[a.type], TA = GLB_CT[a.componentType];
  const out = new TA(a.count * n);
  if (a.bufferView !== undefined) {
    const bv = G.json.bufferViews[a.bufferView];
    const packed = n * TA.BYTES_PER_ELEMENT;
    const stride = bv.byteStride || packed;
    const base = G.bin.off + (bv.byteOffset || 0) + (a.byteOffset || 0);
    if (stride === packed) {
      out.set(new TA(G.bin.buf, base, a.count * n));
    } else {
      for (let k = 0; k < a.count; k++) out.set(new TA(G.bin.buf, base + k * stride, n), k * n);
    }
  }
  if (a.sparse) {                       // モーフターゲットはたいてい疎で入る
    const s = a.sparse;
    const ivb = G.json.bufferViews[s.indices.bufferView];
    const IT = GLB_CT[s.indices.componentType];
    const ind = new IT(G.bin.buf, G.bin.off + (ivb.byteOffset || 0) + (s.indices.byteOffset || 0), s.count);
    const vvb = G.json.bufferViews[s.values.bufferView];
    const val = new TA(G.bin.buf, G.bin.off + (vvb.byteOffset || 0) + (s.values.byteOffset || 0), s.count * n);
    for (let k = 0; k < s.count; k++)
      for (let c = 0; c < n; c++) out[ind[k] * n + c] = val[k * n + c];
  }
  return out;
}

/* 正規化整数で入っているウェイトを float に開く */
function glbNorm(arr, ct) {
  if (ct === 5126) return arr;
  const d = ct === 5121 ? 255 : ct === 5123 ? 65535 : ct === 5120 ? 127 : 32767;
  const o = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) o[i] = Math.max(arr[i] / d, 0);
  return o;
}

function nodeTRS(nd) {
  return {
    t: nd.translation ? nd.translation.slice() : [0, 0, 0],
    r: nd.rotation ? nd.rotation.slice() : [0, 0, 0, 1],
    s: nd.scale ? nd.scale.slice() : [1, 1, 1]
  };
}

function trsMat(out, t, r, s) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  out[0] = (1 - (yy + zz)) * s[0]; out[1] = (xy + wz) * s[0]; out[2] = (xz - wy) * s[0]; out[3] = 0;
  out[4] = (xy - wz) * s[1]; out[5] = (1 - (xx + zz)) * s[1]; out[6] = (yz + wx) * s[1]; out[7] = 0;
  out[8] = (xz + wy) * s[2]; out[9] = (yz - wx) * s[2]; out[10] = (1 - (xx + yy)) * s[2]; out[11] = 0;
  out[12] = t[0]; out[13] = t[1]; out[14] = t[2]; out[15] = 1;
  return out;
}

function qslerp(o, a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let s = 1;
  if (d < 0) { d = -d; s = -1; }
  let ka, kb;
  if (d > 0.9995) { ka = 1 - t; kb = t * s; }
  else {
    const th = Math.acos(d), st = Math.sin(th);
    ka = Math.sin((1 - t) * th) / st; kb = s * Math.sin(t * th) / st;
  }
  for (let i = 0; i < 4; i++) o[i] = a[i] * ka + b[i] * kb;
  const l = Math.hypot(o[0], o[1], o[2], o[3]) || 1;
  for (let i = 0; i < 4; i++) o[i] /= l;
  return o;
}

const PLAY = {
  ready: false, mesh: null, boneTex: null, boneData: null,
  nodes: null, roots: null, skin: null, clips: null, morph: null,
  snap: null, fade: 0, fadeLen: 0.16, jumpY: 0,
  clip: 'idle', t: 0, yaw: 0, pos: [0, 0, 0], eye: null, vy: 0, air: false,
  scale: 1, blink: 0, blinkNext: 2.0, m: M4.create(), tmp: M4.create()
};

function loadGLB(buf, status) {
  status('読み込み中…');
  const G = parseGLB(buf);
  const J = G.json;
  const skin = J.skins && J.skins[0];
  if (!skin) throw new Error('スキン（ボーン）が入っていません');

  // --- メッシュ : スキンを持つノードのプリミティブを1つにまとめる ---
  let meshIdx = -1;
  for (const nd of J.nodes) if (nd.skin !== undefined && nd.mesh !== undefined) meshIdx = nd.mesh;
  if (meshIdx < 0) meshIdx = 0;
  const prim = J.meshes[meshIdx].primitives[0];
  const A = prim.attributes;
  const pos = glbAcc(G, A.POSITION);
  const nrm = A.NORMAL !== undefined ? glbAcc(G, A.NORMAL) : null;
  const ji = glbAcc(G, A.JOINTS_0);
  const jwRaw = glbAcc(G, A.WEIGHTS_0);
  const jw = glbNorm(jwRaw, J.accessors[A.WEIGHTS_0].componentType);
  const idx = glbAcc(G, prim.indices);
  const NV = pos.length / 3;
  status('メッシュを構築中…（' + NV.toLocaleString() + ' 頂点）');

  /* cute は表情ではなく顔の寄せ＝静的な設定なので、読み込み時に一度だけ
     頂点に焼き込む。実行時のモーフに残すと、影響頂点が 29,063 / 44,838 に
     広がる（頭と髪ぜんぶ）ので、まばたきのたびに頂点バッファを丸ごと
     上げ直すことになり、GPU スキニングで消したはずのコストが戻ってくる。 */
  const tnames = (J.meshes[meshIdx].extras || {}).targetNames || [];
  const ci = tnames.indexOf('cute');
  if (ci >= 0 && prim.targets && prim.targets[ci]) {
    const w = CFG.cute === undefined ? 1.0 : CFG.cute;
    const d = glbAcc(G, prim.targets[ci].POSITION);
    for (let i = 0; i < NV * 3; i++) pos[i] += d[i] * w;
  }
  const g = new Geo();
  for (let i = 0; i < NV; i++)
    g.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2],
           nrm ? nrm[i * 3] : 0, nrm ? nrm[i * 3 + 1] : 1, nrm ? nrm[i * 3 + 2] : 0,
           0.5, 0.5, MAT.LINEN);
  for (let t = 0; t < idx.length; t += 3) g.tri(idx[t], idx[t + 1], idx[t + 2]);
  const mesh = new Mesh(g, { dynamic: true });
  mesh.setInstances([{ m: M4.create(), tint: PLAY_TINT }]);

  const bi = new Float32Array(NV * 4), bw = new Float32Array(NV * 4);
  for (let i = 0; i < NV * 4; i++) { bi[i] = ji[i]; bw[i] = jw[i]; }
  // まばたきの差分を頂点属性で持たせる（見つからなければゼロ）
  const bl = new Float32Array(NV * 3);
  {
    const k = tnames.indexOf('blink');
    if (k >= 0 && prim.targets && prim.targets[k]) bl.set(glbAcc(G, prim.targets[k].POSITION));
  }
  gl.bindVertexArray(mesh.vao);
  {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, bl, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(11);
    gl.vertexAttribPointer(11, 3, gl.FLOAT, false, 12, 0);
  }
  for (const [loc, data] of [[9, bi], [10, bw]]) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 16, 0);
  }
  gl.bindVertexArray(null);

  // --- 骨 ---
  const nodes = J.nodes.map(nd => {
    const o = nodeTRS(nd);
    return { trs: o, rest: nodeTRS(nd), kids: nd.children || [], world: M4.create() };
  });
  const child = new Set();
  for (const nd of J.nodes) for (const c of (nd.children || [])) child.add(c);
  const roots = [];
  for (let i = 0; i < J.nodes.length; i++) if (!child.has(i)) roots.push(i);
  const ibm = skin.inverseBindMatrices !== undefined ? glbAcc(G, skin.inverseBindMatrices) : null;
  const joints = skin.joints;
  const NB = joints.length;
  const ROWS = 1 + CROWD_DRAW;              // 0 行目が自分、あとは描いている人
  const boneTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, boneTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, NB * 4, ROWS, 0, gl.RGBA, gl.FLOAT, null);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
    gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
    gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);

  // --- アニメーション ---
  const clips = {};
  for (const an of (J.animations || [])) {
    const ch = [];
    for (const c of an.channels) {
      const sm = an.samplers[c.sampler];
      ch.push({ node: c.target.node, path: c.target.path,
                time: glbAcc(G, sm.input), val: glbAcc(G, sm.output),
                lerp: (sm.interpolation || 'LINEAR') });
    }
    let dur = 0;
    for (const c of ch) dur = Math.max(dur, c.time[c.time.length - 1]);
    clips[an.name || ('clip' + Object.keys(clips).length)] = { ch, dur: dur || 1 };
  }

  // --- モーフターゲット（表情）---
  let morph = null;
  const names = tnames.slice();
  if (prim.targets && prim.targets.length) {
    const bi2 = tnames.indexOf('blink');
    const keep = [];
    for (let k = 0; k < prim.targets.length; k++) if (k !== ci && k !== bi2) keep.push(k);
    const tg = keep.map(k => glbAcc(G, prim.targets[k].POSITION));
    names.length = 0;
    for (const k of keep) names.push(tnames[k] || ('m' + k));
    /* 範囲は**ターゲットごとに**持つ。全部の和で取ると、実際に動いている
       のがまばたきだけでも、笑顔や眉が触りうる範囲まで毎回書き戻すことに
       なる（13,731頂点）。まばたきの範囲だけなら桁が変わる。 */
    const rng = tg.map(d => {
      let a = NV, b = 0;
      for (let i = 0; i < NV; i++)
        if (d[i * 3] || d[i * 3 + 1] || d[i * 3 + 2]) { if (i < a) a = i; if (i > b) b = i; }
      return [a, b];
    });
    morph = { tg, names, rng, base: pos, w: new Float32Array(tg.length),
              live: new Uint8Array(tg.length), dirty: true };
    status('表情 ' + tg.length + ' 種');
  }

  // --- 足元の高さ : 静止姿勢のいちばん下 ---
  let ylo = 1e9, yhi = -1e9;
  for (let i = 0; i < NV; i++) { const y = pos[i * 3 + 1]; if (y < ylo) ylo = y; if (y > yhi) yhi = y; }

  Object.assign(PLAY, {
    snap: nodes.map(n => ({ t: n.trs.t.slice(), r: n.trs.r.slice(), s: n.trs.s.slice() })),
    ready: true, mesh, boneTex, rows: ROWS, NB,
    boneData: new Float32Array(NB * 16 * ROWS),
    nodes, roots, joints, ibm, clips, morph, NV, foot: ylo, top: yhi,
    scale: 1.0, names: Object.keys(clips)
  });
  const dr = { mesh, name: 'player', skin: boneTex, blink: 0 };
  PLAY.draw = dr;
  R.scene.draws.push(dr);
  R.scene.shadowDraws.push(dr);
  R.baseDraws && R.baseDraws.push(dr);
  R.shadowBase && R.shadowBase.push(dr);
  initCrowd();
  status('');
  return true;
}

function sampleClip(name, t, into) {
  const cl = PLAY.clips[name];
  if (!cl) return;
  const tt = cl.dur > 0 ? (t % cl.dur) : 0;
  for (const n of PLAY.nodes) { n.trs.t = n.rest.t.slice(); n.trs.r = n.rest.r.slice(); n.trs.s = n.rest.s.slice(); }
  for (const c of cl.ch) {
    const T = c.time, n = T.length;
    let i = 0;
    while (i < n - 1 && T[i + 1] < tt) i++;
    const j = Math.min(i + 1, n - 1);
    const span = Math.max(1e-6, T[j] - T[i]);
    const u = clamp((tt - T[i]) / span, 0, 1);
    const nd = PLAY.nodes[c.node];
    if (!nd) continue;
    if (c.path === 'rotation') {
      qslerp(nd.trs.r, c.val.subarray(i * 4, i * 4 + 4), c.val.subarray(j * 4, j * 4 + 4), u);
    } else {
      const dst = c.path === 'translation' ? nd.trs.t : c.path === 'scale' ? nd.trs.s : null;
      if (dst) for (let k = 0; k < 3; k++) dst[k] = lerp(c.val[i * 3 + k], c.val[j * 3 + k], u);
    }
  }
  if (into) for (let n = 0; n < PLAY.nodes.length; n++) {
    const s = PLAY.nodes[n].trs, d = into[n];
    d.t = s.t.slice(); d.r = s.r.slice(); d.s = s.s.slice();
  }
}

/* クリップの切り替えは瞬時だと足の入れ替わりが跳ねる。前のクリップを
   止めた瞬間の姿勢を覚えておいて、0.16秒かけて混ぜる。 */
function poseBlended(dt) {
  if (PLAY.fade > 0) {
    PLAY.fade -= dt;
    const u = 1 - clamp(PLAY.fade / PLAY.fadeLen, 0, 1);
    sampleClip(PLAY.clip, PLAY.t);
    for (let n = 0; n < PLAY.nodes.length; n++) {
      const cur = PLAY.nodes[n].trs, old = PLAY.snap[n];
      qslerp(cur.r, old.r, cur.r, u);
      for (let k = 0; k < 3; k++) {
        cur.t[k] = lerp(old.t[k], cur.t[k], u);
        cur.s[k] = lerp(old.s[k], cur.s[k], u);
      }
    }
  } else {
    sampleClip(PLAY.clip, PLAY.t);
  }
}

function solveSkeleton(row) {
  const tmp = PLAY.tmp;
  const walk = (ni, parent) => {
    const nd = PLAY.nodes[ni];
    trsMat(tmp, nd.trs.t, nd.trs.r, nd.trs.s);
    if (parent) M4.mul(nd.world, parent, tmp); else M4.copy(nd.world, tmp);
    for (const c of nd.kids) walk(c, nd.world);
  };
  for (const r of PLAY.roots) walk(r, null);
  const bd = PLAY.boneData, ib = PLAY.ibm, m = M4.create();
  const base = (row || 0) * PLAY.NB * 16;
  for (let i = 0; i < PLAY.joints.length; i++) {
    const w = PLAY.nodes[PLAY.joints[i]].world;
    if (ib) { m.set(ib.subarray(i * 16, i * 16 + 16)); M4.mul(m, w, m); }
    else M4.copy(m, w);
    bd.set(m, base + i * 16);
  }
}

function uploadBones() {
  gl.bindTexture(gl.TEXTURE_2D, PLAY.boneTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, PLAY.NB * 4, PLAY.rows, gl.RGBA, gl.FLOAT, PLAY.boneData);
}

/* ---------------- 参拝客 ----------------
   同じメッシュ・同じ骨で、行だけ変えて全員ぶんの姿勢を持つ。描画は1回。
   骨を解く相手は近い順に絞る — 見えないところで解いても仕方がない。 */
const CROWD_N = 44;         // 参道に散っている人数
const CROWD_DRAW = 12;      // そのうち実際に描く人数（近い順）
const CROWD_FAR = 46;       // これより遠い人は描かない（m）
const CROWD = { list: [], inst: [], drawn: 0 };

function initCrowd() {
  const rn = mulberry32(20260811);
  CROWD.list.length = 0;
  for (let i = 0; i < CROWD_N; i++) {
    const up = rn() < 0.55;
    CROWD.list.push({
      t: 6 + rn() * (PATH_LEN - 12),
      side: (rn() < 0.5 ? -1 : 1) * (0.5 + rn() * 1.5),
      spd: (up ? 1 : -1) * (0.75 + rn() * 0.85),
      ph: rn() * 4, scale: 0.93 + rn() * 0.13,
      tint: [0.52 + rn() * 0.22, 0.48 + rn() * 0.20, 0.46 + rn() * 0.20, 0.3],
      pause: rn() * 14, d2: 0, moving: true, m: M4.create(), yaw: 0
    });
  }
}

function updateCrowd(dt) {
  const order = [];
  for (let i = 0; i < CROWD.list.length; i++) {
    const c = CROWD.list[i];
    c.pause -= dt;                       // ときどき立ち止まって鳥居を見る
    const moving = c.pause < 0 || c.pause > 3.0;
    if (moving) {
      c.t += c.spd * dt;
      if (c.t > PATH_LEN - 4) { c.t = PATH_LEN - 4; c.spd = -Math.abs(c.spd); }
      if (c.t < 4) { c.t = 4; c.spd = Math.abs(c.spd); }
    }
    if (c.pause < -6) c.pause = 6 + Math.random() * 16;
    const P = pathPos(c.t), Rt = pathRight(c.t), T = pathTan(c.t);
    const x = P[0] + Rt[0] * c.side, z = P[2] + Rt[2] * c.side;
    const gy = WORLD.groundAt(x, z).y;
    const sg = c.spd < 0 ? -1 : 1;
    c.yaw = Math.atan2(T[0] * sg, T[2] * sg);
    M4.compose(c.m, [x, gy, z], c.yaw, [c.scale, c.scale, c.scale]);
    c.moving = moving;
    c.d2 = (x - PLAY.pos[0]) * (x - PLAY.pos[0]) + (z - PLAY.pos[2]) * (z - PLAY.pos[2]);
    order.push(i);
  }
  /* ---- ここが一番の負荷 ----
     このモデルは 62,824 三角形ある。44人ぜんぶ描くと 1フレーム 280万三角形、
     影を3枚焼くとその4倍になる。参道は鳥居で仕切られていて、そもそも先の
     ほうは見えない。近い順に CROWD_DRAW 人だけ描き、遠い人は**描画にも
     出さない**（インスタンスの配列に入れない）。骨を解くのも同じ人だけ。 */
  order.sort((a, b) => CROWD.list[a].d2 - CROWD.list[b].d2);
  CROWD.inst.length = 0;
  CROWD.inst.push({ m: PLAY.m, tint: PLAY_TINT });
  let row = 1;
  for (let k = 0; k < order.length && row <= CROWD_DRAW; k++) {
    const c = CROWD.list[order[k]];
    if (c.d2 > CROWD_FAR * CROWD_FAR) break;      // 距離順なので、以降も遠い
    c.ph += dt * (c.moving ? Math.abs(c.spd) / CFG.walkSpeed * 1.7 : 0.7);
    sampleClip(c.moving ? 'walk' : 'idle', c.ph);
    solveSkeleton(row);
    CROWD.inst.push({ m: c.m, tint: c.tint });
    row++;
  }
  PLAY.mesh.updateInstances(CROWD.inst);
  CROWD.drawn = row - 1;
}

/* 表情を混ぜて、影響する範囲だけ頂点バッファに書き戻す */
function applyMorph() {
  const M = PLAY.morph;
  if (!M || !M.dirty) return;
  M.dirty = false;
  // 今きいているものと、直前まできいていたもの（戻す必要がある）の和
  let lo = 1e9, hi = -1;
  for (let k = 0; k < M.tg.length; k++) {
    const on = M.w[k] > 1e-4;
    if (on || M.live[k]) { lo = Math.min(lo, M.rng[k][0]); hi = Math.max(hi, M.rng[k][1]); }
    M.live[k] = on ? 1 : 0;
  }
  if (hi < lo) return;
  const it = PLAY.mesh.inter;
  for (let i = lo; i <= hi; i++) {
    let x = M.base[i * 3], y = M.base[i * 3 + 1], z = M.base[i * 3 + 2];
    for (let k = 0; k < M.tg.length; k++) {
      const w = M.w[k];
      if (w < 1e-4) continue;
      const d = M.tg[k];
      x += d[i * 3] * w; y += d[i * 3 + 1] * w; z += d[i * 3 + 2] * w;
    }
    it[i * 9] = x; it[i * 9 + 1] = y; it[i * 9 + 2] = z;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, PLAY.mesh.vb);
  gl.bufferSubData(gl.ARRAY_BUFFER, lo * 36, it.subarray(lo * 9, (hi + 1) * 9));
}

function setMorph(name, v) {
  const M = PLAY.morph;
  if (!M) return;
  const i = M.names.indexOf(name);
  if (i < 0) return;
  if (Math.abs(M.w[i] - v) > 1e-3) { M.w[i] = v; M.dirty = true; }
}

/* 速度からクリップを選ぶ。走りは歩きより速く回す。 */
function updatePlayer(dt) {
  if (!PLAY.ready) return;
  /* 上下方向は世界側に無いので、ここで持つ。地面の高さは世界に訊く。 */
  if (PLAY.air) {
    PLAY.vy -= 18.0 * dt;
    PLAY.jumpY += PLAY.vy * dt;
    if (PLAY.jumpY <= 0) { PLAY.jumpY = 0; PLAY.vy = 0; PLAY.air = false; }
  } else if (KEYS[' ']) {
    PLAY.air = true; PLAY.vy = 5.4; PLAY.jumpY = 0.001;
  }
  const spd = Math.hypot(CAM.vel[0], CAM.vel[2]);
  let clip = 'idle', rate = 1;
  if (PLAY.air && PLAY.clips.jump) { clip = 'jump'; rate = 1; }
  else if (spd > CFG.walkSpeed * 1.15 && PLAY.clips.run) { clip = 'run'; rate = spd / CFG.runSpeed; }
  // ジャンプ中はサイクルを回さず、滞空の姿勢のあたりで止める
  if (PLAY.air) rate = 0.0;
  else if (spd > 0.25 && PLAY.clips.walk) { clip = 'walk'; rate = spd / CFG.walkSpeed; }
  if (!PLAY.clips[clip]) clip = PLAY.names[0];
  if (clip !== PLAY.clip) {
    sampleClip(PLAY.clip, PLAY.t, PLAY.snap);   // 今の姿勢を覚えてから切り替える
    PLAY.clip = clip; PLAY.t = 0;
    PLAY.fade = PLAY.fadeLen;
  }
  PLAY.t += dt * clamp(rate, 0.35, 2.4);

  // 進行方向へ向き直る
  if (spd > 0.15) {
    const want = Math.atan2(CAM.vel[0], CAM.vel[2]);
    let d = want - PLAY.yaw;
    while (d > PI) d -= TAU; while (d < -PI) d += TAU;
    PLAY.yaw += d * Math.min(1, dt * 9);
  }

  // まばたき : 数秒に一度、0.12秒で閉じて開く
  if (PLAY.morph) {
    PLAY.blinkNext -= dt;
    if (PLAY.blinkNext < 0) { PLAY.blink = 0.18; PLAY.blinkNext = 2.4 + Math.random() * 3.6; }
    if (PLAY.blink > 0) {
      PLAY.blink -= dt;
      PLAY.draw.blink = Math.sin(clamp(PLAY.blink / 0.18, 0, 1) * PI);
    } else PLAY.draw.blink = 0;
  }

  poseBlended(dt);
  solveSkeleton(0);
  applyMorph();

  const g = WORLD.groundAt(PLAY.pos[0], PLAY.pos[2]);
  M4.compose(PLAY.m, [PLAY.pos[0], PLAY.pos[1] - PLAY.foot + PLAY.jumpY, PLAY.pos[2]],
             PLAY.yaw, [1, 1, 1]);
  updateCrowd(dt);
  uploadBones();
  void g;
}

/* カメラを肩の後ろへ。壁に埋まらないよう、間に何かあれば寄る。 */
function thirdPerson(dt, dir) {
  PLAY.eye = PLAY.eye || [0, 0, 0];
  PLAY.eye[0] = CAM.pos[0]; PLAY.eye[1] = CAM.pos[1]; PLAY.eye[2] = CAM.pos[2];
  PLAY.pos[0] = CAM.pos[0];
  PLAY.pos[2] = CAM.pos[2];
  PLAY.pos[1] = CAM.pos[1] - CFG.eyeHeight;
  const h = (PLAY.top - PLAY.foot) * 0.82 + PLAY.jumpY;
  const pivot = [PLAY.pos[0], PLAY.pos[1] + h, PLAY.pos[2]];
  let d = CFG.camDist === undefined ? 3.1 : CFG.camDist;
  for (let k = 0.25; k <= 1.0; k += 0.25) {          // 地面に潜らせない
    const p = [pivot[0] - dir[0] * d * k, pivot[1] - dir[1] * d * k, pivot[2] - dir[2] * d * k];
    const gy = WORLD.groundAt(p[0], p[2]).y + 0.45;
    if (p[1] < gy) { d *= k; break; }
  }
  CAM.pos = [pivot[0] - dir[0] * d + 0, pivot[1] - dir[1] * d + 0.22, pivot[2] - dir[2] * d];
  const gy = WORLD.groundAt(CAM.pos[0], CAM.pos[2]).y + 0.4;
  if (CAM.pos[1] < gy) CAM.pos[1] = gy;
}

function setupPlayerUI() {
  const st = m => {
    const e = document.getElementById('pdrop');
    if (!e) return;
    const b = e.querySelector('.big');
    if (m) b.textContent = m;
  };
  const hide = () => { const e = document.getElementById('pdrop'); if (e) e.style.display = 'none'; };
  const read = f => {
    const r = new FileReader();
    r.onload = () => {
      setTimeout(() => {
        try {
          if (loadGLB(r.result, st)) { hide(); CFG.fly = false; CFG.autoWalk = false; }
        } catch (e) { st('読み込めませんでした: ' + e.message); }
      }, 30);
    };
    r.readAsArrayBuffer(f);
  };
  const stop = e => { e.preventDefault(); e.stopPropagation(); };
  for (const ev of ['dragenter', 'dragover', 'dragleave', 'drop']) addEventListener(ev, stop, false);
  addEventListener('dragover', () => document.body.classList.add('pdrag'));
  addEventListener('dragleave', () => document.body.classList.remove('pdrag'));
  addEventListener('drop', e => {
    document.body.classList.remove('pdrag');
    const f = e.dataTransfer.files[0]; if (f) read(f);
  });
  const inp = document.getElementById('pfile');
  if (inp) inp.addEventListener('change', e => { const f = e.target.files[0]; if (f) read(f); });
  addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  window.__PLAY = { PLAY, loadGLB, setMorph };
  /* モデルが埋め込まれていれば、ドロップ画面は出さずにそのまま始める。
     ゲームとして開いたら即遊べる、という状態にしておきたい。 */
  if (typeof MODEL_B64 === 'string' && MODEL_B64.length) {
    const bin = atob(MODEL_B64), n = bin.length, u = new Uint8Array(n);
    for (let i = 0; i < n; i++) u[i] = bin.charCodeAt(i);
    try {
      loadGLB(u.buffer, () => {});
      CFG.fly = false; CFG.autoWalk = false;
    } catch (e) { console.error('埋め込みモデルの読み込みに失敗:', e); }
  }
}

'''

rep('/* ==== e_main.js ==== */', PLAYER.lstrip('\n') + '/* ==== e_main.js ==== */')
rep("  window.__ready = true;", "  setupPlayerUI();\n  window.__ready = true;")

# キャラクターは前景なので、遠景カリングの対象から外す
rep("""  if (QS.has('walk')) CFG.autoWalk = QS.get('walk') !== '0';""",
    """  if (QS.has('walk')) CFG.autoWalk = QS.get('walk') !== '0';
  CFG.autoWalk = false;             // 三人称なので自動歩行は切っておく
  CFG.camDist = 3.1;
  CFG.cute = 1.0;""")

rep('<title>', '<title>操作 — ', 1) if '<title>' in src else None

if MODEL:
    b64 = base64.b64encode(io.open(MODEL, 'rb').read()).decode()
    # ドロップの案内は出さない。開いたら始まる。
    i0 = src.index('<div id="pdrop">')
    i1 = src.index('</div>', src.index('<input id="pfile"')) + len('</div>')
    src = src[:i0] + src[i1:]
    src = src.replace('/* ==== g_glb.js ==== */',
                      'const MODEL_B64 = "' + b64 + '";\n/* ==== g_glb.js ==== */')
    # 読み込みが終わるまでの案内
    src = src.replace('<div id="loading">',
                      '<div id="loading" data-model="1">')
    print('埋め込み: %s (%.1f MB -> base64 %.1f MB)'
          % (os.path.basename(MODEL), os.path.getsize(MODEL) / 1e6, len(b64) / 1e6))

io.open(DST, 'w', encoding='utf-8').write(src)
print('wrote %s (%.1f MB)' % (DST, len(src) / 1e6))
