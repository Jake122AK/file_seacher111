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
uniform int uRowBase;
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
    /* 行 = uRowBase + インスタンス番号。近くの人（本メッシュ）と遠くの人
       （間引きメッシュ）は別々の描画になるので、後者は続きの行から読む。 */
    int row = uRowBase + (uInstanced==1 ? gl_InstanceID : 0);
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

# uBones は**毎回**ユニット6に割り当てる。サンプラは既定で 0 番を指すので、
# 骨のない描画では uBones(sampler2D) と uMatA(sampler2DArray) が同じ 0 番を
# 共有することになり、WebGL はその描画を GL_INVALID_OPERATION で捨てる
# （"Two textures of different types use the same sampler location"）。
# モデルを落とさずに遊ぶと世界がまるごと消えていたのはこれが原因。
# 骨が無いときは 1x1 のダミーを差しておく（未バインドのままでも実装依存で
# 黒が返るだけだが、環境によって警告が出るので明示的に埋める）。
rep("    u1f(prog, 'uWind', d.wind || 0);",
    "    u1f(prog, 'uWind', d.wind || 0);\n"
    "    u1i(prog, 'uSkin', d.skin ? 1 : 0);\n"
    "    u1i(prog, 'uRowBase', d.rowBase || 0);\n"
    "    tex(prog, 'uBones', 6, d.skin || dummyBoneTex(), gl.TEXTURE_2D);\n"
    "    u1f(prog, 'uBlink', d.blink || 0);")

# ---------------------------------------------------------------------------
# 1.5 四ツ辻からの京都市街
#
# 幾何として置くことはできない。霧の見通しは 1/fogDensity ≒ 80m しかないので、
# 何km も先の街をメッシュで置いた瞬間、合成パスが完全に霧で塗り潰す。近くに
# 縮小して置けば視差が嘘になる。
#
# なので**空として描く**。深度が遠クリップのままの画素（= 空）はライティング
# パスで色が決まり、そのあとの霧の対象にならない。稜線と盆地を仰角で切り分けて
# 空の色から作れば、遠景として矛盾なく成立する。
#
# 出るのはカメラが稜線より上に出たときだけ。石段を登りきって四ツ辻に着くと
# 街が開ける、という順番そのものが、この区間の意味になる。
# ---------------------------------------------------------------------------
rep("uniform samplerCube uSky;\nuniform vec3 uHazeColor;",
    "uniform samplerCube uSky;\nuniform vec3 uCityDir;   // 京都盆地の方位（世界座標）\n"
    "uniform vec3 uHazeColor;")

rep("""    sky = mix(sky, uHazeColor, smoothstep(0.16, -0.03, dir.y)*uHazeAmt);
    outC = vec4(sky, 1.0);
    return;""",
"""    sky = mix(sky, uHazeColor, smoothstep(0.16, -0.03, dir.y)*uHazeAmt);

    /* ---- 京都盆地 ----
       実物の四ツ辻は標高 230m ほどで、盆地の地面は 2km 先で俯角 5.7°、
       5km で 2.3°、手前の丘の切れる 1km あたりで 11°。つまり街は「地平の
       すぐ下の細い帯」ではなく、**視界の下半分を占める広い面**になる。
       最初はここを -0.3°〜-2.2° の帯にしていたので、写真とまるで印象が
       違っていた。地平から俯角 12° までを街に使う。 */
    float open = smoothstep(17.0, 34.0, uCamPos.y);     // 登るほど開ける
    if(open > 0.003){
      vec3 hd = normalize(vec3(dir.x, 0.0, dir.z) + vec3(1e-5, 0.0, 0.0));
      float sector = smoothstep(0.02, 0.55, dot(hd, uCityDir));
      if(sector > 0.002){
        float az = atan(dir.x, dir.z), el = dir.y;

        /* 稜線は2枚。奥（北山〜西山）は霞んで明るく、手前の丘は暗い。
           1枚だと切り絵になり、2枚あるだけで奥行きが出る。 */
        float rid1 = 0.052 + 0.030*fbm(vec2(az*2.30, 2.7), 4, 2.2, 0.55);
        float rid2 = 0.013 + 0.016*fbm(vec2(az*4.70, 9.1), 4, 2.1, 0.55);

        /* 街の構造。仰角を対数で潰すと、遠いほど細かく詰まって見える
           （実際の遠近そのもの）。区画の大きさと建物の粒の2段で作る。 */
        float depth = smoothstep(0.0, -0.16, el);            // 0=遠い 1=手前
        vec2 cuv = vec2(az*7.0, log(max(-el, 0.0035))*1.35);
        float blockA = fbm(cuv*1.90 + vec2(1.7, 0.0), 4, 2.10, 0.55);   // 区画
        float blockB = fbm(cuv*7.40 + vec2(9.3, 4.1), 3, 2.35, 0.50);   // 建物
        float grid   = fbm(cuv*22.0 + vec2(3.1, 7.7), 2, 2.60, 0.45);   // ざらつき
        float built  = 0.46*blockA + 0.36*blockB + 0.18*grid;
        /* 靄の層。盆地の上には必ず横縞が出る */
        float haze = 0.5 + 0.5*sin(el*46.0 + fbm(vec2(az*1.7, 5.0), 3, 2.0, 0.5)*3.0);
        haze *= smoothstep(0.0, -0.05, el) * (1.0 - depth*0.75);

        vec3 mntFar  = sky * vec3(0.46, 0.55, 0.74);   // 奥の山（霞む）
        vec3 mntNear = sky * vec3(0.17, 0.23, 0.34);   // 手前の丘
        /* 陽の当たった市街地は、地平の空より明るい。手前ほどコントラストが
           上がり、遠くは靄で飛ぶ。 */
        /* 濃淡は**暗い側**に付ける。明るい側へ振っても、この帯はすでに
           階調の上のほうにいるのでトーンマッピングで潰れて出ない。市街地に
           混じる緑地・丘・影として、暗い斑を落とすほうが city に見える。 */
        float dark = smoothstep(0.60, 0.26, built);
        vec3 town = sky * mix(vec3(2.60,2.54,2.40), vec3(1.55,1.50,1.42), depth);
        town *= 1.0 - mix(0.30, 0.62, depth) * dark;
        town *= 1.0 + mix(0.06, 0.16, depth) * (blockB - 0.5);
        town = mix(town, sky*vec3(2.30,2.28,2.22), haze*0.28);
        /* 夜は街明かり。手前ほど粒が大きく見える */
        town += vec3(0.145,0.098,0.040)*smoothstep(0.54,0.88,blockB)
                * (0.4 + 0.6*depth) * uStarAmt*3.6;

        float mA = smoothstep(rid1 + 0.010, rid1 - 0.014, el);   // 奥の稜線から下
        float mB = smoothstep(rid2 + 0.006, rid2 - 0.010, el);   // 手前の丘から下
        float cA = smoothstep(-0.002, -0.016, el);               // 地平から下が街
        vec3 far = mix(mix(mntFar, mntNear, mB), town, cA);
        /* 下端。ここから先は手前の山（実際の地形）が塞ぐので、溶かして終える */
        float bot = 1.0 - smoothstep(-0.205, -0.265, el);
        sky = mix(sky, far, mA*sector*open*bot);
      }
    }
    outC = vec4(sky, 1.0);
    return;""")

rep("  tex(p_l, 'uSky', 10, R.skyCube.tex, gl.TEXTURE_CUBE_MAP);",
    "  tex(p_l, 'uSky', 10, R.skyCube.tex, gl.TEXTURE_CUBE_MAP);\n"
    "  {\n"
    "    const cd = R.cityDir || (R.cityDir = norm(bearingToWorld(CITY_BEARING)));\n"
    "    u3f(p_l, 'uCityDir', cd[0], cd[1], cd[2]);\n"
    "  }")

# ---------------------------------------------------------------------------
# 1.6 水のマテリアル
#
# 池も沢も STONE に暗いティントを掛けていただけなので、平らな灰色の面にしか
# 見えなかった。材質スロットは 0〜15 が世界、16 以上はキャラクター（照明が
# トゥーンに切り替わる境目）なので、新しい番号を足すと境目に触る。
# 観光地版ではキョンシーを出さないので **9 番（屍蝋）が丸ごと空いている**。
# ここを水に転用する。番号は 16 未満なので、照明は今までどおり PBR を通る。
#
# ベイクしたテクスチャは使わない（法線も粗さも下で作る）ので、焼き直しは不要。
# tint の w で池（0.2）と沢（0.6）を見分け、沢は流れる向きに波を送る。
# ---------------------------------------------------------------------------
rep("  // per-instance colour variation & large-scale world breakup\n"
    "  albedo *= vTint.rgb;\n"
    "  float bigN = fbm3(vWPos*0.16+vec3(vTint.w*13.0), 3);\n"
    "  float bigN2 = fbm3(vWPos*0.9+vec3(3.0), 2);\n"
    "  // none of the world's weathering belongs on a character\n"
    "  if(layer < 16){",
    "  // per-instance colour variation & large-scale world breakup\n"
    "  albedo *= vTint.rgb;\n"
    "  float bigN = fbm3(vWPos*0.16+vec3(vTint.w*13.0), 3);\n"
    "  float bigN2 = fbm3(vWPos*0.9+vec3(3.0), 2);\n"
    "  // none of the world's weathering belongs on a character — nor on water\n"
    "  if(layer < 16 && layer != 9){")

rep("""  } else if(layer==3){
    // wet moss and leaf litter: darker, only slightly glossier
    albedo = mix(albedo, albedo*vec3(0.52,0.56,0.54), wet*0.85);
    rough = mix(rough, 0.46, wet*0.55);""",
"""  } else if(layer==9){
    /* ---- 水面 ----
       水は「色」ではなく「映り込み」で見える。粗さを落として SSR と鏡面に
       仕事をさせ、法線だけを時間で揺らす。頂点は動かさない（波立たせると
       岸との継ぎ目が割れる）。 */
    float flow = step(0.4, vTint.w);            // 0 = 池、1 = 沢
    vec2 p = vWPos.xz;
    vec2 d1 = mix(vec2(0.86,0.51), vec2(0.05,1.00), flow);
    vec2 d2 = mix(vec2(-0.42,0.91), vec2(0.28,0.96), flow);
    float sp = mix(0.22, 1.30, flow);           // 流れの速さ
    float w1 = sin(dot(p, d1)*3.10 + uTime*(0.9 + 2.2*flow));
    float w2 = sin(dot(p, d2)*5.70 - uTime*(0.7 + 2.8*flow));
    float n1 = vnoise(p*2.30 + d1*uTime*sp*2.0) - 0.5;
    float n2 = vnoise(p*6.10 - d2*uTime*sp*1.4) - 0.5;
    float amp = mix(0.016, 0.042, flow);
    vec2 rip = (d1*w1*0.50 + d2*w2*0.34 + vec2(n1, n2)*1.70) * amp;
    N = normalize(vec3(rip.x, 1.0, rip.y));
    /* 濁りは水深で決まる。岸に近いほど底が透けて明るく、緑に寄る。 */
    float shallow = flow > 0.5 ? smoothstep(1.9, 0.8, abs(vUV.x))
                               : smoothstep(2.6, 1.2, length(vUV - 0.5));
    albedo = mix(vec3(0.016,0.026,0.028), vec3(0.052,0.070,0.056), shallow);
    albedo *= 0.92 + 0.16*(w1*0.5+0.5);
    rough = 0.028 + 0.040*flow;
    ao = 1.0;
    if(flow > 0.5){
      // 岸ぎわの白波。石に当たるところが白く立つ
      float edge = smoothstep(1.30, 1.92, abs(vUV.x));
      float f = edge * (0.30 + 0.70*vnoise(vec2(vUV.y*7.0 - uTime*2.4, vUV.x*3.0)));
      albedo = mix(albedo, vec3(0.62,0.65,0.63), f*0.65);
      rough = mix(rough, 0.50, f*0.85);
    }
  } else if(layer==3){
    // wet moss and leaf litter: darker, only slightly glossier
    albedo = mix(albedo, albedo*vec3(0.52,0.56,0.54), wet*0.85);
    rough = mix(rough, 0.46, wet*0.55);""")

# 遠景の地面が 4.8m 刻みで、陽が当たると一枚の平らな明るい面になる。
# 分割を上げると groundNoise の起伏が出て、面が割れる。
rep("  const farL = buildGroundStrip(-46.0, -12.6, MAT.MOSS, 7, 4.0, -0.02, 0.16);\n"
    "  const farR = buildGroundStrip(12.6, 46.0, MAT.MOSS, 7, 4.0, -0.02, 0.16);",
    "  const farL = buildGroundStrip(-46.0, -12.6, MAT.MOSS, 18, 2.0, -0.02, 0.16);\n"
    "  const farR = buildGroundStrip(12.6, 46.0, MAT.MOSS, 18, 2.0, -0.02, 0.16);")



# 基本の移動は走り。Shift を押している間だけ歩く（もとは逆だった）。
# 参道は 520m あるので、既定が歩き（4.2 m/s）だと端から端まで2分かかる。
rep("    const run = KEYS['shift'] ? 1 : 0;\n"
    "    const want = (run ? CFG.runSpeed : CFG.walkSpeed) * (fz < 0 ? 0.72 : 1.0);",
    "    const run = KEYS['shift'] ? 0 : 1;      // 既定が走り、Shift で歩き\n"
    "    const want = (run ? CFG.runSpeed : CFG.walkSpeed) * (fz < 0 ? 0.72 : 1.0);")

# 走りは 9.5 m/s（36km/h）だと速すぎて参道が短く感じる。人が本気で走る速さに。
rep("  runSpeed: 9.50,", "  runSpeed: 6.60,")

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

# 鳥居が小さい。全体 2.91〜3.94m に対して身長 1.66m なので、貫（下の横木）が
# 頭のすぐ上に来ていた。実物の千本鳥居は人がゆったり通れる高さがある。
rep("    const scale = (big ? 1.14 + rnd() * 0.12 : 0.93 + rnd() * 0.14);",
    "    const scale = (big ? 1.14 + rnd() * 0.12 : 0.93 + rnd() * 0.14) * 1.26;")

# 地形に手を入れる口をひとつ開ける。bankHeight は「参道の中心線からの距離」
# だけで高さを決めていたので、分岐も、池の窪地も、見晴らしも作れなかった。
# t を受け取れるようにして、掘る処理（terrainCarve / zones.js）を通す。
# t を渡さない呼び出しは今までどおりの形をそのまま返す。
rep("""function bankHeight(s) {
  const a = Math.abs(s);
  if (a < 1.42) return -0.010 * a * a;
  const k = a - 1.42;
  // shallow gutter, then a steep wooded slope
  return -0.02 + 0.42 * Math.min(k, 0.55) / 0.55
    + 0.92 * Math.max(Math.min(k, 7.0) - 0.55, 0)
    + 0.62 * Math.max(k - 7.0, 0);
}""",
"""function bankHeight(s, t) {
  /* 分岐区間では2本の参道からの距離のうち近いほうを使う。間に土手が1本
     残るので、そのまま2本を隔てる仕切りになる。 */
  let a = Math.abs(s);
  if (t !== undefined) {
    const off = branchOffsetAt(t);
    if (off > 0) a = Math.min(a, Math.abs(s - off));
  }
  let h;
  if (a < 1.42) h = -0.010 * a * a;
  else {
    const k = a - 1.42;
    // shallow gutter, then a steep wooded slope
    h = -0.02 + 0.42 * Math.min(k, 0.55) / 0.55
      + 0.92 * Math.max(Math.min(k, 7.0) - 0.55, 0)
      + 0.62 * Math.max(k - 7.0, 0);
  }
  return t === undefined ? h : terrainCarve(s, t, h);
}""")

# 地形メッシュ・当たり判定・散らしもの、すべて同じ高さを見るように t を渡す。
# ここを揃えないと、掘ったところに木や石が浮く。
rep("      const h = bankHeight(s) + groundNoise(s, t) * (Math.abs(s) > 1.4 ? 3.0 : 1.0);",
    "      const h = bankHeight(s, t) + groundNoise(s, t) * (Math.abs(s) > 1.4 ? 3.0 : 1.0);")
rep("  return { y: P[1] + bankHeight(Math.abs(s)), s, t };",
    "  return { y: P[1] + bankHeight(s, t), s, t };")
src = src.replace("bankHeight(Math.abs(s))", "bankHeight(s, tt)")

# 木と下草は沢の中に立たせない
rep("""      if (rnd() > 0.72) continue;
      const s = sgn * (2.15 + Math.pow(rnd(), 0.8) * 22.0);""",
    """      if (rnd() > 0.72) continue;
      const s = sgn * (2.15 + Math.pow(rnd(), 0.8) * 22.0);
      if (nearStream(s, tt) || overWater(s, tt)) continue;
      /* 見晴らしの扇は伐り開ける。斜面を落としても、木が立っていれば見えない。
         幹と樹冠は別々に散らしているので、間引く率を揃えても対にはならない。
         幹をほぼ全部抜く（0.995）ことで、樹冠だけ消えた「電柱」が残らない。 */
      if (rnd() < viewClearAt(s, tt) * 0.995) continue;""")
rep("""    const s = sgn * (1.95 + Math.pow(rnd(), 0.7) * 10.0);
    const P = pathPos(tt), R = pathRight(tt);""",
    """    const s = sgn * (1.95 + Math.pow(rnd(), 0.7) * 10.0);
    if (nearStream(s, tt) || overWater(s, tt)) continue;
    const P = pathPos(tt), R = pathRight(tt);""")

# 樹冠も同じ。梢が視線の高さに残ると、地面を落としても盆地は見えない
rep("""    const tt = -16 + rnd() * (PATH_LEN + 40);
    const s = (rnd() - 0.5) * 40.0;""",
    """    const tt = -16 + rnd() * (PATH_LEN + 40);
    const s = (rnd() - 0.5) * 40.0;
    if (rnd() < viewClearAt(s, tt) * 0.97) continue;
    // 沢と池の上は空けておく。覆われていると水面に映るものが無く、ただの
    // 暗い面になる
    if (overWater(s, tt) && rnd() < 0.9) continue;""")

# 樹冠の高さは「横に離れるほど高く」で持ち上げていた。土手が必ず上がる前提の
# 式なので、掘って下がる斜面では地面から切り離されて宙に浮く。土手の高さその
# ものを見るように変えると、上がる側では今までどおり、下がる側では浮かない。
rep("    const hgt = base + 5.0 + rnd() * 9.0 + Math.abs(s) * 0.32;",
    "    const hgt = base + 5.0 + rnd() * 9.0 + Math.max(0, base - P[1]) * 0.35;")

# 木立の届く範囲を広げる。もとは中心線から 24m までで、その外は裸の苔だった。
# 谷が閉じているうちは見えなかったが、池の窪地や見晴らしで斜面を露出させると、
# 陽の当たった苔の面が一枚の明るい壁として立つ。木が生えていれば、それが
# 影と輪郭を作って壁でなくなる。刻みも詰めて、手前の密度は保つ。
rep("      const s = sgn * (2.15 + Math.pow(rnd(), 0.8) * 22.0);",
    "      const s = sgn * (2.15 + Math.pow(rnd(), 0.85) * 31.0);")
rep("  for (let tt = CORRIDOR_T0 + 1.0; tt < PATH_LEN + 30; tt += 1.05) {",
    "  for (let tt = CORRIDOR_T0 + 1.0; tt < PATH_LEN + 30; tt += 0.78) {")
rep("    const s = (rnd() - 0.5) * 40.0;", "    const s = (rnd() - 0.5) * 56.0;")
rep("  const canopyCount = quality >= 2 ? 1150 : 480;",
    "  const canopyCount = quality >= 2 ? 1620 : 660;")
rep("    const s = sgn * (1.95 + Math.pow(rnd(), 0.7) * 10.0);",
    "    const s = sgn * (1.95 + Math.pow(rnd(), 0.75) * 15.0);")

# 千本鳥居は本殿の正面からではなく**右手**から始まる。入口を右へずらし、
# 70m ほどかけて元の稜線に戻す（ガウスで減衰させるので折れ目が出ない）。
rep("const pathXAt = t => 7.2 * Math.sin(t * 0.0455) + 3.1 * Math.sin(t * 0.0192 + 1.35) - 0.35 * Math.sin(t * 0.061);",
    "const pathXAt = t => 7.2 * Math.sin(t * 0.0455) + 3.1 * Math.sin(t * 0.0192 + 1.35)\n"
    "  - 0.35 * Math.sin(t * 0.061)\n"
    "  + 9.5 * Math.exp(-t * t / 1450);   // 入口は本殿の右手")

# 勾配を区間ごとに変える。ずっと一定の坂だと、山を登っている感じがしない。
# 石段の区間は急に、池のほとりと四ツ辻は平らに。積分は起動時に一度だけ
# 表にする（この関数は太陽の遮蔽計算から毎秒何万回も呼ばれるので、
# 中で計算も確保もできない）。
rep("const pathYAt = t => t * 0.055 + 0.5 * Math.sin(t * 0.035 + 0.4) + 0.20 * Math.sin(t * 0.09);",
"""const _grade = t => (t < 95 ? 0.090 : t < 150 ? 0.115 : t < 215 ? 0.022 :
                     t < 330 ? 0.225 : t < 385 ? 0.010 : 0.115);
const _YTAB = (() => {
  const N = 1300, dt = 0.5, a = new Float64Array(N + 1);
  let y = 0;
  for (let i = 1; i <= N; i++) { y += _grade((i - 0.5) * dt) * dt; a[i] = y; }
  return { a, dt, N };
})();
const pathYAt = t => {
  const u = t <= 0 ? 0 : (t / _YTAB.dt > _YTAB.N - 1 ? _YTAB.N - 1 : t / _YTAB.dt);
  const i = u | 0;
  return _YTAB.a[i] + (_YTAB.a[i + 1] - _YTAB.a[i]) * (u - i)
       + 0.30 * Math.sin(t * 0.035 + 0.4) + 0.12 * Math.sin(t * 0.09);
};""")

# 鳥居を区間ごとに間引く。ずっと同じ密度だと、長いだけの一本道になる。
rep('''    const P = pathPos(t), T = pathTan(t);
    const ry = Math.atan2(T[0], T[2]);''',
'''    if (toriiSkip(t)) { t += 0.9; continue; }
    const P = pathPos(t), T = pathTan(t);
    const ry = Math.atan2(T[0], T[2]);''')

# 観光地なので、キョンシーは出さない
rep('  const spots = [[34, -0.9], [52, 1.0], [70, -0.6], [88, 0.8], [106, -1.0], [124, 0.7], [142, -0.5]];',
    '  const spots = [];        // 参拝客だけの世界にする')

# 境内と参道の継ぎ目。地面の関数が2つ（keidaiGroundY と groundHeightAt）あって、
# z=1.0 で切り替わるだけだったので、そこに段差ができていた。両者を z=-11〜+11 の
# 帯で混ぜる。混ぜるだけで段差は消える。
rep("""  WORLD.add({
    name: 'keidai',
    contains: (x, z) => z < 1.0,
    ground: (x, z) => ({ y: keidaiGroundY(x, z), solid: true })
  });""",
"""  WORLD.add({
    name: 'keidai',
    contains: (x, z) => z < -11.0,
    ground: (x, z) => ({ y: keidaiGroundY(x, z), solid: true })
  });
  /* 継ぎ目。境内の地面と参道の地面は別々の関数なので、切り替えるだけでは
     段差になる。22m かけて混ぜる。参道側の funnel は z>0.5 からで、
     もともと z=0 付近では幅 5m に開いているので、そのまま繋がる。 */
  WORLD.add({
    name: 'seam',
    contains: (x, z) => z < 11.0,
    ground: (x, z) => {
      const g = groundHeightAt(x, z);
      const w = smoothstep(-11.0, 11.0, z);
      return { y: lerp(keidaiGroundY(x, z), g.y, w), s: g.s, t: g.t,
               corridor: z > 0.5, solid: z <= 0.5 };
    }
  });""")

# 分岐区間は2本ぶんの帯を歩けるようにする。もとは中心線から左右対称に
# corridorHalf で押し戻していたので、第2の参道へ入った瞬間に中心へ引き戻され、
# 道があるのに歩けない状態になる。帯を [-half, off+half] に広げる。
rep("""      const half = lerp(5.0, CFG.corridorHalf, smoothstep(0.0, 8.0, CAM.pos[2]));
      if (Math.abs(g.s) > half) {
        const k = (Math.abs(g.s) - half) * Math.sign(g.s);
        const Rt = pathRight(g.t);
        CAM.pos[0] -= Rt[0] * k * 0.42; CAM.pos[2] -= Rt[2] * k * 0.42;
      }""",
"""      const half = lerp(5.0, CFG.corridorHalf, smoothstep(0.0, 8.0, CAM.pos[2]));
      const off = branchOffsetAt(g.t);
      const k = g.s > off + half ? g.s - (off + half)
              : (g.s < -half ? g.s + half : 0);
      if (k !== 0) {
        const Rt = pathRight(g.t);
        CAM.pos[0] -= Rt[0] * k * 0.42; CAM.pos[2] -= Rt[2] * k * 0.42;
      }""")

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
ZONES_JS = ("/* 観光地版ではキョンシーを出さないので、屍蝋(9)を水に転用する。\n"
            "   16 以上はキャラクター用でトゥーンに切り替わるため、水は 16 未満に置く。 */\n"
            "MAT.WATER = MAT.CORPSE;\n"
            + io.open(os.path.join(HERE, 'zones.js'), encoding='utf-8').read()
            + io.open(os.path.join(HERE, 'dress.js'), encoding='utf-8').read())

PLAYER = ZONES_JS + r'''
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

/* 骨を持たない描画のための 1x1。中身は使われない（uSkin=0 なので読まれない）。
   ここで一枚差しておく目的はサンプラの型を揃えることだけ。 */
let _dummyBone = null;
function dummyBoneTex() {
  if (_dummyBone) return _dummyBone;
  _dummyBone = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, _dummyBone);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT,
                new Float32Array([0, 0, 0, 0]));
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER])
    gl.texParameteri(gl.TEXTURE_2D, p, gl.NEAREST);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T])
    gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
  return _dummyBone;
}

/* ---------------- 群衆用の間引きメッシュ ----------------
   参拝客に主人公と同じ 62,824 三角形を使っているのが負荷の根本原因だった。
   本来は Blender の Decimate で作った版を持てばいいが、モデルは遊ぶ人が
   落としてくるので、こちらで読み込み時に作る。

   やり方は頂点クラスタリング。格子を切り、同じマスに落ちた頂点を1点に潰す。
   O(N) で終わり、位相が壊れても遠くの人に使うぶんには分からない。
   骨の番号と重みはマスの代表頂点のものを引き継ぐので、そのまま同じボーン
   テクスチャで動く。 */
function buildCrowdLOD(pos, nrm, idx, bi, bw, NV, cells) {
  let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
  for (let i = 0; i < NV; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x < mnx) mnx = x; if (y < mny) mny = y; if (z < mnz) mnz = z;
    if (x > mxx) mxx = x; if (y > mxy) mxy = y; if (z > mxz) mxz = z;
  }
  const span = Math.max(mxx - mnx, mxy - mny, mxz - mnz) || 1;
  const cs = span / cells;
  const nx = Math.ceil((mxx - mnx) / cs) + 1, ny = Math.ceil((mxy - mny) / cs) + 1;
  const nz = Math.ceil((mxz - mnz) / cs) + 1;
  const map = new Int32Array(NV);
  const cellId = new Map();
  const ax = [], ay = [], az = [], an = [], bn = [], cn = [], cnt = [], src = [];
  for (let i = 0; i < NV; i++) {
    const ix = ((pos[i * 3] - mnx) / cs) | 0;
    const iy = ((pos[i * 3 + 1] - mny) / cs) | 0;
    const iz = ((pos[i * 3 + 2] - mnz) / cs) | 0;
    const key = (ix * ny + iy) * nz + iz;
    let id = cellId.get(key);
    if (id === undefined) {
      id = ax.length; cellId.set(key, id);
      ax.push(0); ay.push(0); az.push(0); an.push(0); bn.push(0); cn.push(0);
      cnt.push(0); src.push(i);
    }
    ax[id] += pos[i * 3]; ay[id] += pos[i * 3 + 1]; az[id] += pos[i * 3 + 2];
    an[id] += nrm ? nrm[i * 3] : 0;
    bn[id] += nrm ? nrm[i * 3 + 1] : 1;
    cn[id] += nrm ? nrm[i * 3 + 2] : 0;
    cnt[id]++; map[i] = id;
  }
  const M = ax.length;
  const g = new Geo();
  for (let i = 0; i < M; i++) {
    const k = cnt[i];
    const l = Math.hypot(an[i], bn[i], cn[i]) || 1;
    g.push(ax[i] / k, ay[i] / k, az[i] / k, an[i] / l, bn[i] / l, cn[i] / l,
           0.5, 0.5, MAT.LINEN);
  }
  let tris = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = map[idx[t]], b = map[idx[t + 1]], c = map[idx[t + 2]];
    if (a === b || b === c || a === c) continue;    // マスに潰れた三角形
    g.tri(a, b, c); tris++;
  }
  const lbi = new Float32Array(M * 4), lbw = new Float32Array(M * 4);
  for (let i = 0; i < M; i++) {
    const s0 = src[i];
    for (let k = 0; k < 4; k++) { lbi[i * 4 + k] = bi[s0 * 4 + k]; lbw[i * 4 + k] = bw[s0 * 4 + k]; }
  }
  return { geo: g, bi: lbi, bw: lbw, verts: M, tris };
}

const PLAY = {
  ready: false, mesh: null, lod: null, boneTex: null, boneData: null,
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
  /* 材質が入っていないモデルなので、形から着せる（dress.js）。
     元の頂点は消さず、髪の房の三角形だけを落として、ボブと袴を足す。
     こうしておくと表情モーフの頂点番号がそのまま生きる。 */
  const jointNames = skin.joints.map(n => (J.nodes[n] || {}).name || '');
  const DR = dressCharacter(pos, nrm, idx, ji, jw, NV, jointNames);
  const NX = DR.ex.pos.length / 3;

  const g = new Geo();
  for (let i = 0; i < NV; i++)
    g.push(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2],
           nrm ? nrm[i * 3] : 0, nrm ? nrm[i * 3 + 1] : 1, nrm ? nrm[i * 3 + 2] : 0,
           0.5, 0.5, DR.mat[i]);
  for (let i = 0; i < NX; i++)
    g.push(DR.ex.pos[i * 3], DR.ex.pos[i * 3 + 1], DR.ex.pos[i * 3 + 2],
           DR.ex.nrm[i * 3], DR.ex.nrm[i * 3 + 1], DR.ex.nrm[i * 3 + 2],
           0.5, 0.5, DR.ex.mat[i]);
  for (let t = 0; t < idx.length / 3; t++)
    if (DR.keepTri[t]) g.tri(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
  for (let t = 0; t < DR.ex.idx.length; t += 3)
    g.tri(DR.ex.idx[t], DR.ex.idx[t + 1], DR.ex.idx[t + 2]);
  const mesh = new Mesh(g, { dynamic: true });
  mesh.setInstances([{ m: M4.create(), tint: PLAY_TINT }]);

  const NVA = NV + NX;
  const bi = new Float32Array(NVA * 4), bw = new Float32Array(NVA * 4);
  for (let i = 0; i < NV * 4; i++) { bi[i] = ji[i]; bw[i] = jw[i]; }
  for (let i = 0; i < NX * 4; i++) { bi[NV * 4 + i] = DR.ex.bi[i]; bw[NV * 4 + i] = DR.ex.bw[i]; }
  // まばたきの差分を頂点属性で持たせる（見つからなければゼロ）
  const bl = new Float32Array(NVA * 3);
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

  // --- 遠くの人のための間引きメッシュ ---
  const L = buildCrowdLOD(g.p, g.n, g.idx, bi, bw, NVA, CROWD_LOD_CELLS);
  const lodMesh = new Mesh(L.geo);
  lodMesh.setInstances([{ m: M4.create(), tint: PLAY_TINT }]);
  gl.bindVertexArray(lodMesh.vao);
  {
    const b = gl.createBuffer();          // まばたきは遠くでは要らない
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(L.verts * 3), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(11);
    gl.vertexAttribPointer(11, 3, gl.FLOAT, false, 12, 0);
  }
  for (const [loc, data] of [[9, L.bi], [10, L.bw]]) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, 16, 0);
  }
  gl.bindVertexArray(null);
  console.log('群衆メッシュ ' + (idx.length / 3).toLocaleString() + ' 三角形 -> '
    + L.tris.toLocaleString() + ' 三角形（' + (idx.length / 3 / Math.max(L.tris, 1)).toFixed(1) + '分の1）');

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
    ready: true, mesh, lod: lodMesh, lodTris: L.tris, boneTex, rows: ROWS, NB,
    boneData: new Float32Array(NB * 16 * ROWS),
    nodes, roots, joints, ibm, clips, morph, NV, foot: ylo, top: yhi,
    scale: 1.0, names: Object.keys(clips)
  });
  /* 既定の表情。全部 0 だと能面なので、うっすら笑わせて眉を上げておく。
     参拝客も同じ姿勢テクスチャを共有するので、全員に同じ表情が乗る。 */
  setMorph('smile', 0.26);
  setMorph('brow_up', 0.08);

  const dr = { mesh, name: 'player', skin: boneTex, blink: 0 };
  PLAY.draw = dr;
  R.scene.draws.push(dr);
  R.scene.shadowDraws.push(dr);
  R.baseDraws && R.baseDraws.push(dr);
  R.shadowBase && R.shadowBase.push(dr);
  /* 遠くの人。ボーンテクスチャは同じで、読む行だけずらす。 */
  const drLod = { mesh: lodMesh, name: 'crowd_lod', skin: boneTex, blink: 0,
                  rowBase: 1 + CROWD_NEAR };
  PLAY.lodDraw = drLod;
  R.scene.draws.push(drLod);
  R.scene.shadowDraws.push(drLod);
  R.baseDraws && R.baseDraws.push(drLod);
  R.shadowBase && R.shadowBase.push(drLod);
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
const CROWD_DRAW = 26;      // そのうち実際に描く人数（近い順）
/* そのうち本メッシュで描くのは手前だけ。残りは間引きメッシュ。人数を 14 -> 26
   に増やしてなお、三角形は前より減る。 */
const CROWD_NEAR = 6;
const CROWD_LOD_CELLS = 26; // 間引きの格子の粗さ（大きいほど細かい）
/* 打ち切りは霧の見通し（1/fogDensity ≒ 80m）と鳥居の間引き（±78m）に
   合わせる。46m で切っていたときは、まだはっきり見えている人が忽然と
   消えていた。境界の手前 9m は縮めて消すので、消える瞬間は見えない。 */
const CROWD_FAR = 80;
const CROWD_FADE = 9;
const CROWD = { list: [], inst: [], lodInst: [], drawn: 0, near: 0, far: 0 };

function initCrowd() {
  const rn = mulberry32(20260811);
  CROWD.list.length = 0;
  for (let i = 0; i < CROWD_N; i++) {
    const up = rn() < 0.55;
    CROWD.list.push({
      t: 6 + rn() * (PATH_LEN - 12),
      side: (rn() < 0.5 ? -1 : 1) * (0.5 + rn() * 1.5),
      lane: rn() < 0.45 ? 1 : 0,        // 分岐区間でどちらの道を通るか
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
    /* 分岐区間では半分ほどが第2の道へ流れる。合流点で offset は 0 に戻るので、
       横に飛ぶことなく自然に元の道へ合流する。 */
    const sd = c.side + branchOffsetAt(c.t) * c.lane;
    const x = P[0] + Rt[0] * sd, z = P[2] + Rt[2] * sd;
    const gy = WORLD.groundAt(x, z).y;
    const sg = c.spd < 0 ? -1 : 1;
    c.yaw = Math.atan2(T[0] * sg, T[2] * sg);
    const dist = Math.sqrt((x - PLAY.pos[0]) * (x - PLAY.pos[0]) +
                           (z - PLAY.pos[2]) * (z - PLAY.pos[2]));
    const f = c.scale * smoothstep(0, 1, clamp((CROWD_FAR - dist) / CROWD_FADE, 0, 1));
    M4.compose(c.m, [x, gy, z], c.yaw, [f, f, f]);
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
  CROWD.lodInst.length = 0;
  CROWD.inst.push({ m: PLAY.m, tint: PLAY_TINT });
  /* 手前の CROWD_NEAR 人だけ本メッシュ。そこから先は間引きメッシュに回す。
     ボーンテクスチャの行は 0=自分 / 1..CROWD_NEAR=手前 / その先=遠く、と
     詰めて使い、遠くの描画は uRowBase で頭出しする。 */
  let near = 0, far = 0;
  for (let k = 0; k < order.length && near + far < CROWD_DRAW; k++) {
    const c = CROWD.list[order[k]];
    if (c.d2 > CROWD_FAR * CROWD_FAR) break;      // 距離順なので、以降も遠い
    c.ph += dt * (c.moving ? Math.abs(c.spd) / CFG.walkSpeed * 1.7 : 0.7);
    sampleClip(c.moving ? 'walk' : 'idle', c.ph);
    if (near < CROWD_NEAR) {
      solveSkeleton(1 + near);
      CROWD.inst.push({ m: c.m, tint: c.tint });
      near++;
    } else {
      solveSkeleton(1 + CROWD_NEAR + far);
      CROWD.lodInst.push({ m: c.m, tint: c.tint });
      far++;
    }
  }
  PLAY.mesh.updateInstances(CROWD.inst);
  if (PLAY.lod) PLAY.lod.updateInstances(CROWD.lodInst);
  CROWD.drawn = near + far;
  CROWD.near = near; CROWD.far = far;
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

# 参道側のものも覗けるようにしておく（位置を飛ばして絵を確認するのに要る）
rep("""    KIT, JOINTS, poseKitsune, placeKitsune };""",
    """    KIT, JOINTS, poseKitsune, placeKitsune,
    PLAY, CROWD, pathRight, pathTan, branchOffsetAt, viewOpenAt, ZONES, POND, STREAM };""")
rep("  window.__ready = true;", "  buildZones();\n  setupPlayerUI();\n  window.__ready = true;")

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
