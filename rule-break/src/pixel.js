// pixel.js -- a 5x7 bitmap font and 8x8 sprites, drawn dot by dot.
// Everything on the board is made of squares; nothing is anti-aliased.

const F = {
  A: '01110 10001 10001 11111 10001 10001 10001',
  B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110',
  D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111',
  F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111',
  H: '10001 10001 10001 11111 10001 10001 10001',
  I: '11111 00100 00100 00100 00100 00100 11111',
  J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001',
  L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001',
  N: '10001 11001 10101 10011 10001 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110',
  P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101',
  R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110',
  T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110',
  V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 11011 10001',
  X: '10001 01010 00100 00100 00100 01010 10001',
  Y: '10001 01010 00100 00100 00100 00100 00100',
  Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110',
  1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00110 01000 10000 11111',
  3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010',
  5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110',
  7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110',
  9: '01110 10001 10001 01111 00001 00010 01100',
  ' ': '00000 00000 00000 00000 00000 00000 00000',
  '=': '00000 00000 11111 00000 11111 00000 00000',
  '/': '00001 00010 00010 00100 01000 01000 10000',
  '.': '00000 00000 00000 00000 00000 01100 01100',
  ',': '00000 00000 00000 00000 01100 01100 11000',
  ':': '00000 01100 01100 00000 01100 01100 00000',
  '!': '00100 00100 00100 00100 00100 00000 00100',
  '?': '01110 10001 00001 00110 00100 00000 00100',
  '-': '00000 00000 00000 11111 00000 00000 00000',
  '+': '00000 00100 00100 11111 00100 00100 00000',
  '#': '01010 01010 11111 01010 11111 01010 01010',
  '*': '00000 10101 01110 11111 01110 10101 00000',
  '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000',
  '<': '00010 00100 01000 10000 01000 00100 00010',
  '>': '01000 00100 00010 00001 00010 00100 01000',
  '|': '00100 00100 00100 00100 00100 00100 00100',
  '_': '00000 00000 00000 00000 00000 00000 11111',
  '%': '11001 11010 00010 00100 01000 01011 10011',
  '^': '00100 01110 10101 00100 00100 00100 00100',
  '~': '00000 00000 01001 10110 00000 00000 00000',
};

const glyphCache = new Map();
function glyph(ch) {
  const key = String(ch).toUpperCase();
  if (glyphCache.has(key)) return glyphCache.get(key);
  const raw = F[key] || F['?'];
  const rows = raw.split(' ');
  glyphCache.set(key, rows);
  return rows;
}

export const GLYPH_W = 5, GLYPH_H = 7;

// Draw text where every "pixel" is a px-by-px square.
export function drawText(c, text, x, y, px = 2, color = '#e8e8e8', spacing = 1) {
  c.fillStyle = color;
  let cx = x;
  for (const ch of String(text)) {
    const rows = glyph(ch);
    for (let ry = 0; ry < GLYPH_H; ry++) {
      const row = rows[ry] || '';
      for (let rx = 0; rx < GLYPH_W; rx++) {
        if (row[rx] === '1') c.fillRect(cx + rx * px, y + ry * px, px, px);
      }
    }
    cx += (GLYPH_W + spacing) * px;
  }
  return cx - x;
}

export function textWidth(text, px = 2, spacing = 1) {
  return String(text).length * (GLYPH_W + spacing) * px - spacing * px;
}

// ---------------------------------------------------------------- sprites

// 8x8 sprites. '.' transparent, '1' main colour, '2' accent, '3' shade.
const S = {
  player: [
    '..1111..',
    '.111111.',
    '11111111',
    '11111111',
    '11111111',
    '11111111',
    '.111111.',
    '..1111..'],
  goal: [
    '..2222..',
    '.2....2.',
    '2..22..2',
    '2.2222.2',
    '2.2222.2',
    '2..22..2',
    '.2....2.',
    '..2222..'],
  box: [
    '11111111',
    '1......1',
    '1.1111.1',
    '1.1..1.1',
    '1.1..1.1',
    '1.1111.1',
    '1......1',
    '11111111'],
  key: [
    '..111...',
    '.1...1..',
    '.1...1..',
    '..111...',
    '...1....',
    '...111..',
    '...1....',
    '...11...'],
  door: [
    '11111111',
    '1......1',
    '1......1',
    '1....2.1',
    '1....2.1',
    '1......1',
    '1......1',
    '11111111'],
  enemy: [
    '.1....1.',
    '..1111..',
    '.111111.',
    '11.11.11',
    '11111111',
    '1.1111.1',
    '1.1..1.1',
    '..1..1..'],
  switch: [
    '........',
    '........',
    '..1111..',
    '.122221.',
    '.122221.',
    '..1111..',
    '........',
    '........'],
  ghost: [
    '..1111..',
    '.111111.',
    '11.11.11',
    '11111111',
    '11111111',
    '11111111',
    '1.1.1.1.',
    '.1.1.1.1'],
  hole: [
    '........',
    '.111111.',
    '11....11',
    '1......1',
    '1......1',
    '11....11',
    '.111111.',
    '........'],
};

export function drawSprite(c, name, x, y, px, color = '#e8e8e8', accent = '#7ad1ff') {
  const s = S[name];
  if (!s) return;
  for (let ry = 0; ry < 8; ry++) {
    for (let rx = 0; rx < 8; rx++) {
      const v = s[ry][rx];
      if (v === '.') continue;
      c.fillStyle = v === '2' ? accent : color;
      c.fillRect(x + rx * px, y + ry * px, px, px);
    }
  }
}

// Eyes drawn on top of the player so facing is always readable.
export function drawFace(c, dir, x, y, px, color = '#0a0a0a') {
  const eye = (ex, ey) => c.fillRect(x + ex * px, y + ey * px, px, px);
  c.fillStyle = color;
  const p = { up: [[2, 2], [5, 2]], down: [[2, 5], [5, 5]], left: [[1, 3], [1, 5]], right: [[6, 3], [6, 5]] }[dir]
    || [[2, 3], [5, 3]];
  for (const [ex, ey] of p) eye(ex, ey);
}

// Tile fills: each tile is its own little dot pattern so the board reads as art.
export function drawTile(c, type, x, y, px, theme) {
  const fill = (col) => { c.fillStyle = col; c.fillRect(x, y, px * 8, px * 8); };
  const dot = (dx, dy, col) => { c.fillStyle = col; c.fillRect(x + dx * px, y + dy * px, px, px); };
  switch (type) {
    case 'wall':
      fill(theme.wall);
      dot(1, 1, theme.wallDot); dot(5, 2, theme.wallDot);
      dot(2, 5, theme.wallDot); dot(6, 6, theme.wallDot);
      break;
    case 'redwall':
      fill(theme.red);
      for (let i = 1; i < 8; i += 3) for (let j = 1; j < 8; j += 3) dot(i, j, theme.redDot);
      break;
    case 'bluewall':
      fill(theme.blueW);
      for (let i = 1; i < 8; i += 3) for (let j = 1; j < 8; j += 3) dot(i, j, theme.blueWDot);
      break;
    case 'glass':
      c.strokeStyle = theme.glass;
      c.lineWidth = Math.max(1, px / 2);
      c.strokeRect(x + px, y + px, px * 6, px * 6);
      dot(0, 0, theme.glass); dot(7, 0, theme.glass); dot(0, 7, theme.glass); dot(7, 7, theme.glass);
      break;
    case 'grate':
      fill(theme.floor);
      for (let i = 0; i < 8; i++) { dot(i, 2, theme.grate); dot(i, 5, theme.grate); dot(2, i, theme.grate); dot(5, i, theme.grate); }
      break;
    case 'bluefloor':
      fill(theme.blueF);
      dot(1, 1, theme.blueFDot); dot(6, 1, theme.blueFDot); dot(1, 6, theme.blueFDot); dot(6, 6, theme.blueFDot);
      break;
    case 'yellowfloor':
      fill(theme.yellowF);
      dot(3, 3, theme.yellowFDot); dot(4, 4, theme.yellowFDot);
      break;
    case 'hole':
      fill(theme.bg);
      drawSprite(c, 'hole', x, y, px, theme.holeEdge, theme.holeEdge);
      break;
    case 'void':
      break;
    default:
      fill(theme.floor);
      dot(3, 3, theme.floorDot);
      break;
  }
}
