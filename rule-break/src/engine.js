// engine.js -- the whole game world, with no DOM in sight.
//
// Every law of a stage arrives as data (tiles, hidden_rules, win_conditions...)
// so adding a stage never means touching this file. The renderer and the UI
// only read state and push actions in.

import { ev, test } from './expr.js';
import { semanticsFrom, hasProp, canDo, identityHolds, NOUN_OBJ, nounForTile } from './sentence.js';

export const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const DIR_ORDER = ['up', 'right', 'down', 'left'];

// Tile behaviour that stages inherit unless their legend overrides it.
export const TILE_DEFAULTS = {
  floor: { solid: false },
  wall: { solid: true },
  redwall: { solid: true },
  bluewall: { solid: true },
  bluefloor: { solid: false },
  yellowfloor: { solid: false },
  glass: { solid: { op: '==', a: { v: 'parity' }, b: 1 } }, // solid on odd turns
  hole: { solid: false, deadly: true },
  void: { solid: true, empty: true },
  ice: { solid: false },
};

const clone = (o) => JSON.parse(JSON.stringify(o));

let uid = 0;
const nextId = () => 'o' + (++uid);

export class Game {
  constructor(stage, opts = {}) {
    this.stage = stage;
    this.globals = opts.globals || {};
    this.discovered = opts.discovered || {};   // ruleId -> true (player figured it out)
    this.onEvent = opts.onEvent || (() => {});
    this.meta = { undos: 0, resets: 0, inputs: 0, evalTick: 0 };
    // Root rules edited after the title breaks. Stages marked rootLocked
    // sit outside them.
    this.rootFlags = (stage.rootLocked || stage.nullStage) ? {} : (opts.rootFlags || {});
    this.events = [];
    this.reset(true);
  }

  // ---------------------------------------------------------------- setup

  reset(hard = false) {
    const st = this.stage;
    const rows = st.grid.rows;
    const w = st.grid.w ?? rows[0].length;
    const h = st.grid.h ?? rows.length;
    const tiles = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = (rows[y] || '')[x] ?? ' ';
        tiles.push(this.tileTypeOf(ch));
      }
    }
    this.s = {
      w, h, tiles,
      objs: [],
      turn: st.turn_conditions?.startTurn ?? 0,
      facing: st.facing || 'up',
      lastDir: null,
      streak: { up: 0, down: 0, left: 0, right: 0 },
      visits: {},
      flags: clone(st.flags || {}),
      rot: 0,
      zoom: 1,
      view: st.view ? { ...st.view } : { x: 0, y: 0, w, h },
      pushes: 0,
      boxPushes: {},
      keys: {},
      trail: [],
      firedOnce: {},
      dead: false,
      won: false,
      note: [],
      ...clone(this.rootFlags || {}),
    };
    for (const o of st.objects || []) {
      if (o.spawnIf !== undefined && !test(o.spawnIf, this.ctx())) continue;
      this.s.objs.push({ id: o.id || nextId(), ...clone(o) });
    }
    this.history = [];
    this.events = [];
    // The full timeline. Undo rewinds the world, but not the record of it --
    // which is what a ghost is replaying.
    this.meta.fullTrail = [{ x: this.playerX, y: this.playerY }];
    this.s.trail.push({ x: this.playerX, y: this.playerY });
    if (!hard) this.meta.resets++;
    this.fire('start', {});
    this.fire('onReset', {});
    this.checkWin();
  }

  tileTypeOf(ch) {
    const lg = this.stage.grid.legend || {};
    const d = lg[ch];
    if (typeof d === 'string') return d;
    if (d && d.type) return d.type;
    return { '#': 'wall', '.': 'floor', ' ': 'void', 'r': 'redwall', 'b': 'bluefloor',
      'y': 'yellowfloor', 'g': 'glass', 'o': 'hole', '~': 'void' }[ch] || 'floor';
  }

  tileDef(type) {
    const lg = this.stage.grid.legend || {};
    for (const d of Object.values(lg)) {
      if (d && typeof d === 'object' && d.type === type) return { ...TILE_DEFAULTS[type], ...d };
    }
    return TILE_DEFAULTS[type] || { solid: false };
  }

  // ---------------------------------------------------------------- lookups

  get player() { return this.s.objs.find((o) => o.kind === 'player'); }
  get playerX() { return this.player ? this.player.x : -1; }
  get playerY() { return this.player ? this.player.y : -1; }
  get goal() { return this.s.objs.find((o) => o.kind === 'goal'); }

  objsAt(x, y) { return this.s.objs.filter((o) => o.x === x && o.y === y); }
  firstOf(kind) { return this.s.objs.find((o) => o.kind === kind); }
  byRef(ref) {
    if (!ref) return null;
    if (ref[0] === '#') return this.s.objs.find((o) => o.id === ref.slice(1));
    return this.firstOf(ref);
  }
  tileAt(x, y) {
    if (x < 0 || y < 0 || x >= this.s.w || y >= this.s.h) return 'void';
    return this.s.tiles[y * this.s.w + x];
  }
  setTile(x, y, type) {
    if (x < 0 || y < 0 || x >= this.s.w || y >= this.s.h) return;
    this.s.tiles[y * this.s.w + x] = type;
  }
  visitsAt(x, y) { return this.s.visits[x + ',' + y] || 0; }

  // ---------------------------------------------------------------- semantics

  semantics() {
    const words = this.s.objs.filter((o) => o.kind === 'word');
    // Solidity is queried many times per move; re-parsing the board's
    // sentences every time is pure waste while nothing has moved.
    const sig = this.meta.evalTick + '|' + words.map((o) => o.x + ',' + o.y + ',' + o.text).join(';');
    if (this._semSig === sig) return this._sem;
    const st = this.stage;
    const def = st.semantics_defaults || (st.use_sentences
      ? null
      : { props: { WALL: ['SOLID'], RED: ['SOLID'], BOX: ['PUSH'], PLAYER: ['YOU'], GOAL: ['CLEAR'] } });
    this._sem = semanticsFrom(words, this.s.w, this.s.h, this.meta.evalTick, def);
    this._semSig = sig;
    return this._sem;
  }

  hasSentence(text) {
    const want = String(text).toUpperCase().replace(/\s+/g, ' ').trim();
    return this.semantics().sentences.some((s) => s === want);
  }

  // ---------------------------------------------------------------- context

  ctx(extra = {}) {
    const g = this;
    const s = this.s;
    return {
      extra,
      get: (path) => {
        const p = String(path);
        if (p.startsWith('flag.')) return digInto(s.flags, p.slice(5));
        if (p.startsWith('global.')) return digInto(g.globals, p.slice(7));
        if (p.startsWith('streak.')) return s.streak[p.slice(7)] || 0;
        if (p.startsWith('key.')) return !!s.keys[p.slice(4)];
        if (p.startsWith('ui.')) return digInto(extra.ui || {}, p.slice(3));
        if (p.startsWith('arg.')) return digInto(extra, p.slice(4));
        switch (p) {
          case 'turn': case 'moves': return s.turn;
          case 'parity': return ((s.turn + (s.flags.parityFlip || 0)) % 2 + 2) % 2;
          case 'undos': return g.meta.undos;
          case 'resets': return g.meta.resets;
          case 'inputs': return g.meta.inputs;
          case 'facing': return s.facing;
          case 'dir': return extra.dir ?? s.lastDir;
          case 'lastDir': return s.lastDir;
          case 'px': return g.playerX;
          case 'py': return g.playerY;
          case 'gx': return g.goal ? g.goal.x : -1;
          case 'gy': return g.goal ? g.goal.y : -1;
          case 'rot': return s.rot;
          case 'zoomed': return !!s.flags.zoomed;
          case 'pushes': return s.pushes;
          case 'w': return s.w;
          case 'h': return s.h;
          case 'tileHere': return g.tileAt(g.playerX, g.playerY);
          case 'visitsHere': return g.visitsAt(g.playerX, g.playerY);
          case 'prevX': return (s.from || {}).x ?? -1;
          case 'prevY': return (s.from || {}).y ?? -1;
          case 'visitsPrev': return s.from ? g.visitsAt(s.from.x, s.from.y) : 0;
          case 'onGoal': return !!(g.goal && g.goal.x === g.playerX && g.goal.y === g.playerY);
          case 'trailLen': return s.trail.length;
          case 'evalTick': return g.meta.evalTick;
          case 'boxes': return s.objs.filter((o) => o.kind === 'box').length;
          case 'enemies': return s.objs.filter((o) => o.kind === 'enemy').length;
          case 'ghosts': return s.objs.filter((o) => o.kind === 'ghost').length;
          case 'words': return s.objs.filter((o) => o.kind === 'word').length;
          default: return digInto(s.flags, p);
        }
      },
      getGlobal: (k) => digInto(g.globals, k),
      hasSentence: (t) => g.hasSentence(t),
      tileAt: (x, y) => g.tileAt(x, y),
      objAt: (x, y) => { const o = g.objsAt(x, y)[0]; return o ? o.kind : ''; },
      countObj: (k) => s.objs.filter((o) => o.kind === k).length,
      objProp: (ref, prop) => { const o = g.byRef(ref); return o ? o[prop] : undefined; },
      visitsAt: (x, y) => g.visitsAt(x, y),
      labelOf: (ref) => { const o = g.byRef(ref); return o ? String(o.label ?? '') : ''; },
      textAt: (x, y) => {
        const o = g.objsAt(x, y).find((q) => q.kind === 'word');
        return o ? String(o.text).toUpperCase() : '';
      },
      sameCell: (a, b) => {
        const A = g.byRef(a), B = g.byRef(b);
        return !!(A && B && A.x === B.x && A.y === B.y);
      },
    };
  }

  // ---------------------------------------------------------------- rules

  orderedRules() {
    const rules = this.stage.hidden_rules || [];
    const pri = this.stage.rule_priority;
    if (!pri || !pri.length) return rules;
    const idx = new Map(pri.map((id, i) => [id, i]));
    return [...rules].sort((a, b) => (idx.has(a.id) ? idx.get(a.id) : 999) - (idx.has(b.id) ? idx.get(b.id) : 999));
  }

  fire(when, extra = {}) {
    const out = { cancel: false, redirect: null, fired: [] };
    for (const rule of this.orderedRules()) {
      if (rule.when !== when) continue;
      if (rule.once && this.s.firedOnce[rule.id]) continue;
      const ctx = this.ctx({ ...extra, rule });
      if (!test(rule.if, ctx)) continue;
      if (rule.once) this.s.firedOnce[rule.id] = true;
      out.fired.push(rule.id);
      for (const eff of rule.then || []) this.applyEffect(eff, ctx, out, rule);
      if (rule.note) this.observe(rule.note, rule.id);
      this.emit({ t: 'rule', id: rule.id, when });
    }
    return out;
  }

  applyEffect(eff, ctx, out, rule) {
    const A = (k, d) => (eff[k] === undefined ? d : ev(eff[k], ctx));
    const s = this.s;
    switch (eff.do) {
      case 'cancel': out.cancel = true; break;
      case 'redirect': out.redirect = A('dir'); break;
      case 'setFlag': setDeep(s.flags, A('flag'), A('value', true)); break;
      case 'addFlag': {
        const k = A('flag');
        setDeep(s.flags, k, (digInto(s.flags, k) || 0) + A('by', 1));
        break;
      }
      case 'toggleFlag': {
        const k = A('flag');
        setDeep(s.flags, k, !digInto(s.flags, k));
        break;
      }
      case 'setGlobal': setDeep(this.globals, A('key'), A('value', true)); break;
      case 'setTile': this.setTile(A('x', this.playerX), A('y', this.playerY), A('to', 'wall')); break;
      case 'setTileHere': this.setTile(this.playerX, this.playerY, A('to', 'wall')); break;
      case 'setTilePrev': {
        const p = s.from;
        if (p) this.setTile(p.x, p.y, A('to', 'wall'));
        break;
      }
      case 'addTurn': s.turn += A('by', 1); break;
      case 'setTurn': s.turn = A('to', 0); break;
      case 'moveObj': {
        const o = this.byRef(A('ref', 'goal'));
        if (!o) break;
        let dx = A('dx', 0), dy = A('dy', 0);
        const mode = A('dir', null);
        if (mode) {
          const base = DIRS[mode === 'opposite' ? opposite(ctx.get('dir') || s.lastDir || 'up')
            : mode === 'same' ? (ctx.get('dir') || s.lastDir || 'up') : mode];
          if (base) { dx = base[0] * A('by', 1); dy = base[1] * A('by', 1); }
        }
        const nx = o.x + dx, ny = o.y + dy;
        const force = A('force', false);
        if (force !== true) {
          if (force === 'objects') {
            // Slides under boxes and doors, but still respects the walls.
            const t = this.tileDef(this.tileAt(nx, ny));
            let solid = t.solid;
            if (typeof solid === 'object') solid = test(solid, this.ctx({ tx: nx, ty: ny }));
            if (solid) break;
          } else if (this.solidFor(nx, ny, o)) break;
        }
        o.x = nx; o.y = ny;
        break;
      }
      case 'teleport': {
        const o = this.byRef(A('ref', 'player'));
        if (o) { o.x = A('x', o.x); o.y = A('y', o.y); }
        break;
      }
      case 'swap': {
        const a = this.byRef(A('a', 'player')), b = this.byRef(A('b', 'box'));
        if (a && b) { const t = { x: a.x, y: a.y }; a.x = b.x; a.y = b.y; b.x = t.x; b.y = t.y; }
        break;
      }
      case 'spawn': {
        const o = { id: nextId(), kind: A('kind', 'box'), x: A('x', 0), y: A('y', 0), ...(eff.props || {}) };
        s.objs.push(o);
        break;
      }
      case 'remove': {
        const o = this.byRef(A('ref', 'box'));
        if (o) s.objs.splice(s.objs.indexOf(o), 1);
        break;
      }
      case 'removeAll': {
        const k = A('kind', 'enemy');
        s.objs = s.objs.filter((o) => o.kind !== k);
        break;
      }
      case 'setProp': {
        const o = this.byRef(A('ref', 'player'));
        if (o) o[A('prop', 'label')] = A('value', '');
        break;
      }
      case 'setLabel': {
        const o = this.byRef(A('ref', 'door'));
        if (o) o.label = String(A('value', ''));
        break;
      }
      case 'flipGravity': s.flags.gravDir = s.flags.gravDir === 'up' ? 'down' : 'up'; break;
      case 'setGravity': s.flags.gravDir = A('dir', 'down'); break;
      case 'rotate': s.rot = (((s.rot + A('by', 90)) % 360) + 360) % 360; break;
      case 'setView': s.view = { x: A('x', 0), y: A('y', 0), w: A('w', s.w), h: A('h', s.h) }; break;
      case 'spawnGhost': {
        const from = A('from', 0);
        const src = A('source', 'state') === 'full' ? (this.meta.fullTrail || []) : s.trail;
        const path = src.slice(from).map((p) => ({ ...p }));
        if (path.length) s.objs.push({ id: nextId(), kind: 'ghost', x: path[0].x, y: path[0].y, path, i: 0 });
        break;
      }
      case 'revive': {
        const dead = (s.flags.graveyard || []);
        for (const d of dead) s.objs.push({ id: nextId(), ...d });
        s.flags.graveyard = [];
        break;
      }
      case 'win': s.won = true; break;
      case 'fail': s.dead = true; break;
      case 'note': this.observe(A('text', ''), rule && rule.id); break;
      case 'discover': this.discover(A('rule', rule && rule.id)); break;
      case 'unlock': this.emit({ t: 'unlock', stage: A('stage', '') }); break;
      case 'flash': this.emit({ t: 'flash', text: A('text', ''), color: A('color', '#fff') }); break;
      case 'sound': this.emit({ t: 'sound', name: A('name', 'blip') }); break;
      default: this.emit({ t: 'unknownEffect', name: eff.do });
    }
  }

  // ---------------------------------------------------------------- physics

  // Is (x,y) impassable for `who`? Consults tile rules first, then the board's
  // rule sentences, then objects standing there.
  solidFor(x, y, who = null) {
    if (x < 0 || y < 0 || x >= this.s.w || y >= this.s.h) return true;
    const type = this.tileAt(x, y);
    const def = this.tileDef(type);
    const sem = this.semantics();

    // On sentence-driven stages the words on the board decide what a wall is;
    // everywhere else the tile keeps its own law.
    const noun = nounForTile(type);
    if (noun && this.stage.use_sentences) {
      if (hasProp(sem, noun, 'SOLID') || hasProp(sem, noun, 'STOP')) return true;
      return false;
    }
    if (this.s.flags.rootWallSoft && (type === 'wall' || type === 'redwall' || type === 'bluewall')) {
      // The player edited "WALL IS SOLID" out of the root rules.
      for (const o of this.objsAt(x, y)) if (o !== who && this.objSolid(o, who, sem)) return true;
      return false;
    }
    let solid = def.solid;
    if (typeof solid === 'object') solid = test(solid, this.ctx({ tx: x, ty: y }));
    if (solid) return true;

    for (const o of this.objsAt(x, y)) {
      if (o === who) continue;
      if (this.objSolid(o, who, sem)) return true;
    }
    return false;
  }

  objSolid(o, who, sem = this.semantics()) {
    if (o.kind === 'box') return true;             // handled by the push pass
    if (o.kind === 'word') return !this.stage.words_walkable;
    if (o.kind === 'door') return !this.doorOpen(o);
    if (o.kind === 'enemy') return false;          // walking in gets you caught
    if (o.solid !== undefined) return !!o.solid;
    const noun = Object.keys(NOUN_OBJ).find((n) => NOUN_OBJ[n] === o.kind);
    if (noun && hasProp(sem, noun, 'SOLID')) return true;
    return false;
  }

  doorOpen(d) {
    if (d.open) return true;
    if (d.needs && this.s.keys[d.needs]) return true;
    if (d.link) {
      return this.s.objs.some((o) => o.kind === 'switch' && o.link === d.link
        && this.s.objs.some((p) => p !== o && p.x === o.x && p.y === o.y && ['player', 'box', 'ghost'].includes(p.kind)));
    }
    if (d.openIf) return test(d.openIf, this.ctx());
    return false;
  }

  pushable(o, sem = this.semantics()) {
    if (o.push === false) return false;   // bolted down: bumping it does something else
    if (o.kind === 'box') return true;
    if (o.kind === 'word') return !!this.stage.words_pushable;
    const noun = Object.keys(NOUN_OBJ).find((n) => NOUN_OBJ[n] === o.kind);
    return !!(noun && hasProp(sem, noun, 'PUSH'));
  }

  // ---------------------------------------------------------------- actions

  apply(action) {
    if (this.s.won) return { ok: false, reason: 'won' };
    this.meta.inputs++;
    switch (action.type) {
      case 'move': return this.move(action.dir);
      case 'wait': return this.commitTurn({ moved: false });
      case 'undo': return this.undo();
      case 'reset': this.reset(false); return { ok: true };
      case 'ui': return this.uiAction(action.name, action.args || {});
      default: return { ok: false, reason: 'unknown action' };
    }
  }

  snapshot() { return { s: clone(this.s) }; }
  restore(snap) { this.s = clone(snap.s); }
  pushHistory() { this.history.push(this.snapshot()); if (this.history.length > 4000) this.history.shift(); }

  // Screen direction -> world direction (the board can be rotated).
  worldDir(dir) {
    const steps = ((this.s.rot / 90) | 0) % 4;
    const i = DIR_ORDER.indexOf(dir);
    if (i < 0) return dir;
    return DIR_ORDER[(i + steps + 4) % 4];
  }

  move(screenDir) {
    const before = this.snapshot();
    let dir = this.worldDir(screenDir);
    if (this.s.flags.mirrorInput) dir = opposite(dir);

    const p = this.player;
    if (!p) { this.emit({ t: 'noPlayer' }); return { ok: false, reason: 'no player' }; }
    this.s.from = { x: p.x, y: p.y };

    // Rules get to see where the move is aiming before it happens.
    const aim = DIRS[dir] || [0, 0];
    const pre = this.fire('beforeMove', { dir, screenDir, tx: p.x + aim[0], ty: p.y + aim[1] });
    if (pre.redirect) dir = pre.redirect;
    if (pre.cancel) { this.pushHistoryFrom(before); return this.commitTurn({ moved: false, blocked: true, dir }); }

    const sem = this.semantics();
    if (this.stage.use_sentences && !hasProp(sem, 'PLAYER', 'YOU') && !sem.props.PLAYER) {
      // Nothing is "you" any more.
      this.emit({ t: 'notYou' });
      return { ok: false, reason: 'not you' };
    }
    if (this.stage.use_sentences && sem.can.PLAYER && !canDo(sem, 'PLAYER', 'MOVE')) {
      this.emit({ t: 'cannotMove' });
      return { ok: false, reason: 'cannot move' };
    }

    this.s.facing = dir;
    const [dx, dy] = DIRS[dir];
    const nx = p.x + dx, ny = p.y + dy;

    // Push chain.
    const pushed = this.objsAt(nx, ny).filter((o) => this.pushable(o, sem));
    if (pushed.length) {
      const chain = this.pushChain(nx, ny, dx, dy, sem);
      if (!chain) {
        this.pushHistoryFrom(before);
        this.fire('moveBlocked', { dir, byBox: true });
        return this.commitTurn({ moved: false, blocked: true, dir });
      }
      this.pushHistoryFrom(before);
      const ordered = [...chain].reverse(); // farthest first, so nothing overlaps mid-push
      for (const o of ordered) {
        o.x += dx; o.y += dy;
        o.pushed = (o.pushed || 0) + 1;
        this.s.boxPushes[o.id] = o.pushed;
      }
      const lead = ordered[0];
      if (lead && lead.slide) {
        for (let guard = 0; guard < 64; guard++) {
          const tx = lead.x + dx, ty = lead.y + dy;
          if (this.solidFor(tx, ty, lead)) break;
          if (this.objsAt(tx, ty).some((o) => o.kind === 'player')) break;
          lead.x = tx; lead.y = ty;
        }
      }
      this.s.pushes++;
      p.x = nx; p.y = ny;
      this.fire('onPush', { dir, count: chain.length, ref: '#' + chain[0].id });
      return this.commitTurn({ moved: true, dir, pushed: true });
    }

    if (this.solidFor(nx, ny, p)) {
      this.pushHistoryFrom(before);
      const blocker = this.objsAt(nx, ny).find((o) => this.objSolid(o, p, sem));
      this.fire('moveBlocked', { dir, tile: this.tileAt(nx, ny), by: blocker ? blocker.kind : this.tileAt(nx, ny), ref: blocker ? '#' + blocker.id : null });
      this.observeBlocked(nx, ny);
      return this.commitTurn({ moved: false, blocked: true, dir });
    }

    this.pushHistoryFrom(before);
    p.x = nx; p.y = ny;
    return this.commitTurn({ moved: true, dir });
  }

  pushHistoryFrom(snap) { this.history.push(snap); }

  pushChain(x, y, dx, dy, sem) {
    const chain = [];
    let cx = x, cy = y;
    for (let guard = 0; guard < 64; guard++) {
      const here = this.objsAt(cx, cy).filter((o) => this.pushable(o, sem));
      if (!here.length) break;
      chain.push(...here);
      cx += dx; cy += dy;
      if (cx < 0 || cy < 0 || cx >= this.s.w || cy >= this.s.h) return null;
      const t = this.tileDef(this.tileAt(cx, cy));
      let solid = t.solid;
      if (typeof solid === 'object') solid = test(solid, this.ctx({ tx: cx, ty: cy }));
      if (solid && !t.boxPass) return null;   // a grate stops people, not cargo
      const blockers = this.objsAt(cx, cy).filter((o) => !this.pushable(o, sem) && this.objSolid(o, null, sem));
      if (blockers.length) return null;
    }
    return chain.length ? chain : null;
  }

  commitTurn(info) {
    const s = this.s;
    const tc = this.stage.turn_conditions || {};
    if (info.moved) {
      s.lastDir = info.dir;
      for (const d of Object.keys(s.streak)) s.streak[d] = d === info.dir ? s.streak[d] + 1 : 0;
      s.turn += tc.step ?? 1;
    } else if (info.blocked && tc.countBlocked) {
      s.turn += tc.step ?? 1;
    }
    this.meta.evalTick++;

    if (info.moved) {
      this.fire('onEnter', { tile: this.tileAt(this.playerX, this.playerY), dir: info.dir });
    }
    this.fire('afterMove', { dir: info.dir, moved: !!info.moved, blocked: !!info.blocked });
    this.gravity();
    // Only the cell you come to rest on counts as a place you have been.
    if (info.moved) {
      s.visits[this.playerX + ',' + this.playerY] = this.visitsAt(this.playerX, this.playerY) + 1;
      s.trail.push({ x: this.playerX, y: this.playerY });
      (this.meta.fullTrail || (this.meta.fullTrail = [])).push({ x: this.playerX, y: this.playerY });
      this.pickups();
    }
    this.stepActors(info);
    this.fire('everyTurn', { dir: info.dir });
    this.hazards();
    this.applyExistence();
    this.checkWin();
    this.emit({ t: 'turn', turn: s.turn, moved: !!info.moved });
    return { ok: true, moved: !!info.moved, won: s.won, dead: s.dead };
  }

  pickups() {
    const p = this.player;
    if (!p) return;
    for (const o of this.objsAt(p.x, p.y)) {
      if (o.kind === 'key') {
        this.s.keys[o.keyId || 'k'] = true;
        this.s.objs.splice(this.s.objs.indexOf(o), 1);
        this.emit({ t: 'sound', name: 'get' });
      }
    }
  }

  gravity() {
    const dir = this.s.flags.gravDir;
    if (!dir) return;
    const [dx, dy] = DIRS[dir];
    for (let guard = 0; guard < 64; guard++) {
      let moved = false;
      for (const o of this.s.objs) {
        if (!['player', 'box'].includes(o.kind)) continue;
        if (o.float) continue;
        if (!this.solidFor(o.x + dx, o.y + dy, o)) { o.x += dx; o.y += dy; moved = true; }
      }
      if (!moved) break;
    }
  }

  stepActors(info) {
    for (const o of this.s.objs) {
      if (o.kind === 'ghost') {
        o.i = Math.min((o.i || 0) + 1, o.path.length - 1);
        const p = o.path[o.i];
        o.x = p.x; o.y = p.y;
      }
    }
    if (!info.moved) return;
    for (const e of this.s.objs.filter((o) => o.kind === 'enemy')) this.stepEnemy(e, info);
  }

  stepEnemy(e, info) {
    const p = this.player;
    if (!p) return;
    const behavior = e.behavior || 'chase';
    const tryMove = (dir) => {
      const [dx, dy] = DIRS[dir] || [0, 0];
      if (this.solidFor(e.x + dx, e.y + dy, e)) return false;
      e.x += dx; e.y += dy; return true;
    };
    if (behavior === 'mirror') {
      tryMove(opposite(info.dir));
    } else if (behavior === 'copy') {
      tryMove(info.dir);
    } else if (behavior === 'patrol') {
      // Walks its route; on hitting something it takes the next leg instead.
      const path = e.patrol || ['left', 'right'];
      e.pi = (e.pi || 0) % path.length;
      if (!tryMove(path[e.pi])) {
        e.pi = (e.pi + 1) % path.length;
        tryMove(path[e.pi]);
      }
    } else if (behavior === 'still') {
      // stays put
    } else { // chase: greedy, longest axis first
      const dx = p.x - e.x, dy = p.y - e.y;
      const order = Math.abs(dx) >= Math.abs(dy)
        ? [dx > 0 ? 'right' : 'left', dy > 0 ? 'down' : 'up']
        : [dy > 0 ? 'down' : 'up', dx > 0 ? 'right' : 'left'];
      for (const d of order) { if ((d === 'right' && dx === 0) || (d === 'left' && dx === 0) || (d === 'down' && dy === 0) || (d === 'up' && dy === 0)) continue; if (tryMove(d)) break; }
    }
  }

  hazards() {
    const p = this.player;
    if (!p) return;
    const def = this.tileDef(this.tileAt(p.x, p.y));
    if (def.deadly) { this.s.dead = true; this.emit({ t: 'dead', why: 'hole' }); }
    if (this.s.objs.some((o) => o.kind === 'enemy' && o.x === p.x && o.y === p.y)) {
      this.s.dead = true; this.emit({ t: 'dead', why: 'enemy' });
    }
  }

  // "PLAYER EXISTS" / "GOAL EXISTS" literally control whether things are there.
  applyExistence() {
    if (!this.stage.existence_kinds) return;
    const sem = this.semantics();
    for (const noun of this.stage.existence_kinds) {
      const kind = NOUN_OBJ[noun] || noun.toLowerCase();
      const have = this.s.objs.find((o) => o.kind === kind);
      const should = sem.exists.has(noun);
      if (should && !have) {
        const sp = (this.stage.spawns || {})[noun] || { x: 1, y: 1 };
        this.s.objs.push({ id: nextId(), kind, x: sp.x, y: sp.y });
        this.emit({ t: 'sound', name: 'discover' });
      } else if (!should && have) {
        this.s.objs.splice(this.s.objs.indexOf(have), 1);
      }
    }
  }

  undo() {
    if (!this.history.length) { this.emit({ t: 'noUndo' }); return { ok: false, reason: 'empty' }; }
    const snap = this.history.pop();
    this.restore(snap);
    this.meta.undos++;
    this.meta.evalTick++;
    this.fire('onUndo', { undos: this.meta.undos });
    this.applyExistence();
    this.checkWin();
    this.emit({ t: 'undo', undos: this.meta.undos });
    return { ok: true, won: this.s.won };
  }

  // ---------------------------------------------------------------- UI as gameplay

  allows(name) {
    const list = this.stage.available_ui_actions || ['undo', 'reset'];
    if (!list.includes(name)) return false;
    // A stage may also say *when* an action works -- a board that only turns
    // while you stand on the pivot, for instance.
    const cond = (this.stage.ui_conditions || {})[name];
    return cond === undefined ? true : test(cond, this.ctx());
  }

  uiAction(name, args) {
    if (!this.allows(name)) { this.emit({ t: 'uiRefused', name }); return { ok: false, reason: 'not available' }; }
    const s = this.s;
    const before = this.snapshot();
    let handled = true;
    switch (name) {
      case 'zoom':
        this.pushHistoryFrom(before);
        s.flags.zoomed = !s.flags.zoomed;
        s.view = s.flags.zoomed ? { x: 0, y: 0, w: s.w, h: s.h } : { ...(this.stage.view || { x: 0, y: 0, w: s.w, h: s.h }) };
        break;
      case 'rotate': {
        this.pushHistoryFrom(before);
        const by = args.by ?? this.stage.rotate_step ?? 90;
        s.rot = (((s.rot + by) % 360) + 360) % 360;
        // Turning the screen turns which way is down.
        if (s.flags.gravDir) {
          const steps = (((by / 90) | 0) % 4 + 4) % 4;
          const i = DIR_ORDER.indexOf(s.flags.gravDir);
          if (i >= 0) s.flags.gravDir = DIR_ORDER[(i + steps) % 4];
        }
        break;
      }
      case 'closeNote':
        this.pushHistoryFrom(before);
        s.flags.noteClosed = !s.flags.noteClosed;
        break;
      case 'tapTitle':
        this.pushHistoryFrom(before);
        s.flags.titleTaps = (s.flags.titleTaps || 0) + 1;
        break;
      case 'dropUI': { // drag a UI label (RESET, UNDO, MOVES...) onto the board
        const { item, x, y } = args;
        if (this.solidFor(x, y, null)) { handled = false; break; }
        this.pushHistoryFrom(before);
        const base = 'ui_' + String(item).toUpperCase();
        let wid = base, n = 1;
        while (s.objs.some((o) => o.id === wid)) wid = base + '_' + (++n);
        s.objs.push({ id: wid, kind: 'word', text: String(item).toUpperCase(), x, y, fromUI: true });
        break;
      }
      case 'dropChar': { // pull a character out of a UI label and graft it onto an object
        const { char, ref } = args;
        const o = this.byRef(ref);
        if (!o) { handled = false; break; }
        // Where the character lands is a property of the target -- the board
        // draws the empty slot -- never of where the finger happened to fall.
        const mode = args.mode || (o.slot === 'pre' ? 'prepend' : 'append');
        this.pushHistoryFrom(before);
        const cur = String(o.label ?? '');
        o.label = mode === 'set' ? String(char)
          : mode === 'prepend' ? String(char) + cur
          : cur + String(char);
        o.filled = true;
        break;
      }
      case 'splitWord': { // RESET -> RE + SET
        const o = this.byRef(args.ref);
        if (!o || o.kind !== 'word') { handled = false; break; }
        const at = args.at ?? 2;
        const head = o.text.slice(0, at), tail = o.text.slice(at);
        if (!head || !tail) { handled = false; break; }
        this.pushHistoryFrom(before);
        o.text = head;
        s.objs.push({ id: 'ui_' + tail, kind: 'word', text: tail,
          x: args.x ?? o.x, y: args.y ?? o.y, fromUI: o.fromUI });
        break;
      }
      case 'wordDrag': { // pick a word block up and put it somewhere else
        const o = this.byRef(args.ref);
        if (!o || o.kind !== 'word') { handled = false; break; }
        if (this.solidFor(args.x, args.y, o)) { handled = false; break; }
        this.pushHistoryFrom(before);
        o.x = args.x; o.y = args.y;
        break;
      }
      case 'dragBoard':
        s.view = { ...s.view, x: args.x ?? s.view.x, y: args.y ?? s.view.y };
        break;
      default:
        this.pushHistoryFrom(before);
        s.flags['ui_' + name] = (s.flags['ui_' + name] || 0) + 1;
    }
    if (!handled) { this.emit({ t: 'uiFailed', name }); return { ok: false }; }
    this.meta.evalTick++;
    const res = this.fire('onUI', { ui: { name, ...args } });
    if ((this.stage.turn_conditions || {}).uiCountsTurn) s.turn += 1;
    this.gravity();
    this.applyExistence();
    this.checkWin();
    this.emit({ t: 'ui', name, args });
    return { ok: true, won: s.won, fired: res.fired };
  }

  // ---------------------------------------------------------------- winning

  checkWin() {
    if (this.s.dead) return false;
    const pre = this.fire('beforeWin', {});
    if (pre.cancel) return false;
    const conds = this.stage.win_conditions;
    let won;
    if (conds && conds.length) {
      won = conds.every((c) => test(c, this.ctx()));
    } else {
      won = this.defaultWin();
    }
    if (won && !this.s.won) {
      this.s.won = true;
      this.emit({ t: 'win' });
    } else if (!won && this.s.won) {
      this.s.won = false;
    }
    if (!won) this.observeNearMiss();
    return won;
  }

  defaultWin() {
    const sem = this.semantics();
    const p = this.player;
    if (!p) return false;
    if (identityHolds(sem, 'PLAYER', 'GOAL') && this.goal) return true;
    const winNouns = Object.keys(sem.props).filter((n) => hasProp(sem, n, 'WIN') || hasProp(sem, n, 'CLEAR'));
    // "BOX IS GOAL" makes boxes count as goals too.
    for (const [a, b] of sem.ident) {
      if (winNouns.includes(b) && !winNouns.includes(a)) winNouns.push(a);
      if (winNouns.includes(a) && !winNouns.includes(b)) winNouns.push(b);
    }
    const kinds = winNouns.map((n) => NOUN_OBJ[n]).filter(Boolean);
    if (!kinds.length) kinds.push('goal');
    return this.s.objs.some((o) => kinds.includes(o.kind) && o.x === p.x && o.y === p.y);
  }

  // ---------------------------------------------------------------- notes

  observe(text, ruleId) {
    const key = text;
    if (this.s.note.includes(key)) return;
    this.s.note.push(key);
    this.emit({ t: 'observe', text, ruleId });
  }

  observeBlocked(x, y) {
    const t = this.tileAt(x, y);
    if (t === 'wall' || t === 'void') return;
    this.observe(`${labelOfTile(t)}に阻まれた (${this.s.turn}手目)`);
  }

  observeNearMiss() {
    const p = this.player, g = this.goal;
    if (p && g && p.x === g.x && p.y === g.y) this.observe(`ゴールに触れた → 何も起きない (${this.s.turn}手目)`);
  }

  discover(ruleId) {
    if (!ruleId || this.discovered[ruleId]) return false;
    this.discovered[ruleId] = true;
    const rule = (this.stage.hidden_rules || []).find((r) => r.id === ruleId);
    this.emit({ t: 'discover', id: ruleId, name: rule ? rule.name : ruleId });
    return true;
  }

  emit(e) { this.events.push(e); this.onEvent(e); }
  drain() { const e = this.events; this.events = []; return e; }
}

// ---------------------------------------------------------------- helpers

export function opposite(dir) {
  return { up: 'down', down: 'up', left: 'right', right: 'left' }[dir] || dir;
}

function labelOfTile(t) {
  return { redwall: '赤い壁', bluewall: '青い壁', glass: '透明な壁', wall: '壁', void: '外', door: '扉' }[t] || t;
}

function digInto(obj, path) {
  let cur = obj;
  for (const part of String(path).split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[part];
  }
  return cur;
}

function setDeep(obj, path, value) {
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}
