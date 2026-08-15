/* =====================================================================
   data/stage1.js — STAGE 1 タイムライン（コンテンツ層）
   ---------------------------------------------------------------------
   エンジンはこのデータを時間で補間するだけ。ここを書き換えれば
   Stage 2, Stage 3 が無限に作れる（engine 側のコード変更は不要）。

   ★ 全体を約4分40秒に凝縮。密度を上げ、間延びを無くしてある。
     data/track_default.js の sections[].bar と 1:1 で対応させること
     （1小節 = 60/84*4 = 2.857秒）。

   keys[] の各要素:
     t        : 秒
     level    : トリップレベル 0..10（世界の理解がどこまで壊れているか）
     worlds   : ワールド重み（合計は自由。正規化される）
     deep     : グルーヴが高いときに寄っていく“深い版”の世界重み
                → 上手いほど深い世界が見える。この作品固有の分岐。
     warp     : 道路の変形
     fx       : ポストエフェクト強度（0..1。実振幅は game.js の FX_MAX が決める）
     v        : その他の変数（月の大きさ・雲の顔・標識の語彙など）

   events[] は一度きりのトリガ。
   ===================================================================== */
(function () {
'use strict';

const SIGNS = {
  normal: ['STOP', 'SLOW', '30', 'YIELD', 'SCHOOL'],
  odd:    ['STOP', 'DANCE', 'SLOW', 'STOP', 'SOON'],
  weird:  ['DANCE', 'FEEL', 'SOON', 'WHY', 'LOOK', 'STOP'],
  trip:   ['DANCE', 'MELT', 'YES', 'NOW', 'WHO', 'HOME', 'SOON'],
  deep:   ['ALL', 'ONE', 'YES', 'FOREVER', 'HELLO', 'LOVE', 'HOME'],
  none:   ['HOME', 'HOME', 'SLOW', 'STOP']
};

/* keys ------------------------------------------------------------- */
const K = [
/* ============ PHASE 1 : NORMAL (0:00-0:35) — 完全に普通 ============ */
{ t: 0,   level: 0,   worlds: { suburb: 1 },
  warp: { widen: 1 }, fx: {}, v: { speed: 28, signSet: 'normal', horizon: .44 } },

{ t: 12,  level: 0,   worlds: { suburb: 1 },
  warp: {}, fx: {}, v: { speed: 29, signSet: 'normal' } },

/* 0:16 — ごく小さな異常。信号が一瞬紫。電柱が1px呼吸する。 */
{ t: 16,  level: 0.35, worlds: { suburb: 1 },
  warp: {}, fx: { hue: .05 }, v: { speed: 30, signSet: 'normal' } },

{ t: 28,  level: 0.7, worlds: { suburb: .94, weird: .06 },
  warp: { snake: .04 }, fx: { hue: .10, sat: .05 },
  v: { speed: 30, signSet: 'odd', moonSize: .06 } },

/* ============ PHASE 2 : SOMETHING IS WRONG (0:35-1:00) ============ */
{ t: 35,  level: 1.5, worlds: { suburb: .86, weird: .14 },
  warp: { snake: .10, breathe: .1 }, fx: { hue: .16, sat: .12 },
  v: { speed: 31, signSet: 'odd', moonSize: .10, starBoost: .05 } },

{ t: 46,  level: 2.2, worlds: { suburb: .7, weird: .3, night: .05 },
  warp: { snake: .16, breathe: .2, glow: .12 }, fx: { hue: .26, sat: .18, rgb: .06 },
  v: { speed: 32, signSet: 'weird', moonSize: .14, starBoost: .12 } },

{ t: 58,  level: 2.8, worlds: { suburb: .5, weird: .5 },
  warp: { snake: .22, breathe: .32, glow: .2, wave: .06 },
  fx: { hue: .38, sat: .24, rgb: .12, wave: .07 },
  v: { speed: 33, signSet: 'weird', moonSize: .2, starBoost: .2, cloudFace: .1 } },

/* ============ PHASE 3 : TRIP START (1:00-1:37) ==================== */
{ t: 68,  level: 3.4, worlds: { suburb: .34, weird: .66 },
  deep:  { suburb: .2, weird: .6, tropical: .2 },
  warp: { snake: .3, breathe: .45, glow: .35, wave: .12, rainbow: .14 },
  fx: { hue: .5, sat: .32, rgb: .18, wave: .13, ripple: .06, trails: .10 },
  v: { speed: 34, signSet: 'trip', moonSize: .26, starBoost: .3, cloudFace: .45, moonFace: 1 } },

{ t: 80,  level: 4.2, worlds: { suburb: .2, weird: .8 },
  deep:  { weird: .7, tropical: .3 },
  warp: { snake: .38, breathe: .6, glow: .5, wave: .22, rainbow: .3 },
  fx: { hue: .62, sat: .42, rgb: .26, wave: .22, ripple: .12, trails: .18, posterize: .1 },
  v: { speed: 35, signSet: 'trip', moonSize: .34, starBoost: .4, cloudFace: .8, moonFace: 1 } },

{ t: 92,  level: 5.0, worlds: { weird: 1 },
  deep:  { weird: .74, tropical: .26 },
  warp: { snake: .45, breathe: .8, glow: .7, wave: .35, rainbow: .48 },
  fx: { hue: .74, sat: .5, rgb: .32, wave: .3, ripple: .18, trails: .26, posterize: .16 },
  v: { speed: 36, signSet: 'trip', moonSize: .4, starBoost: .5, cloudFace: 1, moonFace: 1 } },

/* ============ トンネル (1:37-1:43) ================================ */
{ t: 97,  level: 5.0, worlds: { weird: 1 },
  warp: { snake: .3, rainbow: .3, glow: .5 },
  fx: { hue: .7, sat: .3, rgb: .2, trails: .3, vignette: .3 },
  v: { speed: 37, signSet: 'trip' } },

{ t: 100, level: 4.6, worlds: { weird: .4, night: .6 },
  warp: { widen: .86, rainbow: .06, glow: .9 },
  fx: { vignette: 1.4, trails: .5, rgb: .1, bright: .55, tunnel: .35 },
  v: { speed: 40, signSet: 'none', tunnelDark: 1 } },

{ t: 102.5, level: 4.6, worlds: { night: 1 },
  warp: { widen: .8, glow: 1 },
  fx: { vignette: 1.7, trails: .6, bright: .34, tunnel: .55 },
  v: { speed: 42, tunnelDark: 1 } },

/* ============ 急激な南国化 (1:43-2:25) ============================ */
{ t: 105, level: 6.0, worlds: { tropical: 1 },
  deep:  { tropical: .8, abstract: .2 },
  warp: { rainbow: .35, glow: .8, wave: .2, widen: 1.05 },
  fx: { sat: .55, hue: .3, rgb: .18, trails: .14, flash: .6 },
  v: { speed: 38, signSet: 'trip', sunGlasses: 1, cloudFace: .5 } },

{ t: 118, level: 6.3, worlds: { tropical: 1 },
  deep:  { tropical: .78, space: .22 },
  warp: { rainbow: .4, glow: .7, wave: .28, snake: .3 },
  fx: { sat: .5, hue: .36, rgb: .22, wave: .24, trails: .22, ripple: .14 },
  v: { speed: 38, sunGlasses: 1, cloudFace: .7, crowd: 1 } },

{ t: 134, level: 6.8, worlds: { tropical: 1 },
  deep:  { tropical: .7, space: .3 },
  warp: { rainbow: .5, glow: .8, wave: .38, snake: .34, liquid: .2 },
  fx: { sat: .55, hue: .44, rgb: .28, wave: .32, trails: .28, ripple: .2, kaleido: .06 },
  v: { speed: 39, sunGlasses: 1, cloudFace: .9, crowd: 1 } },

/* ============ 世界崩壊 (2:25-3:20) ================================ */
{ t: 146, level: 7.0, worlds: { tropical: .55, space: .45 },
  deep:  { tropical: .35, space: .65 },
  warp: { rainbow: .55, glow: .9, wave: .4, sky: .12, liquid: .25 },
  fx: { sat: .55, hue: .5, rgb: .32, wave: .34, trails: .34, ripple: .22, kaleido: .1 },
  v: { speed: 40, signSet: 'deep', starBoost: .6 } },

{ t: 158, level: 7.3, worlds: { space: 1 },
  deep:  { space: .75, abstract: .25 },
  warp: { rainbow: .5, glow: 1, wave: .3, sky: .3, spiral: .12, liquid: .2 },
  fx: { sat: .5, hue: .56, rgb: .34, wave: .32, trails: .4, ripple: .2, kaleido: .14, tunnel: .12 },
  v: { speed: 41, starBoost: 1 } },

{ t: 170, level: 7.5, worlds: { space: .45, city: .55 },
  deep:  { space: .3, city: .5, abstract: .2 },
  warp: { rainbow: .5, glow: .9, snake: .4, spiral: .1, keys: .1 },
  fx: { sat: .5, hue: .62, rgb: .36, wave: .28, trails: .36, ripple: .18, kaleido: .12 },
  v: { speed: 42, starBoost: .7 } },

{ t: 180, level: 7.8, worlds: { city: 1 },
  deep:  { city: .7, abstract: .3 },
  warp: { rainbow: .55, glow: 1, snake: .45, wave: .3, keys: .18 },
  fx: { sat: .55, hue: .68, rgb: .4, wave: .32, trails: .4, ripple: .22, kaleido: .16, melt: .1 },
  v: { speed: 42 } },

{ t: 190, level: 8.0, worlds: { city: .4, jungle: .6 },
  deep:  { city: .25, jungle: .5, abstract: .25 },
  warp: { rainbow: .55, glow: .9, snake: .5, wave: .38, breathe: 1 },
  fx: { sat: .55, hue: .74, rgb: .38, wave: .36, trails: .4, ripple: .26, kaleido: .16, melt: .16 },
  v: { speed: 42 } },

{ t: 198, level: 8.2, worlds: { jungle: .45, ocean: .55 },
  deep:  { jungle: .3, ocean: .45, abstract: .25 },
  warp: { rainbow: .6, glow: 1, wave: .5, liquid: .5, snake: .4 },
  fx: { sat: .6, hue: .8, rgb: .4, wave: .44, trails: .46, ripple: .32, kaleido: .18, melt: .12 },
  v: { speed: 41 } },

/* ============ 完全サイケデリックゾーン (3:20-4:11) ================= */
{ t: 208, level: 8.6, worlds: { ocean: .4, abstract: .6 },
  deep:  { ocean: .2, abstract: .8 },
  warp: { rainbow: .75, glow: 1, spiral: .16, loop: .18, wave: .5, liquid: .5, keys: .16 },
  fx: { sat: .65, hue: .86, rgb: .46, wave: .48, trails: .5, ripple: .34, kaleido: .3, tunnel: .2, melt: .1 },
  v: { speed: 42, signSet: 'deep' } },

{ t: 220, level: 9.0, worlds: { abstract: 1 },
  deep:  { abstract: .8, climax: .2 },
  warp: { rainbow: .85, glow: 1, spiral: .22, loop: .28, wave: .55, liquid: .7, keys: .22, sky: .2 },
  fx: { sat: .7, hue: .92, rgb: .52, wave: .52, trails: .55, ripple: .4, kaleido: .42, tunnel: .3, melt: .18, posterize: .2 },
  v: { speed: 43 } },

{ t: 234, level: 9.3, worlds: { abstract: .8, space: .2 },
  deep:  { abstract: .65, space: .15, climax: .2 },
  warp: { rainbow: .9, glow: 1, spiral: .30, loop: .35, wave: .6, liquid: .8, keys: .28, sky: .35 },
  fx: { sat: .75, hue: .96, rgb: .56, wave: .56, trails: .6, ripple: .44, kaleido: .55, tunnel: .4, melt: .22, posterize: .25, invert: .05 },
  v: { speed: 44 } },

{ t: 244, level: 9.6, worlds: { abstract: .6, climax: .4 },
  deep:  { abstract: .4, climax: .6 },
  warp: { rainbow: .95, glow: 1, spiral: .34, loop: .40, wave: .65, liquid: .9, keys: .32, sky: .5, tongue: .4 },
  fx: { sat: .8, hue: 1, rgb: .6, wave: .6, trails: .65, ripple: .48, kaleido: .65, tunnel: .5, melt: .26, posterize: .3, invert: .07 },
  v: { speed: 45 } },

/* ============ 最大のクライマックス (4:11-4:33) ===================== */
{ t: 251, level: 10, worlds: { climax: .5, abstract: .16, tropical: .12, space: .1, city: .06, jungle: .04, ocean: .02 },
  deep:  { climax: .62, abstract: .12, tropical: .1, space: .08, city: .04, jungle: .03, ocean: .01 },
  warp: { rainbow: 1, glow: 1, spiral: .38, loop: .45, wave: .7, liquid: 1, keys: .30, sky: .6, widen: 1.0 },
  fx: { sat: .9, hue: 1, rgb: .7, wave: .68, trails: .58, ripple: .55, kaleido: .8, tunnel: .6, melt: .16, posterize: .35 },
  v: { speed: 46, starBoost: 1, cloudFace: 1, sunGlasses: 1, moonFace: 1 } },

{ t: 262, level: 10, worlds: { climax: .58, abstract: .14, tropical: .1, space: .1, city: .04, jungle: .03, ocean: .01 },
  warp: { rainbow: 1, glow: 1, spiral: .42, loop: .5, wave: .8, liquid: 1, keys: .26, sky: 1.0, widen: 1.04 },
  fx: { sat: 1, hue: 1, rgb: .85, wave: .8, trails: .62, ripple: .65, kaleido: 1, tunnel: .75, melt: .18, posterize: .4, invert: .06 },
  v: { speed: 48, starBoost: 1 } },

/* 車が空へ向かって走る */
{ t: 268, level: 10, worlds: { climax: .6, space: .25, abstract: .15 },
  warp: { rainbow: 1, glow: 1, spiral: .40, loop: .45, wave: .6, liquid: 1, sky: 1.6, widen: 1.0 },
  fx: { sat: 1, hue: 1, rgb: .9, wave: .7, trails: .62, ripple: .6, kaleido: 1, tunnel: .9, melt: .16 },
  v: { speed: 50, starBoost: 1 } },

/* ============ 帰還 (4:33-4:40) ==================================== */
{ t: 272, level: 10, worlds: { white: 1 },
  warp: { rainbow: .3, glow: 1, sky: .3, widen: 1 },
  fx: { bright: 2.6, sat: -.5, trails: .3, flash: .9 },
  v: { speed: 40 } },

{ t: 275, level: 2, worlds: { night: 1 },
  warp: {}, fx: { bright: 1.1, trails: .1, vignette: .2 },
  v: { speed: 32, signSet: 'none' } },

{ t: 278, level: 0, worlds: { night: 1 },
  warp: {}, fx: { vignette: .25 },
  v: { speed: 28, signSet: 'none' } },

{ t: 290, level: 0, worlds: { night: 1 },
  warp: {}, fx: { vignette: .25 },
  v: { speed: 22, signSet: 'none' } }
];

/* events ----------------------------------------------------------- */
const EVENTS = [
  /* 同じ猫が3回現れる（プレイヤーは「気のせいか？」で済ませる） */
  { t: 15,  type: 'cat' },
  { t: 21,  type: 'cat' },
  { t: 27,  type: 'cat' },
  /* 信号が一瞬だけ紫 */
  { t: 18,  type: 'hueBlip', amount: .12 },
  { t: 31,  type: 'hueBlip', amount: .16 },
  { t: 50,  type: 'hueBlip', amount: .25 },

  { t: 68,  type: 'shimmer' },
  { t: 97,  type: 'whoosh' },
  { t: 99.5, type: 'tunnelIn' },
  { t: 104.4, type: 'tunnelOut' },

  { t: 126, type: 'closeUp', dur: 3.0 },
  { t: 146, type: 'whoosh' },
  { t: 174, type: 'closeUp', dur: 2.4 },
  { t: 190, type: 'whoosh' },
  { t: 214, type: 'shimmer' },
  { t: 232, type: 'closeUp', dur: 2.8 },
  { t: 251, type: 'shimmer' },
  { t: 260, type: 'fireworks' },
  { t: 268, type: 'whoosh' },
  { t: 271.5, type: 'whiteout' },
  { t: 275, type: 'musicOut' }
];

window.PX = window.PX || {};
window.PX.STAGES = window.PX.STAGES || {};
window.PX.STAGES.stage1 = {
  id: 'stage1',
  title: 'STAGE 1 — MIDNIGHT MUSHROOM DRIVE',
  track: 'default',
  driveEnd: 281,        // ここでドライブ終了 → 帰宅シーンへ
  signSets: SIGNS,
  keys: K,
  events: EVENTS
};
})();
