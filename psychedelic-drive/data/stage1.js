/* =====================================================================
   data/stage1.js — STAGE 1 タイムライン（コンテンツ層）
   ---------------------------------------------------------------------
   曲 "Thuong Thi Thoi (Jank AIR Remix)" の実際の構成に合わせてある。
   132.82 BPM / 1小節 = 1.807秒 / 全147小節 / 4:26

   ★ 音源解析で見つけた構成をそのまま物語に割り当てた ★
     bar  98-105 (2:57-3:11) は実際にキックが抜けるブレイクダウン
       → ここを「トンネル」に。世界が一度暗転して静まる。
     bar 106     (3:11)      でドロップが戻る
       → ここを「クライマックス」に。全ワールドが一度に戻ってくる。
     bar 132     (3:58)      でハットが抜けて減衰していく
       → ここを「帰還」に。

   keys[] の各要素:
     t / level / worlds / deep / warp / fx / v
   （詳細は README を参照）
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

const K = [
/* ===== NORMAL  0:00-0:22 (bar 0-11) — 完全に普通の住宅街 ===== */
{ t: 0,   level: 0,   worlds: { suburb: 1 },
  warp: { widen: 1 }, fx: {}, v: { speed: 19, signSet: 'normal', horizon: .44 } },
{ t: 10,  level: 0,   worlds: { suburb: 1 },
  warp: {}, fx: {}, v: { speed: 20, signSet: 'normal' } },
/* 0:14 ごく小さな異常 */
{ t: 14,  level: 0.35, worlds: { suburb: 1 },
  warp: {}, fx: { hue: .05 }, v: { speed: 20, signSet: 'normal' } },

/* ===== SOMETHING IS WRONG  0:22-0:34 (bar 12-18) ===== */
{ t: 21.7, level: 1.4, worlds: { suburb: .88, weird: .12 },
  warp: { snake: .08, breathe: .1 }, fx: { hue: .14, sat: .10 },
  v: { speed: 21, signSet: 'odd', moonSize: .08, starBoost: .05 } },
{ t: 28,  level: 2.3, worlds: { suburb: .68, weird: .32 },
  warp: { snake: .16, breathe: .22, glow: .14 }, fx: { hue: .26, sat: .18, rgb: .07 },
  v: { speed: 21, signSet: 'weird', moonSize: .14, starBoost: .14 } },

/* ===== TRIP START  0:34-1:05 (bar 19-35) ===== */
{ t: 34.4, level: 3.2, worlds: { suburb: .48, weird: .52 },
  deep:  { suburb: .3, weird: .5, tropical: .2 },
  warp: { snake: .26, breathe: .4, glow: .28, wave: .1, rainbow: .12 },
  fx: { hue: .42, sat: .28, rgb: .16, wave: .12, ripple: .06, trails: .10 },
  v: { speed: 22, signSet: 'weird', moonSize: .22, starBoost: .26, cloudFace: .3, moonFace: 1 } },
{ t: 48,  level: 4.2, worlds: { suburb: .22, weird: .78 },
  deep:  { weird: .68, tropical: .32 },
  warp: { snake: .36, breathe: .6, glow: .48, wave: .2, rainbow: .3 },
  fx: { hue: .6, sat: .4, rgb: .24, wave: .2, ripple: .12, trails: .18, posterize: .1 },
  v: { speed: 22, signSet: 'trip', moonSize: .32, starBoost: .38, cloudFace: .8, moonFace: 1 } },
{ t: 58,  level: 5.0, worlds: { weird: 1 },
  deep:  { weird: .7, tropical: .3 },
  warp: { snake: .42, breathe: .78, glow: .66, wave: .3, rainbow: .45 },
  fx: { hue: .72, sat: .48, rgb: .3, wave: .28, ripple: .16, trails: .24, posterize: .15 },
  v: { speed: 23, signSet: 'trip', moonSize: .4, starBoost: .5, cloudFace: 1, moonFace: 1 } },

/* ===== PARADISE  1:05-1:36 (bar 36-52) — ハットが開いて世界が南国に ===== */
{ t: 65.1, level: 6.0, worlds: { tropical: 1 },
  deep:  { tropical: .8, abstract: .2 },
  warp: { rainbow: .38, glow: .8, wave: .2, widen: 1.04 },
  fx: { sat: .55, hue: .3, rgb: .18, trails: .14, flash: .5 },
  v: { speed: 24, signSet: 'trip', sunGlasses: 1, cloudFace: .5 } },
{ t: 78,  level: 6.4, worlds: { tropical: 1 },
  deep:  { tropical: .76, space: .24 },
  warp: { rainbow: .44, glow: .74, wave: .3, snake: .3 },
  fx: { sat: .52, hue: .36, rgb: .22, wave: .24, trails: .22, ripple: .14 },
  v: { speed: 24, sunGlasses: 1, cloudFace: .8, crowd: 1 } },

/* ===== COSMOS  1:36-2:05 (bar 53-68) ===== */
{ t: 95.8, level: 7.0, worlds: { tropical: .5, space: .5 },
  deep:  { tropical: .3, space: .7 },
  warp: { rainbow: .55, glow: .9, wave: .38, sky: .12, liquid: .25 },
  fx: { sat: .55, hue: .5, rgb: .3, wave: .32, trails: .32, ripple: .2, kaleido: .1 },
  v: { speed: 25, signSet: 'deep', starBoost: .7 } },
{ t: 110, level: 7.4, worlds: { space: 1 },
  deep:  { space: .74, abstract: .26 },
  warp: { rainbow: .5, glow: 1, wave: .3, sky: .3, spiral: .12, liquid: .2 },
  fx: { sat: .5, hue: .56, rgb: .34, wave: .3, trails: .38, ripple: .2, kaleido: .14, tunnel: .12 },
  v: { speed: 26, starBoost: 1 } },

/* ===== MEGACITY → JUNGLE  2:05-2:30 (bar 69-82) ===== */
{ t: 124.7, level: 7.7, worlds: { space: .35, city: .65 },
  deep:  { space: .25, city: .5, abstract: .25 },
  warp: { rainbow: .52, glow: .95, snake: .42, spiral: .1, keys: .14 },
  fx: { sat: .52, hue: .64, rgb: .38, wave: .3, trails: .38, ripple: .2, kaleido: .14 },
  v: { speed: 26, starBoost: .6 } },
{ t: 138, level: 8.1, worlds: { city: .38, jungle: .62 },
  deep:  { city: .24, jungle: .5, abstract: .26 },
  warp: { rainbow: .56, glow: .92, snake: .5, wave: .38, breathe: 1 },
  fx: { sat: .55, hue: .74, rgb: .38, wave: .36, trails: .4, ripple: .26, kaleido: .16, melt: .14 },
  v: { speed: 26 } },

/* ===== PSYCHEDELIC ZONE  2:30-2:57 (bar 83-97) ===== */
{ t: 150,  level: 8.6, worlds: { jungle: .35, ocean: .3, abstract: .35 },
  deep:  { jungle: .2, ocean: .2, abstract: .6 },
  warp: { rainbow: .7, glow: 1, wave: .48, liquid: .5, snake: .4, keys: .18 },
  fx: { sat: .62, hue: .82, rgb: .44, wave: .44, trails: .46, ripple: .32, kaleido: .26, tunnel: .18, melt: .12 },
  v: { speed: 27, signSet: 'deep' } },
{ t: 164, level: 9.2, worlds: { abstract: .8, ocean: .2 },
  deep:  { abstract: .78, climax: .22 },
  warp: { rainbow: .88, glow: 1, spiral: .24, loop: .28, wave: .56, liquid: .75, keys: .3, sky: .22 },
  fx: { sat: .7, hue: .92, rgb: .52, wave: .52, trails: .55, ripple: .4, kaleido: .45, tunnel: .32, melt: .18, posterize: .2 },
  v: { speed: 28 } },

/* ===== TUNNEL / BREAKDOWN  2:57-3:11 (bar 98-105) =====
   ここは音源で実際にキックが抜ける。世界を一度暗転させて静める。 */
{ t: 177.1, level: 8.0, worlds: { abstract: .5, night: .5 },
  warp: { widen: .9, rainbow: .2, glow: .8, spiral: .1 },
  fx: { vignette: 1.1, trails: .45, rgb: .14, bright: .62, tunnel: .3, sat: .2 },
  v: { speed: 29, signSet: 'none', tunnelDark: 1 } },
{ t: 181, level: 6.0, worlds: { night: 1 },
  warp: { widen: .82, glow: 1 },
  fx: { vignette: 1.7, trails: .55, bright: .32, tunnel: .5 },
  v: { speed: 31, tunnelDark: 1 } },
{ t: 187, level: 6.0, worlds: { night: 1 },
  warp: { widen: .86, glow: 1 },
  fx: { vignette: 1.5, trails: .5, bright: .40, tunnel: .42 },
  v: { speed: 32, tunnelDark: 1 } },
{ t: 190.4, level: 7.5, worlds: { night: .55, climax: .45 },
  warp: { widen: .95, glow: 1, rainbow: .5 },
  fx: { vignette: .7, trails: .4, bright: .8, tunnel: .2, sat: .5 },
  v: { speed: 30, tunnelDark: .35 } },

/* ===== CLIMAX  3:11-3:58 (bar 106-131) — ドロップが戻る ===== */
{ t: 191.6, level: 10, worlds: { climax: .52, abstract: .14, tropical: .12, space: .1, city: .06, jungle: .04, ocean: .02 },
  deep:  { climax: .64, abstract: .1, tropical: .1, space: .08, city: .04, jungle: .03, ocean: .01 },
  warp: { rainbow: 1, glow: 1, spiral: .34, loop: .4, wave: .66, liquid: 1, keys: .28, sky: .5, widen: 1 },
  fx: { sat: .88, hue: 1, rgb: .68, wave: .64, trails: .58, ripple: .5, kaleido: .72, tunnel: .5, melt: .16, posterize: .3, flash: .8 },
  v: { speed: 29, starBoost: 1, cloudFace: 1, sunGlasses: 1, moonFace: 1 } },
{ t: 206, level: 10, worlds: { climax: .58, abstract: .14, tropical: .1, space: .1, city: .04, jungle: .03, ocean: .01 },
  warp: { rainbow: 1, glow: 1, spiral: .4, loop: .46, wave: .74, liquid: 1, keys: .24, sky: .7, widen: 1.02 },
  fx: { sat: 1, hue: 1, rgb: .8, wave: .74, trails: .6, ripple: .6, kaleido: .9, tunnel: .66, melt: .18, posterize: .35 },
  v: { speed: 30, starBoost: 1 } },
{ t: 220.5, level: 10, worlds: { climax: .6, space: .2, abstract: .2 },
  warp: { rainbow: 1, glow: 1, spiral: .42, loop: .48, wave: .7, liquid: 1, sky: 1.1, widen: 1 },
  fx: { sat: 1, hue: 1, rgb: .85, wave: .72, trails: .62, ripple: .6, kaleido: 1, tunnel: .8, melt: .16 },
  v: { speed: 31, starBoost: 1 } },
{ t: 232, level: 10, worlds: { climax: .6, space: .26, abstract: .14 },
  warp: { rainbow: 1, glow: 1, spiral: .4, loop: .45, wave: .6, liquid: 1, sky: 1.5, widen: 1 },
  fx: { sat: 1, hue: 1, rgb: .88, wave: .68, trails: .62, ripple: .58, kaleido: 1, tunnel: .85, melt: .14 },
  v: { speed: 32, starBoost: 1 } },

/* ===== RETURN  3:58-4:26 (bar 132-147) — ハットが抜けて減衰 ===== */
{ t: 238.6, level: 10, worlds: { white: 1 },
  warp: { rainbow: .3, glow: 1, sky: .3, widen: 1 },
  fx: { bright: 2.5, sat: -.5, trails: .3, flash: .9 },
  v: { speed: 28 } },
{ t: 242, level: 2, worlds: { night: 1 },
  warp: {}, fx: { bright: 1.1, trails: .1, vignette: .2 },
  v: { speed: 24, signSet: 'none' } },
{ t: 248, level: 0, worlds: { night: 1 },
  warp: {}, fx: { vignette: .25 },
  v: { speed: 22, signSet: 'none' } },
{ t: 266, level: 0, worlds: { night: 1 },
  warp: {}, fx: { vignette: .25 },
  v: { speed: 18, signSet: 'none' } }
];

const EVENTS = [
  /* 同じ猫が3回現れる */
  { t: 12,  type: 'cat' },
  { t: 16,  type: 'cat' },
  { t: 20,  type: 'cat' },
  { t: 15,  type: 'hueBlip', amount: .12 },
  { t: 24,  type: 'hueBlip', amount: .16 },
  { t: 31,  type: 'hueBlip', amount: .22 },

  { t: 34.4, type: 'shimmer' },
  { t: 65.1, type: 'whoosh' },
  { t: 82,   type: 'closeUp', dur: 3.0 },
  { t: 95.8, type: 'whoosh' },
  { t: 118,  type: 'closeUp', dur: 2.4 },
  { t: 138,  type: 'whoosh' },
  { t: 164,  type: 'shimmer' },

  { t: 176.6, type: 'whoosh' },
  { t: 178.4, type: 'tunnelIn' },
  { t: 190.8, type: 'tunnelOut' },

  { t: 206,  type: 'closeUp', dur: 2.8 },
  { t: 214,  type: 'fireworks' },
  { t: 228,  type: 'fireworks' },
  { t: 232,  type: 'whoosh' },
  { t: 238.2, type: 'whiteout' },
  { t: 246,  type: 'musicOut' }
];

window.PX = window.PX || {};
window.PX.STAGES = window.PX.STAGES || {};
window.PX.STAGES.stage1 = {
  id: 'stage1',
  title: 'STAGE 1 — MIDNIGHT MUSHROOM DRIVE',
  track: 'song',        // data/track_song.js
  driveEnd: 258,        // ここでドライブ終了 → 帰宅シーンへ（曲の減衰に重なる）
  signSets: SIGNS,
  keys: K,
  events: EVENTS
};
})();
