// render.js -- draws the world as dots on a canvas, and answers the only
// question the input layer asks: "which cell is under this finger?"

import { drawTile, drawSprite, drawFace, drawText, textWidth } from './pixel.js';

export const THEME = {
  bg: '#050505',
  floor: '#141414', floorDot: '#242424',
  wall: '#2e2e2e', wallDot: '#414141',
  red: '#5a1220', redDot: '#c8324a',
  blueW: '#12325a', blueWDot: '#3a86d8',
  blueF: '#0e2438', blueFDot: '#3a86d8',
  yellowF: '#3a3212', yellowFDot: '#d8c23a',
  glass: '#2c4a52',
  grate: '#4a4a4a',
  holeEdge: '#2a2a2a',
  player: '#f2f2f2', goal: '#7ad1ff', box: '#c8a45a', key: '#d8c23a',
  door: '#a06a3a', enemy: '#e04a5a', sw: '#8a8a8a', ghost: '#4a6a7a',
  word: '#e8e8e8', wordBg: '#1c1c24', wordUi: '#d8c23a',
  mark: '#4a4a4a', frame: '#2a2a2a',
};

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d');
    this.px = 4;
    this.ox = 0; this.oy = 0;
    this.rot = 0;
    this.userZoom = 1;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.dpr = dpr;
    this.cssW = r.width; this.cssH = r.height;
  }

  layout(game) {
    const v = game.s.view;
    const c = this.canvas;
    const pad = 8 * this.dpr;
    const px = Math.max(1, Math.floor(Math.min(
      (c.width - pad * 2) / (v.w * 8),
      (c.height - pad * 2) / (v.h * 8))));
    this.px = px;
    this.cell = px * 8;
    this.ox = Math.round((c.width - v.w * this.cell) / 2 - v.x * this.cell);
    this.oy = Math.round((c.height - v.h * this.cell) / 2 - v.y * this.cell);
    this.rot = game.s.rot || 0;
    this.cx = c.width / 2; this.cy = c.height / 2;
  }

  applyTransform() {
    const c = this.c;
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (this.rot) {
      c.translate(this.cx, this.cy);
      c.rotate((-this.rot * Math.PI) / 180);
      c.translate(-this.cx, -this.cy);
    }
  }

  // screen (css px) -> board cell, undoing rotation and centring
  cellAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    let x = (clientX - r.left) * this.dpr;
    let y = (clientY - r.top) * this.dpr;
    if (this.rot) {
      const a = (this.rot * Math.PI) / 180;   // inverse of -rot
      const dx = x - this.cx, dy = y - this.cy;
      x = this.cx + dx * Math.cos(a) - dy * Math.sin(a);
      y = this.cy + dx * Math.sin(a) + dy * Math.cos(a);
    }
    return {
      x: Math.floor((x - this.ox) / this.cell),
      y: Math.floor((y - this.oy) / this.cell),
    };
  }

  // board cell -> page coordinates (css px), applying the same rotation as draw()
  screenOf(gx, gy) {
    const r = this.canvas.getBoundingClientRect();
    let x = this.ox + gx * this.cell + this.cell / 2;
    let y = this.oy + gy * this.cell + this.cell / 2;
    if (this.rot) {
      const a = (-this.rot * Math.PI) / 180;
      const dx = x - this.cx, dy = y - this.cy;
      x = this.cx + dx * Math.cos(a) - dy * Math.sin(a);
      y = this.cy + dx * Math.sin(a) + dy * Math.cos(a);
    }
    return { x: r.left + x / this.dpr, y: r.top + y / this.dpr };
  }

  cellRect(gx, gy) {
    return { x: this.ox + gx * this.cell, y: this.oy + gy * this.cell, s: this.cell };
  }

  draw(game, opts = {}) {
    const c = this.c;
    const s = game.s;
    this.layout(game);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = THEME.bg;
    c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    this.applyTransform();

    const v = s.view;
    const zoomedOut = v.w > (game.stage.view?.w ?? v.w) || v.h > (game.stage.view?.h ?? v.h);

    // tiles
    for (let y = 0; y < s.h; y++) {
      for (let x = 0; x < s.w; x++) {
        const t = game.tileAt(x, y);
        if (t === 'void') continue;
        const r = this.cellRect(x, y);
        const outside = x < v.x || y < v.y || x >= v.x + v.w || y >= v.y + v.h;
        if (outside && !zoomedOut) continue;
        c.globalAlpha = outside ? 0.35 : 1;
        drawTile(c, t, r.x, r.y, this.px, THEME);
        c.globalAlpha = 1;
      }
    }

    // floor marks: the evidence that was always there
    for (const m of game.stage.marks || []) {
      const r = this.cellRect(m.x, m.y);
      const w = textWidth(m.g, this.px);
      drawText(c, m.g, r.x + (this.cell - w) / 2, r.y + (this.cell - this.px * 7) / 2, this.px, THEME.mark);
    }

    // the frame the stage claims to be
    if (game.stage.view) {
      c.strokeStyle = THEME.frame;
      c.lineWidth = Math.max(1, this.px / 2);
      const a = this.cellRect(game.stage.view.x, game.stage.view.y);
      c.strokeRect(a.x, a.y, game.stage.view.w * this.cell, game.stage.view.h * this.cell);
    }

    // a line of text written on the world itself (FINAL says its own name)
    if (game.stage.banner) {
      const scale = Math.max(1, Math.floor(this.px * 0.9));
      const w = textWidth(game.stage.banner, scale);
      drawText(c, game.stage.banner,
        this.ox + (v.x + v.w / 2) * this.cell - w / 2,
        this.oy + (v.y + v.h / 2) * this.cell - scale * 3.5, scale, '#2e2e2e');
    }

    // objects
    const order = { switch: 0, door: 1, goal: 2, key: 3, box: 4, word: 5, ghost: 6, enemy: 7, player: 8 };
    const objs = [...s.objs].sort((a, b) => (order[a.kind] ?? 5) - (order[b.kind] ?? 5));
    for (const o of objs) {
      const r = this.cellRect(o.x, o.y);
      const outside = o.x < v.x || o.y < v.y || o.x >= v.x + v.w || o.y >= v.y + v.h;
      if (outside && !zoomedOut) continue;
      this.drawObject(game, o, r, opts);
    }

    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  drawObject(game, o, r, opts) {
    const c = this.c;
    const px = this.px;
    switch (o.kind) {
      case 'player':
        drawSprite(c, 'player', r.x, r.y, px, THEME.player);
        drawFace(c, game.s.facing, r.x, r.y, px, THEME.bg);
        break;
      case 'ghost':
        c.globalAlpha = 0.55;
        drawSprite(c, 'ghost', r.x, r.y, px, THEME.ghost);
        c.globalAlpha = 1;
        break;
      case 'goal':
        drawSprite(c, 'goal', r.x, r.y, px, THEME.goal, THEME.goal);
        break;
      case 'box':
        drawSprite(c, 'box', r.x, r.y, px, o.push === false ? THEME.sw : THEME.box);
        break;
      case 'key': drawSprite(c, 'key', r.x, r.y, px, THEME.key); break;
      case 'switch': drawSprite(c, 'switch', r.x, r.y, px, THEME.sw, THEME.goal); break;
      case 'enemy': drawSprite(c, 'enemy', r.x, r.y, px, THEME.enemy); break;
      case 'door': {
        const open = game.doorOpen(o);
        c.globalAlpha = open ? 0.35 : 1;
        drawSprite(c, 'door', r.x, r.y, px, THEME.door, THEME.key);
        c.globalAlpha = 1;
        if (o.label !== undefined) {
          const w = textWidth(o.label, px);
          drawText(c, o.label, r.x + (this.cell - w) / 2, r.y + this.cell - px * 8, px, THEME.key);
        }
        break;
      }
      case 'word': {
        const sel = opts.selectedWord === o.id;
        c.fillStyle = sel ? '#3a3a4a' : THEME.wordBg;
        c.fillRect(r.x + px, r.y + px, this.cell - px * 2, this.cell - px * 2);
        c.strokeStyle = o.fromUI ? THEME.wordUi : '#3a3a44';
        c.lineWidth = Math.max(1, px / 2);
        c.strokeRect(r.x + px, r.y + px, this.cell - px * 2, this.cell - px * 2);
        const scale = Math.max(1, Math.floor((this.cell - px * 4) / (o.text.length * 6)));
        const w = textWidth(o.text, scale);
        drawText(c, o.text, r.x + (this.cell - w) / 2, r.y + (this.cell - scale * 7) / 2, scale,
          o.fromUI ? THEME.wordUi : THEME.word);
        break;
      }
      default:
        drawSprite(c, 'box', r.x, r.y, px, '#888');
    }
  }
}
