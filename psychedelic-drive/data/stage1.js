/* =====================================================================
   data/stage1.js — STAGE 1 タイムライン（コンテンツ層）
   ---------------------------------------------------------------------
   エンジンはこのデータを時間で補間するだけ。ここを書き換えれば
   Stage 2, Stage 3 が無限に作れる（engine 側のコード変更は不要）。

   keys[] の各要素:
     t        : 秒
     level    : トリップレベル 0..10（世界の理解がどこまで壊れているか）
     worlds   : ワールド重み（合計は自由。正規化される）
     deep     : グルーヴが高いときに寄っていく“深い版”の世界重み
                → 上手いほど深い世界が見える。この作品固有の分岐。
     warp     : 道路の変形
     fx       : ポストエフェクト強度
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
/* ============ PHASE 1 : NORMAL (0:00-1:00) — 完全に普通 ============ */
{ t: 0,   level: 0,   worlds: { suburb: 1 },
  warp: { widen: 1 }, fx: {}, v: { speed: 28, signSet: 'normal', horizon: .44 } },

{ t: 20,  level: 0,   worlds: { suburb: 1 },
  warp: {}, fx: {}, v: { speed: 29, signSet: 'normal' } },

/* 30秒: ごく小さな異常。信号が一瞬紫。電柱が1px呼吸する。 */
{ t: 30,  level: 0.35, worlds: { suburb: 1 },
  warp: {}, fx: { hue: .004 }, v: { speed: 30, signSet: 'normal' } },

{ t: 48,  level: 0.7, worlds: { suburb: .94, weird: .06 },
  warp: { snake: .04 }, fx: { hue: .008, sat: .04 },
  v: { speed: 30, signSet: 'odd', moonSize: .06 } },

/* ============ PHASE 2 : SOMETHING IS WRONG (1:00-2:00) ============ */
{ t: 60,  level: 1.5, worlds: { suburb: .86, weird: .14 },
  warp: { snake: .10, breathe: .1 }, fx: { hue: .012, sat: .10 },
  v: { speed: 31, signSet: 'odd', moonSize: .10, starBoost: .05 } },

{ t: 78,  level: 2.2, worlds: { suburb: .7, weird: .3, night: .05 },
  warp: { snake: .16, breathe: .2, glow: .12 }, fx: { hue: .02, sat: .16, rgb: .05 },
  v: { speed: 32, signSet: 'weird', moonSize: .14, starBoost: .12 } },

{ t: 100, level: 2.8, worlds: { suburb: .5, weird: .5 },
  warp: { snake: .22, breathe: .32, glow: .2, wave: .06 },
  fx: { hue: .03, sat: .22, rgb: .1, wave: .06 },
  v: { speed: 33, signSet: 'weird', moonSize: .2, starBoost: .2, cloudFace: .1 } },

/* ============ PHASE 3 : TRIP START (2:00-3:30) ==================== */
{ t: 120, level: 3.4, worlds: { suburb: .34, weird: .66 },
  deep:  { suburb: .2, weird: .6, tropical: .2 },
  warp: { snake: .3, breathe: .45, glow: .35, wave: .12, rainbow: .14 },
  fx: { hue: .05, sat: .3, rgb: .16, wave: .12, ripple: .05, trails: .08 },
  v: { speed: 34, signSet: 'trip', moonSize: .26, starBoost: .3, cloudFace: .45, moonFace: 1 } },

{ t: 150, level: 4.2, worlds: { suburb: .2, weird: .8 },
  deep:  { weird: .7, tropical: .3 },
  warp: { snake: .38, breathe: .6, glow: .5, wave: .22, rainbow: .3 },
  fx: { hue: .08, sat: .4, rgb: .24, wave: .2, ripple: .1, trails: .16, posterize: .1 },
  v: { speed: 35, signSet: 'trip', moonSize: .34, starBoost: .4, cloudFace: .8, moonFace: 1 } },

{ t: 185, level: 5.0, worlds: { weird: 1 },
  deep:  { weird: .74, tropical: .26 },
  warp: { snake: .45, breathe: .8, glow: .7, wave: .35, rainbow: .48 },
  fx: { hue: .11, sat: .5, rgb: .3, wave: .28, ripple: .16, trails: .24, posterize: .16 },
  v: { speed: 36, signSet: 'trip', moonSize: .4, starBoost: .5, cloudFace: 1, moonFace: 1 } },

/* ============ トンネル (3:30-3:40) ================================ */
{ t: 208, level: 5.0, worlds: { weird: 1 },
  warp: { snake: .3, rainbow: .3, glow: .5 },
  fx: { hue: .1, sat: .3, rgb: .2, trails: .3, vignette: .3 },
  v: { speed: 37, signSet: 'trip' } },

{ t: 212, level: 4.6, worlds: { weird: .4, night: .6 },
  warp: { widen: .86, rainbow: .06, glow: .9 },
  fx: { vignette: 1.4, trails: .5, rgb: .1, bright: .55, tunnel: .35 },
  v: { speed: 40, signSet: 'none', tunnelDark: 1 } },

{ t: 216, level: 4.6, worlds: { night: 1 },
  warp: { widen: .8, glow: 1 },
  fx: { vignette: 1.7, trails: .6, bright: .34, tunnel: .55 },
  v: { speed: 42, tunnelDark: 1 } },

/* ============ 急激な南国化 (3:40-5:00) ============================ */
{ t: 219, level: 6.0, worlds: { tropical: 1 },
  deep:  { tropical: .8, abstract: .2 },
  warp: { rainbow: .35, glow: .8, wave: .2, widen: 1.05 },
  fx: { sat: .55, hue: .04, rgb: .16, trails: .12, flash: .6 },
  v: { speed: 38, signSet: 'trip', sunGlasses: 1, cloudFace: .5 } },

{ t: 235, level: 6.3, worlds: { tropical: 1 },
  deep:  { tropical: .78, space: .22 },
  warp: { rainbow: .4, glow: .7, wave: .28, snake: .3 },
  fx: { sat: .5, hue: .05, rgb: .2, wave: .22, trails: .2, ripple: .12 },
  v: { speed: 38, sunGlasses: 1, cloudFace: .7, crowd: 1 } },

{ t: 265, level: 6.8, worlds: { tropical: 1 },
  deep:  { tropical: .7, space: .3 },
  warp: { rainbow: .5, glow: .8, wave: .38, snake: .34, liquid: .2 },
  fx: { sat: .55, hue: .07, rgb: .26, wave: .3, trails: .26, ripple: .18, kaleido: .06 },
  v: { speed: 39, sunGlasses: 1, cloudFace: .9, crowd: 1 } },

/* ============ 世界崩壊 (5:00-7:00) ================================ */
{ t: 300, level: 7.0, worlds: { tropical: .55, space: .45 },
  deep:  { tropical: .35, space: .65 },
  warp: { rainbow: .55, glow: .9, wave: .4, sky: .12, liquid: .25 },
  fx: { sat: .55, hue: .1, rgb: .3, wave: .32, trails: .34, ripple: .2, kaleido: .1 },
  v: { speed: 40, signSet: 'deep', starBoost: .6 } },

{ t: 325, level: 7.3, worlds: { space: 1 },
  deep:  { space: .75, abstract: .25 },
  warp: { rainbow: .5, glow: 1, wave: .3, sky: .3, spiral: .12, liquid: .2 },
  fx: { sat: .5, hue: .13, rgb: .32, wave: .3, trails: .4, ripple: .18, kaleido: .14, tunnel: .12 },
  v: { speed: 41, starBoost: 1 } },

{ t: 355, level: 7.5, worlds: { space: .45, city: .55 },
  deep:  { space: .3, city: .5, abstract: .2 },
  warp: { rainbow: .5, glow: .9, snake: .4, spiral: .1, keys: .1 },
  fx: { sat: .5, hue: .16, rgb: .34, wave: .26, trails: .36, ripple: .16, kaleido: .12 },
  v: { speed: 42, starBoost: .7 } },

{ t: 380, level: 7.8, worlds: { city: 1 },
  deep:  { city: .7, abstract: .3 },
  warp: { rainbow: .55, glow: 1, snake: .45, wave: .3, keys: .18 },
  fx: { sat: .55, hue: .2, rgb: .38, wave: .3, trails: .4, ripple: .2, kaleido: .16, melt: .1 },
  v: { speed: 42 } },

{ t: 400, level: 8.0, worlds: { city: .4, jungle: .6 },
  deep:  { city: .25, jungle: .5, abstract: .25 },
  warp: { rainbow: .55, glow: .9, snake: .5, wave: .38, breathe: 1 },
  fx: { sat: .55, hue: .24, rgb: .36, wave: .34, trails: .4, ripple: .24, kaleido: .16, melt: .16 },
  v: { speed: 42 } },

{ t: 420, level: 8.2, worlds: { jungle: .45, ocean: .55 },
  deep:  { jungle: .3, ocean: .45, abstract: .25 },
  warp: { rainbow: .6, glow: 1, wave: .5, liquid: .5, snake: .4 },
  fx: { sat: .6, hue: .28, rgb: .38, wave: .42, trails: .46, ripple: .3, kaleido: .18, melt: .12 },
  v: { speed: 41 } },

/* ============ 完全サイケデリックゾーン (7:00-9:00) ================= */
{ t: 440, level: 8.6, worlds: { ocean: .4, abstract: .6 },
  deep:  { ocean: .2, abstract: .8 },
  warp: { rainbow: .75, glow: 1, spiral: .3, loop: .3, wave: .5, liquid: .5, keys: .2 },
  fx: { sat: .65, hue: .34, rgb: .44, wave: .46, trails: .5, ripple: .32, kaleido: .3, tunnel: .2, melt: .1 },
  v: { speed: 42, signSet: 'deep' } },

{ t: 465, level: 9.0, worlds: { abstract: 1 },
  deep:  { abstract: .8, climax: .2 },
  warp: { rainbow: .85, glow: 1, spiral: .5, loop: .5, wave: .55, liquid: .7, keys: .35, sky: .2 },
  fx: { sat: .7, hue: .42, rgb: .5, wave: .5, trails: .55, ripple: .38, kaleido: .42, tunnel: .3, melt: .18, posterize: .2 },
  v: { speed: 43 } },

{ t: 495, level: 9.3, worlds: { abstract: .8, space: .2 },
  deep:  { abstract: .65, space: .15, climax: .2 },
  warp: { rainbow: .9, glow: 1, spiral: .7, loop: .7, wave: .6, liquid: .8, keys: .5, sky: .35 },
  fx: { sat: .75, hue: .5, rgb: .55, wave: .55, trails: .6, ripple: .42, kaleido: .55, tunnel: .4, melt: .22, posterize: .25, invert: .05 },
  v: { speed: 44 } },

{ t: 522, level: 9.6, worlds: { abstract: .6, climax: .4 },
  deep:  { abstract: .4, climax: .6 },
  warp: { rainbow: .95, glow: 1, spiral: .8, loop: .85, wave: .65, liquid: .9, keys: .6, sky: .5, tongue: .4 },
  fx: { sat: .8, hue: .6, rgb: .6, wave: .6, trails: .65, ripple: .48, kaleido: .65, tunnel: .5, melt: .26, posterize: .3, invert: .07 },
  v: { speed: 45 } },

/* ============ 最大のクライマックス (9:00-9:40) ===================== */
{ t: 540, level: 10, worlds: { climax: .5, abstract: .16, tropical: .12, space: .1, city: .06, jungle: .04, ocean: .02 },
  deep:  { climax: .62, abstract: .12, tropical: .1, space: .08, city: .04, jungle: .03, ocean: .01 },
  warp: { rainbow: 1, glow: 1, spiral: .9, loop: 1, wave: .7, liquid: 1, keys: .5, sky: .6, widen: 1.0 },
  fx: { sat: .9, hue: .7, rgb: .7, wave: .68, trails: .72, ripple: .55, kaleido: .8, tunnel: .6, melt: .3, posterize: .35 },
  v: { speed: 46, starBoost: 1, cloudFace: 1, sunGlasses: 1, moonFace: 1 } },

{ t: 562, level: 10, worlds: { climax: .58, abstract: .14, tropical: .1, space: .1, city: .04, jungle: .03, ocean: .01 },
  warp: { rainbow: 1, glow: 1, spiral: 1, loop: 1, wave: .8, liquid: 1, keys: .4, sky: 1.0, widen: 1.04 },
  fx: { sat: 1, hue: .85, rgb: .85, wave: .8, trails: .8, ripple: .65, kaleido: 1, tunnel: .75, melt: .35, posterize: .4, invert: .06 },
  v: { speed: 48, starBoost: 1 } },

/* 車が空へ向かって走る */
{ t: 574, level: 10, worlds: { climax: .6, space: .25, abstract: .15 },
  warp: { rainbow: 1, glow: 1, spiral: 1, loop: 1, wave: .6, liquid: 1, sky: 1.6, widen: 1.0 },
  fx: { sat: 1, hue: 1, rgb: .9, wave: .7, trails: .85, ripple: .6, kaleido: 1, tunnel: .9, melt: .3 },
  v: { speed: 50, starBoost: 1 } },

/* ============ 帰還 (9:40-10:00) =================================== */
{ t: 580, level: 10, worlds: { white: 1 },
  warp: { rainbow: .3, glow: 1, sky: .3, widen: 1 },
  fx: { bright: 2.6, sat: -.5, trails: .3, flash: .9 },
  v: { speed: 40 } },

{ t: 584, level: 2, worlds: { night: 1 },
  warp: {}, fx: { bright: 1.1, trails: .1, vignette: .2 },
  v: { speed: 32, signSet: 'none' } },

{ t: 588, level: 0, worlds: { night: 1 },
  warp: {}, fx: { vignette: .25 },
  v: { speed: 28, signSet: 'none' } },

{ t: 600, level: 0, worlds: { night: 1 },
  warp: {}, fx: { vignette: .25 },
  v: { speed: 22, signSet: 'none' } }
];

/* events ----------------------------------------------------------- */
const EVENTS = [
  /* 同じ猫が3回現れる（プレイヤーは「気のせいか？」で済ませる） */
  { t: 33,  type: 'cat' },
  { t: 41,  type: 'cat' },
  { t: 49,  type: 'cat' },
  /* 信号が一瞬だけ紫 */
  { t: 36,  type: 'hueBlip', amount: .12, dur: .18 },
  { t: 57,  type: 'hueBlip', amount: .16, dur: .22 },
  { t: 88,  type: 'hueBlip', amount: .25, dur: .3 },

  { t: 120, type: 'shimmer' },
  { t: 208, type: 'whoosh' },
  { t: 211.5, type: 'tunnelIn' },
  { t: 218.6, type: 'tunnelOut' },

  { t: 250, type: 'thirdPerson', dur: 3.2 },
  { t: 300, type: 'whoosh' },
  { t: 352, type: 'thirdPerson', dur: 2.4 },
  { t: 400, type: 'whoosh' },
  { t: 438, type: 'mirrorWorld', dur: 6 },
  { t: 465, type: 'shimmer' },
  { t: 505, type: 'thirdPerson', dur: 2.8 },
  { t: 520, type: 'mirrorWorld', dur: 8 },
  { t: 540, type: 'shimmer' },
  { t: 560, type: 'fireworks' },
  { t: 574, type: 'whoosh' },
  { t: 579.4, type: 'whiteout' },
  { t: 584, type: 'musicOut' }
];

window.PX = window.PX || {};
window.PX.STAGES = window.PX.STAGES || {};
window.PX.STAGES.stage1 = {
  id: 'stage1',
  title: 'STAGE 1 — MIDNIGHT MUSHROOM DRIVE',
  track: 'default',
  driveEnd: 592,        // ここでドライブ終了 → 帰宅シーンへ
  signSets: SIGNS,
  keys: K,
  events: EVENTS
};
})();
