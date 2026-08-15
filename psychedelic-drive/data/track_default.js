/* =====================================================================
   data/track_default.js — 仮トラック定義（差し替え前提）
   ---------------------------------------------------------------------
   実楽曲を入れる時にやること:
     1) audioUrl に音源パスを指定（指定するとプロシージャル演奏は停止し、
        音源の再生位置がそのまま Conductor の時計になる）
     2) bpm / offset / sections[].bar を実曲に合わせる
     3) chart に [{beat, lane, kind}] を書く（省略時は sections[].style から自動生成）
   patterns[] のドラムグリッドは「音を鳴らす」だけでなく
   「世界を光らせる」エンベロープ源も兼ねているので、実曲を入れる場合も
   グリッドだけは書いておくと道路/背景/エフェクトが完全に同期する。

   ステップは 16分音符。値は 0..1 のベロシティ。
   ===================================================================== */
(function () {
'use strict';
const _ = 0;
/* 16分グリッドを読みやすく書くヘルパ: 'x...x...x...x...' 形式 */
function g(s, v) {
  v = v === undefined ? 1 : v;
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    out.push(c === 'x' ? v : c === 'o' ? v * .6 : c === '.' ? 0 : c === '-' ? 0 : (parseInt(c, 10) || 0) / 9 * v);
  }
  return out;
}

/* ------------------------------------------------------- パターン集 */
const PAT = {
  /* 静か。エンジン音だけの世界に、そっと拍だけ置く */
  intro: {
    kick:  g('x.......x.......', .8),
    snare: g('................'),
    hat:   g('..x...x...x...x.', .35),
    bass:  g('x.......x.......'),
    skank: g('................'),
    bassNotes: [0, 0, 0, 0], bassLen: 3.0,
    chords: [[0, 3, 7]]
  },
  /* レゲエ ワンドロップ（3拍目にキック+スネア） */
  basic: {
    kick:  g('........x.......'),
    snare: g('........x.......', .8),
    hat:   g('..x...x...x...x.', .5),
    perc:  g('............o...', .5),
    bass:  g('x..x....x..x....'),
    skank: g('..x...x...x...x.'),
    bassNotes: [0, 0, -4, -2], bassLen: 2.2,
    chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-2, 2, 5]]
  },
  /* 少しずつ何かがおかしい */
  skankA: {
    kick:  g('........x.....x.'),
    snare: g('........x.......', .85),
    hat:   g('..x.o.x...x.o.x.', .55),
    perc:  g('....o.......o..o', .5),
    bass:  g('x..x..x.x..x..x.'),
    skank: g('..x...x...x...xx'),
    bassNotes: [0, 0, -4, -2], bassLen: 2.0,
    chords: [[0, 3, 7], [-2, 2, 5], [-4, 0, 3], [-2, 2, 7]]
  },
  /* ダブ: 空間が広い。ディレイが効く */
  dub: {
    kick:  g('x.......x.......'),
    snare: g('........x.......', .9),
    hat:   g('..x.......x.....', .4),
    perc:  g('..........o....o', .6),
    bass:  g('x.....x.x.....x.'),
    skank: g('..x.......x.....'),
    pad:   g('x...............'),
    bassNotes: [0, -4, -2, -5], bassLen: 3.2,
    chords: [[0, 3, 7, 10], [-4, 0, 3, 7], [-2, 2, 5, 9], [-5, -1, 2, 7]]
  },
  dubDeep: {
    kick:  g('x.......x...x...'),
    snare: g('........x.......', .8),
    hat:   g('....o.......o...', .3),
    bass:  g('x.......x.......'),
    skank: g('......x.......x.'),
    pad:   g('x...............'),
    bassNotes: [-5, -5, -7, -4], bassLen: 3.6,
    chords: [[0, 3, 7, 10], [-5, -1, 2, 7]]
  },
  /* ビルドアップ */
  build: {
    kick:  g('x...x...x...x...'),
    snare: g('....x.......x..x', .8),
    hat:   g('xxxxxxxxxxxxxxxx', .35),
    perc:  g('..o...o...o.o.oo', .5),
    bass:  g('x..x..x..x..x..x'),
    skank: g('..x...x...x...x.'),
    sweep: g('x...............'),
    lead:  g('....x.......x...'),
    leadNotes: [12, 15, 19, 22],
    bassNotes: [0, 0, 3, 5], bassLen: 1.6,
    chords: [[0, 3, 7], [3, 7, 10], [5, 8, 12], [7, 10, 14]]
  },
  /* トンネル: ほぼ無音、パッドだけが残る */
  tunnel: {
    kick:  g('................'),
    snare: g('................'),
    hat:   g('................'),
    bass:  g('x...............'),
    skank: g('................'),
    pad:   g('x...............'),
    bassNotes: [-5], bassLen: 8,
    chords: [[0, 3, 7, 10]]
  },
  /* 南国ドロップ */
  tropicalA: {
    kick:  g('x...x...x...x...'),
    snare: g('....x.......x...', .85),
    hat:   g('..x.o.x.o.x.o.x.', .55),
    perc:  g('..o..o..o..o..oo', .55),
    bass:  g('x..x..x.x..x..x.'),
    skank: g('..x...x...x...x.'),
    lead:  g('........x...x.x.'),
    leadNotes: [12, 14, 16, 19, 21, 19, 16, 14],
    bassNotes: [0, 3, -2, -4], bassLen: 2.0,
    chords: [[0, 4, 7], [-2, 2, 5], [-4, 0, 3], [3, 7, 10]]
  },
  tropicalB: {
    kick:  g('x...x..xx...x...'),
    snare: g('....x.......x..x', .9),
    hat:   g('xxx.xxx.xxx.xxxx', .45),
    perc:  g('.o.o.o.o.o.o.oo.', .55),
    bass:  g('x.x.x.x.x.x.x.x.'),
    skank: g('..x.x.x...x.x.x.'),
    lead:  g('....x...x...x.x.'),
    pad:   g('x...............'),
    leadNotes: [19, 21, 24, 21, 19, 16, 19, 21],
    bassNotes: [0, 0, 5, 3], bassLen: 1.4,
    chords: [[0, 4, 7, 11], [5, 9, 12], [3, 7, 10], [-2, 2, 5, 9]]
  },
  /* 巨大都市: ブーンバップ */
  cityA: {
    kick:  g('x.....x...x.....'),
    snare: g('....x.......x...', .95),
    hat:   g('x.x.x.x.x.x.x.xx', .4),
    perc:  g('.......o......o.', .5),
    bass:  g('x..x....x.x.....'),
    skank: g('....x.......x...'),
    lead:  g('..........x.....'),
    leadNotes: [12, 10, 7, 12],
    bassNotes: [0, -2, -4, -2], bassLen: 2.4,
    chords: [[0, 3, 7, 10], [-2, 2, 5, 8]]
  },
  /* ジャングル: 打楽器の嵐 */
  jungleA: {
    kick:  g('x...x.x.x...x.x.'),
    snare: g('....x.......x...', .8),
    hat:   g('xxxxxxxxxxxxxxxx', .3),
    perc:  g('x.oxx.o.x.oxx.oo', .6),
    bass:  g('x..x..x..x..x..x'),
    skank: g('..x...x...x...x.'),
    bassNotes: [0, 3, 5, 3], bassLen: 1.5,
    chords: [[0, 3, 7], [5, 8, 12]]
  },
  /* サイケゾーン */
  psychA: {
    kick:  g('x...x...x...x..x'),
    snare: g('....x.......x...', .85),
    hat:   g('xxxxxxxxxxxxxxxx', .38),
    perc:  g('..o.o..o..o.o.oo', .5),
    bass:  g('x.x.x.x.x.x.x.x.'),
    skank: g('..x.x...x.x...x.'),
    lead:  g('x.x.x.x.x.x.x.x.'),
    pad:   g('x...............'),
    leadNotes: [12, 15, 19, 22, 24, 22, 19, 15, 14, 17, 21, 24, 26, 24, 21, 17],
    bassNotes: [0, 0, 3, 5], bassLen: 1.2,
    chords: [[0, 3, 7, 10], [3, 7, 10, 14], [5, 8, 12, 15], [-2, 2, 5, 9]]
  },
  psychB: {
    kick:  g('x..x..x.x..x..x.'),
    snare: g('....x..x....x..x', .9),
    hat:   g('xxxxxxxxxxxxxxxx', .42),
    perc:  g('oo.ooo.ooo.ooo.o', .5),
    bass:  g('xxx.xxx.xxx.xxx.'),
    skank: g('x.x.x.x.x.x.x.x.'),
    lead:  g('xx.xx.xx.xx.xx.x'),
    pad:   g('x.......x.......'),
    leadNotes: [24, 22, 19, 24, 26, 24, 22, 19, 21, 24, 26, 29, 26, 24, 21, 19],
    bassNotes: [0, 5, 3, 7], bassLen: 1.0,
    chords: [[0, 4, 7, 11], [2, 5, 9, 12], [5, 9, 12, 16], [7, 11, 14, 17]]
  },
  /* 最大クライマックス */
  climaxA: {
    kick:  g('x.x.x.x.x.x.x.x.'),
    snare: g('....x.......x..x', 1),
    hat:   g('xxxxxxxxxxxxxxxx', .48),
    perc:  g('oooooooooooooooo', .38),
    bass:  g('xxxxxxxxxxxxxxxx'),
    skank: g('x.x.x.x.x.x.x.x.'),
    lead:  g('xxxxxxxxxxxxxxxx'),
    pad:   g('x.......x.......'),
    sweep: g('x...............'),
    leadNotes: [24, 26, 28, 31, 33, 36, 33, 31, 28, 26, 24, 26, 28, 31, 33, 36],
    bassNotes: [0, 0, 0, 0], bassLen: .9,
    chords: [[0, 4, 7, 11, 14], [5, 9, 12, 16, 19]]
  },
  /* 帰還 */
  outro: {
    kick:  g('x.......x.......', .5),
    snare: g('................'),
    hat:   g('..o.......o.....', .2),
    bass:  g('x...............'),
    skank: g('................'),
    pad:   g('x...............'),
    bassNotes: [0], bassLen: 4,
    chords: [[0, 3, 7]]
  },
  silence: {
    kick:  g('................'), snare: g('................'),
    hat:   g('................'), bass: g('................'),
    skank: g('................'),
    chords: [[0, 3, 7]]
  }
};

/* ------------------------------------------------------- セクション
   bar: 開始小節 / energy: 0..1 / pattern: 演奏パターン
   style,amp: 譜面(道路の曲がり方)の自動生成ルール
   ------------------------------------------------------------------ */
const SECTIONS = [
  { name: 'INTRO',      bar: 0,   energy: .10, pattern: 'intro',     style: 'still',    amp: .18 },
  { name: 'VERSE 1',    bar: 4,   energy: .28, pattern: 'basic',     style: 'straight', amp: .34 },
  { name: 'VERSE 2',    bar: 8,   energy: .38, pattern: 'basic',     style: 'straight', amp: .44 },
  { name: 'WRONG 1',    bar: 12,  energy: .44, pattern: 'skankA',    style: 'sway',     amp: .52 },
  { name: 'WRONG 2',    bar: 17,  energy: .50, pattern: 'skankA',    style: 'skank',    amp: .58 },
  { name: 'TRIP 1',     bar: 21,  energy: .58, pattern: 'dub',       style: 'sway',     amp: .62, dub: 1 },
  { name: 'TRIP 2',     bar: 26,  energy: .64, pattern: 'dub',       style: 'long',     amp: .70, dub: 1 },
  { name: 'BUILD',      bar: 30,  energy: .78, pattern: 'build',     style: 'wave',     amp: .76 },
  { name: 'TUNNEL',     bar: 34,  energy: .12, pattern: 'tunnel',    style: 'still',    amp: .10 },
  { name: 'PARADISE',   bar: 36,  energy: .92, pattern: 'tropicalA', style: 'skank',    amp: .82 },
  { name: 'PARADISE 2', bar: 42,  energy: .88, pattern: 'tropicalA', style: 'wave',     amp: .82 },
  { name: 'PARADISE 3', bar: 47,  energy: .94, pattern: 'tropicalB', style: 'sway',     amp: .86 },
  { name: 'COSMOS',     bar: 51,  energy: .80, pattern: 'dub',       style: 'long',     amp: .82, dub: 1 },
  { name: 'MEGACITY',   bar: 58,  energy: .86, pattern: 'cityA',     style: 'scratch',  amp: .86 },
  { name: 'JUNGLE',     bar: 64,  energy: .82, pattern: 'jungleA',   style: 'wave',     amp: .84 },
  { name: 'ABYSS',      bar: 68,  energy: .74, pattern: 'dubDeep',   style: 'long',     amp: .82, dub: 1 },
  { name: 'PSYCHE 1',   bar: 70,  energy: .92, pattern: 'psychA',    style: 'wild',     amp: .90 },
  { name: 'PSYCHE 2',   bar: 76,  energy: .96, pattern: 'psychA',    style: 'scratch',  amp: .94 },
  { name: 'PSYCHE 3',   bar: 81,  energy: 1.0, pattern: 'psychB',    style: 'wave',     amp: .98 },
  { name: 'ASCEND',     bar: 85,  energy: 1.0, pattern: 'build',     style: 'climax',   amp: 1.0 },
  { name: 'CLIMAX',     bar: 88,  energy: 1.0, pattern: 'climaxA',   style: 'climax',   amp: 1.0 },
  { name: 'COMEDOWN',   bar: 94,  energy: .22, pattern: 'outro',     style: 'still',    amp: .16 },
  { name: 'SILENCE',    bar: 97,  energy: 0,   pattern: 'silence',   style: 'still',    amp: .05, bars: 6 }
];

window.PX = window.PX || {};
window.PX.TRACKS = window.PX.TRACKS || {};
window.PX.TRACKS.default = {
  id: 'default',
  title: 'MIDNIGHT MUSHROOM DRIVE',
  artist: '(temp / procedural)',
  bpm: 84,
  beatsPerBar: 4,
  offset: 0,
  swing: 0.16,
  root: 55,              // A1
  delayBeats: 0.75,      // ダブディレイ = 付点8分
  audioUrl: null,        // ← ここに音源パスを入れると実楽曲に差し替わる
  chart: null,           // ← ここに [{beat,lane,kind}] を入れると譜面が固定される
  sections: SECTIONS,
  patterns: PAT
};
})();
