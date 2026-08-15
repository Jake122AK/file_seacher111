/* =====================================================================
   audio.js — WebAudio 音楽エンジン + Conductor(音楽時計)
   ---------------------------------------------------------------------
   ・完成楽曲がまだ無いので、TrackDef からプロシージャルに演奏する。
   ・TrackDef.audioUrl を指定すれば実楽曲に差し替わり、
     Conductor は音源の currentTime から拍を割り出す（合成音は自動で停止）。
   ・ドラムグリッド(kick/snare/hat/bass)は視覚側のエンベロープ源も兼ねる。
     → 実曲を入れる場合もグリッドだけ書けば世界が同期する。
   ===================================================================== */
(function (PX) {
'use strict';
const M = PX.M;

/* --------------------------------------------------------- Conductor */
class Conductor {
  constructor(track) {
    this.track = track;
    this.bpm = track.bpm;
    this.spb = 60 / track.bpm;              // seconds per beat
    this.bpBar = track.beatsPerBar || 4;
    this.time = 0;      // 曲頭からの秒数
    this.beat = 0;      // 拍（小数）
    this.bar = 0;
    this.beatPhase = 0; this.barPhase = 0;
    this.beatIndex = -1; this.barIndex = -1;
    this.step = 0; this.stepIndex = -1;     // 16分
    this.section = track.sections[0];
    this.sectionIndex = 0;
    this.sectionT = 0;                       // セクション内進行 0..1
    this.energy = 0;
    this.onBeat = false; this.onBar = false; this.onStep = false;
    this.env = { kick: 0, snare: 0, hat: 0, bass: 0, chord: 0 };
    this.pulse = 0;      // 総合的な「ドン」感 0..1
    this.swing = track.swing || 0;
    /* 実音源のエンベロープがあればそれを使う。
       無ければ patterns のドラムグリッドから逆算する（仮トラック用）。 */
    this.envData = null;
    if (track.env) {
      const dec = (b64) => {
        const bin = atob(b64);
        const a = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        return a;
      };
      this.envData = {
        fps: track.env.fps,
        low: dec(track.env.low), mid: dec(track.env.mid), high: dec(track.env.high)
      };
      this.slowLow = 0; this.slowHigh = 0; this.slowMid = 0;
    }
  }
  set(time) {
    const t = this.time = time;
    const b = this.beat = t / this.spb;
    this.bar = b / this.bpBar;
    const bi = Math.floor(b), bri = Math.floor(this.bar);
    this.onBeat = bi !== this.beatIndex; this.beatIndex = bi;
    this.onBar = bri !== this.barIndex; this.barIndex = bri;
    this.beatPhase = b - bi;
    this.barPhase = this.bar - bri;
    const st = this.step = b * 4;
    const sti = Math.floor(st);
    this.onStep = sti !== this.stepIndex; this.stepIndex = sti;

    // section 解決
    const secs = this.track.sections;
    let si = 0;
    for (let i = 0; i < secs.length; i++) if (this.bar >= secs[i].bar) si = i;
    this.sectionIndex = si;
    this.section = secs[si];
    const nextBar = (si + 1 < secs.length) ? secs[si + 1].bar : secs[si].bar + 8;
    this.sectionT = M.sat((this.bar - secs[si].bar) / Math.max(.001, nextBar - secs[si].bar));
    this.energy = secs[si].energy === undefined ? .5 : secs[si].energy;

    const E = this.env;
    if (this.envData) {
      /* 実音源のエンベロープを読む。
         そのままだと常時明るいので、遅い移動平均との差(=トランジェント)を取る。
         これで「キックが鳴った瞬間」だけ世界が脈打つ。 */
      const D = this.envData;
      const i = M.clamp(Math.round(t * D.fps), 0, D.low.length - 1);
      const lo = D.low[i] / 255, mi = D.mid[i] / 255, hi = D.high[i] / 255;
      const k = .18;
      this.slowLow += (lo - this.slowLow) * k;
      this.slowMid += (mi - this.slowMid) * k;
      this.slowHigh += (hi - this.slowHigh) * k;
      E.kick = M.sat((lo - this.slowLow) * 4.5 + lo * .35);
      E.bass = M.sat(lo * 1.15);
      E.hat = M.sat((hi - this.slowHigh) * 5.0 + hi * .30);
      E.snare = M.sat((mi - this.slowMid) * 4.5);
      E.chord = M.sat(mi * 1.1);
    } else {
      // 仮トラック: ドラムグリッドから逆算
      const pat = PX.Track.patternFor(this.track, this.section);
      E.kick = this._envOf(pat.kick, st, 7.5);
      E.snare = this._envOf(pat.snare, st, 9.0);
      E.hat = this._envOf(pat.hat, st, 22.0);
      E.bass = this._envOf(pat.bass, st, 5.0);
      E.chord = this._envOf(pat.skank, st, 8.0);
    }
    this.pulse = M.sat(E.kick * .85 + E.snare * .5 + E.bass * .35);
  }
  _envOf(grid, stepF, decay) {
    if (!grid || !grid.length) return 0;
    const L = grid.length;
    let best = 99;
    const s = Math.floor(stepF);
    for (let back = 0; back < 8; back++) {
      const idx = M.mod(s - back, L);
      if (grid[idx]) { best = (stepF - Math.floor(stepF)) + back; break; }
    }
    if (best > 8) return 0;
    const secs = best * (this.spb / 4);
    return Math.exp(-secs * decay);
  }
}
PX.Conductor = Conductor;

/* ------------------------------------------------------------- Track */
PX.Track = {
  patternFor(track, section) {
    if (!track.patterns) return null;
    const key = section && section.pattern ? section.pattern : 'basic';
    return track.patterns[key] || track.patterns.basic;
  },
  /* section 名から現在の bar を秒に変換 */
  barToTime(track, bar) { return bar * (track.beatsPerBar || 4) * 60 / track.bpm; },
  timeToBar(track, t) { return t / ((track.beatsPerBar || 4) * 60 / track.bpm); },
  duration(track) {
    const last = track.sections[track.sections.length - 1];
    return PX.Track.barToTime(track, last.bar + (last.bars || 8));
  }
};

/* ------------------------------------------------------------- Audio */
const Audio = PX.Audio = {
  ctx: null, ready: false, playing: false,
  track: null,
  startAt: 0,
  master: null, musicGain: null, delay: null, fb: null, sfxGain: null,
  engineNodes: null,
  _lookahead: .18, _timer: null, _nextStep: 0, _stepTime: 0,
  volume: .9,
  externalSource: null, externalBuffer: null,
  muted: false,

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    const ctx = this.ctx = new AC();
    const master = this.master = ctx.createGain();
    master.gain.value = this.volume;
    let out = master;
    if (ctx.createDynamicsCompressor) {
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.knee.value = 24; comp.ratio.value = 4;
      comp.attack.value = .004; comp.release.value = .18;
      master.connect(comp); comp.connect(ctx.destination);
      out = comp;
    } else master.connect(ctx.destination);

    this.musicGain = ctx.createGain(); this.musicGain.gain.value = 1; this.musicGain.connect(master);
    this.sfxGain = ctx.createGain(); this.sfxGain.gain.value = .8; this.sfxGain.connect(master);

    // dub delay
    const d = this.delay = ctx.createDelay(2.0);
    d.delayTime.value = .38;
    const fb = this.fb = ctx.createGain(); fb.gain.value = .38;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    const dOut = this.delayOut = ctx.createGain(); dOut.gain.value = .5;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(dOut); dOut.connect(master);

    this.noiseBuf = this._makeNoise(2.0);
    this.ready = true;
    return true;
  },

  _makeNoise(sec) {
    const ctx = this.ctx, n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  },

  setTrack(track) {
    this.track = track;
    if (this.delay && track.bpm) this.delay.delayTime.value = (60 / track.bpm) * (track.delayBeats || .75);
  },

  /* 実楽曲の差し替え。
     fetch は AudioContext 不要なので、ユーザー操作を待たずに先に落とす。
     デコードは AudioContext ができてから。導入シーンの間に完了する。 */
  preload(url) {
    if (this._pre) return this._pre;
    this._pre = fetch(url).then(r => r.arrayBuffer()).catch(() => null);
    return this._pre;
  },

  async loadExternal(url) {
    if (this.externalBuffer) return this.externalBuffer;
    if (!this.ctx) this.init();
    const ab = await this.preload(url);
    if (!ab) throw new Error('audio fetch failed');
    // decodeAudioData は ArrayBuffer を消費するのでコピーを渡す
    this.externalBuffer = await this.ctx.decodeAudioData(ab.slice(0));
    return this.externalBuffer;
  },

  play(offset) {
    if (!this.ready) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    offset = offset || 0;
    const off0 = (this.track && this.track.offset) || 0;
    this.startAt = this.ctx.currentTime - offset - off0;
    this.playing = true;
    if (this.externalBuffer) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.externalBuffer;
      s.connect(this.musicGain);
      s.start(this.ctx.currentTime, M.clamp(offset + off0, 0, this.externalBuffer.duration - .05));
      this.externalSource = s;
    } else {
      if (!this.track.patterns) return;   // 実音源なら合成演奏はしない
      this._nextStep = Math.floor(offset / (60 / this.track.bpm / 4));
      this._scheduler();
    }
  },

  stop(fade) {
    this.playing = false;
    if (this._timer) { clearTimeout(this._timer); this._timer = null; }
    if (this.externalSource) { try { this.externalSource.stop(); } catch (e) {} this.externalSource = null; }
    if (this.musicGain && fade) {
      const g = this.musicGain.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(0, t + fade);
    }
  },

  fadeMusic(v, sec) {
    if (!this.musicGain) return;
    const g = this.musicGain.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(v, t + (sec || .5));
  },

  /* 曲頭から1拍目までのズレ(track.offset)を引いた「音楽時間」を返す。
     これが Conductor と譜面の共通時計になる。 */
  now() {
    if (!this.ctx) return 0;
    return this.ctx.currentTime - this.startAt - ((this.track && this.track.offset) || 0);
  },

  /* ---------------------------------------------------- 16分スケジューラ */
  _scheduler() {
    if (!this.playing || this.externalBuffer) return;
    const ctx = this.ctx, tr = this.track;
    const stepDur = (60 / tr.bpm) / 4;
    const until = ctx.currentTime + this._lookahead;
    let guard = 0;
    while (this.startAt + this._nextStep * stepDur < until && guard++ < 64) {
      const t = this.startAt + this._nextStep * stepDur;
      if (t >= ctx.currentTime - .05) this._playStep(this._nextStep, t, stepDur);
      this._nextStep++;
    }
    this._timer = setTimeout(() => this._scheduler(), 25);
  },

  _playStep(step, t, stepDur) {
    const tr = this.track;
    if (!tr.patterns) return;
    // AudioContext 生成直後にシークすると t が負になり得るので必ず現在時刻以降へ
    if (t < this.ctx.currentTime) t = this.ctx.currentTime + .001;
    const bar = Math.floor(step / (tr.beatsPerBar * 4));
    let sec = tr.sections[0], si = 0;
    for (let i = 0; i < tr.sections.length; i++) if (bar >= tr.sections[i].bar) { sec = tr.sections[i]; si = i; }
    const pat = PX.Track.patternFor(tr, sec);
    const L = pat.kick.length;
    const s = M.mod(step, L);
    const energy = sec.energy === undefined ? .5 : sec.energy;
    const swing = (s % 2 === 1) ? stepDur * (tr.swing || 0) * .5 : 0;
    const tt = t + swing;
    const mute = sec.mute || {};

    if (pat.kick[s] && !mute.drums) this.kick(tt, .9 * pat.kick[s]);
    if (pat.snare[s] && !mute.drums) this.snare(tt, .55 * pat.snare[s], sec.dub ? .5 : .12);
    if (pat.hat[s] && !mute.drums) this.hat(tt, .30 * pat.hat[s], s % 4 === 2);
    if (pat.perc && pat.perc[s] && !mute.drums) this.perc(tt, .35 * pat.perc[s], 300 + 900 * M.hash(step * .37));
    if (pat.bass[s] && !mute.bass) {
      const note = pat.bassNotes ? pat.bassNotes[M.mod(Math.floor(step / 4), pat.bassNotes.length)] : 0;
      this.bass(tt, tr.root * Math.pow(2, note / 12), stepDur * (pat.bassLen || 2.4), .85);
    }
    if (pat.skank[s] && !mute.chord) {
      const ci = M.mod(Math.floor(step / (tr.beatsPerBar * 4)), (pat.chords || [[0, 3, 7]]).length);
      const ch = (pat.chords || [[0, 3, 7]])[ci];
      this.skank(tt, tr.root * 4, ch, stepDur * 1.1, .17 * (sec.dub ? 1.3 : 1), sec.dub ? .55 : .2);
    }
    if (pat.lead && pat.lead[s] && !mute.lead) {
      const ln = pat.leadNotes ? pat.leadNotes[M.mod(step, pat.leadNotes.length)] : 12;
      this.lead(tt, tr.root * 4 * Math.pow(2, ln / 12), stepDur * 1.8, .13 * energy);
    }
    if (pat.pad && pat.pad[s] && !mute.pad) {
      const ci = M.mod(Math.floor(step / (tr.beatsPerBar * 4)), (pat.chords || [[0, 3, 7]]).length);
      this.pad(tt, tr.root * 2, (pat.chords || [[0, 3, 7]])[ci], stepDur * 14, .075 * energy);
    }
    if (pat.sweep && pat.sweep[s]) this.sweep(tt, stepDur * 16, .22);
  },

  /* ------------------------------------------------------------ 音源群 */
  kick(t, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(135, t);
    o.frequency.exponentialRampToValueAtTime(42, t + .11);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + .004);
    g.gain.exponentialRampToValueAtTime(.001, t + .34);
    o.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + .38);
    // クリック成分
    const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    const ng = c.createGain(); ng.gain.setValueAtTime(v * .22, t); ng.gain.exponentialRampToValueAtTime(.001, t + .03);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    n.connect(f); f.connect(ng); ng.connect(this.musicGain);
    n.start(t); n.stop(t + .05);
  },
  snare(t, v, send) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    n.playbackRate.value = 1 + Math.random() * .1;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = .8;
    const g = c.createGain();
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .16);
    n.connect(f); f.connect(g); g.connect(this.musicGain);
    if (send) { const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(this.delay); }
    n.start(t); n.stop(t + .2);
    const o = c.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(210, t);
    const og = c.createGain(); og.gain.setValueAtTime(v * .5, t); og.gain.exponentialRampToValueAtTime(.001, t + .09);
    o.connect(og); og.connect(this.musicGain); o.start(t); o.stop(t + .1);
  },
  hat(t, v, open) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf;
    n.playbackRate.value = 1.7;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7200;
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(.001, t + (open ? .13 : .045));
    n.connect(f); f.connect(g); g.connect(this.musicGain);
    n.start(t); n.stop(t + .16);
  },
  perc(t, v, freq) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * .6, t + .07);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + .09);
    const s = c.createGain(); s.gain.value = .3;
    o.connect(g); g.connect(this.musicGain); g.connect(s); s.connect(this.delay);
    o.start(t); o.stop(t + .1);
  },
  bass(t, freq, dur, v) {
    const c = this.ctx, o = c.createOscillator(), o2 = c.createOscillator(), g = c.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(freq, t);
    o2.type = 'triangle'; o2.frequency.setValueAtTime(freq * 2.005, t);
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(420, t); f.frequency.exponentialRampToValueAtTime(180, t + dur);
    f.Q.value = 6;
    const g2 = c.createGain(); g2.gain.value = .25;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + .02);
    g.gain.setValueAtTime(v, t + dur * .6);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(this.musicGain);
    o.start(t); o.stop(t + dur + .05); o2.start(t); o2.stop(t + dur + .05);
  },
  skank(t, root, chord, dur, v, send) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + .008);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3200; f.Q.value = 1;
    for (let i = 0; i < chord.length; i++) {
      const o = c.createOscillator();
      o.type = i === 0 ? 'square' : 'sawtooth';
      o.frequency.setValueAtTime(root * Math.pow(2, chord[i] / 12), t);
      o.detune.value = (i - 1) * 6;
      o.connect(f); o.start(t); o.stop(t + dur + .05);
    }
    f.connect(g); g.connect(this.musicGain);
    if (send) { const s = c.createGain(); s.gain.value = send; g.connect(s); s.connect(this.delay); }
  },
  lead(t, freq, dur, v) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(freq, t);
    const f = c.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(900, t + dur);
    f.Q.value = 8;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + .01);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    o.connect(f); f.connect(g); g.connect(this.musicGain);
    const s = c.createGain(); s.gain.value = .45; g.connect(s); s.connect(this.delay);
    o.start(t); o.stop(t + dur + .05);
  },
  pad(t, root, chord, dur, v) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(v, t + dur * .25);
    g.gain.linearRampToValueAtTime(v * .8, t + dur * .7);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1500;
    const lfo = c.createOscillator(); lfo.frequency.value = .17;
    const lg = c.createGain(); lg.gain.value = 600;
    lfo.connect(lg); lg.connect(f.frequency); lfo.start(t); lfo.stop(t + dur);
    for (let i = 0; i < chord.length; i++) {
      for (let d = -1; d <= 1; d += 2) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(root * Math.pow(2, chord[i] / 12), t);
        o.detune.value = d * 7;
        o.connect(f); o.start(t); o.stop(t + dur + .1);
      }
    }
    f.connect(g); g.connect(this.musicGain);
  },
  sweep(t, dur, v) {
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 3;
    f.frequency.setValueAtTime(200, t);
    f.frequency.exponentialRampToValueAtTime(9000, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + dur * .8);
    g.gain.exponentialRampToValueAtTime(.001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.musicGain);
    n.start(t); n.stop(t + dur + .05);
  },

  /* --------------------------------------------------------- エンジン音 */
  startEngine() {
    if (!this.ready || this.engineNodes) return;
    const c = this.ctx;
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 3;
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 62;
    const of_ = c.createBiquadFilter(); of_.type = 'lowpass'; of_.frequency.value = 320;
    const g = c.createGain(); g.gain.value = 0;
    n.connect(f); f.connect(g); o.connect(of_); of_.connect(g);
    g.connect(this.master);
    n.start(); o.start();
    g.gain.linearRampToValueAtTime(.12, c.currentTime + 1.2);
    this.engineNodes = { n, o, f, g, of: of_ };
  },
  setEngine(rpm, level) {
    if (!this.engineNodes) return;
    const c = this.ctx, e = this.engineNodes, t = c.currentTime;
    e.o.frequency.setTargetAtTime(46 + rpm * 90, t, .12);
    e.f.frequency.setTargetAtTime(180 + rpm * 420, t, .12);
    e.g.gain.setTargetAtTime(level === undefined ? .12 : level, t, .25);
  },
  stopEngine(fade) {
    if (!this.engineNodes) return;
    const e = this.engineNodes, t = this.ctx.currentTime;
    e.g.gain.setTargetAtTime(0, t, (fade || 1) * .4);
    const nodes = e; this.engineNodes = null;
    setTimeout(() => { try { nodes.n.stop(); nodes.o.stop(); } catch (err) {} }, (fade || 1) * 2000);
  },

  /* ------------------------------------------------- 判定ヒット音
     ★音ゲー感の要★ プレイヤーの精度が「音楽の一部」として鳴る。
     PERFECT はコンボが伸びるほどペンタトニックを駆け上がり、
     MISS では音楽を一瞬しゃがませて（duck）はっきり分かるようにする。 */
  PENTA: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24],

  hit(grade, combo) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime + .001;
    const tr = this.track || { root: 55 };
    if (grade === 'MISS') {
      // 音楽が一瞬引っ込む（外したことが耳で分かる）
      this.duck(.42, .16);
      const n = c.createBufferSource(); n.buffer = this.noiseBuf;
      const f = c.createBiquadFilter(); f.type = 'lowpass';
      f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(120, t + .25);
      const g = c.createGain();
      g.gain.setValueAtTime(.16, t); g.gain.exponentialRampToValueAtTime(.001, t + .28);
      n.connect(f); f.connect(g); g.connect(this.sfxGain);
      n.start(t); n.stop(t + .3);
      return;
    }
    const deg = this.PENTA[Math.min(this.PENTA.length - 1, (combo | 0) % 8 + (grade === 'PERFECT' ? 2 : 0))];
    const freq = tr.root * 8 * Math.pow(2, deg / 12);
    const bright = grade === 'PERFECT' ? 1 : grade === 'GROOVY' ? .62 : .3;
    const dur = grade === 'GOOD' ? .16 : .38;

    // マリンバ寄りの打点（基音 + 4倍音）
    for (let i = 0; i < 2; i++) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(freq * (i === 0 ? 1 : 4.01), t);
      const amp = (i === 0 ? .13 : .05 * bright) * (grade === 'GOOD' ? .55 : 1);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + .006);
      g.gain.exponentialRampToValueAtTime(.001, t + dur * (i === 0 ? 1 : .45));
      o.connect(g); g.connect(this.sfxGain);
      if (grade === 'PERFECT') { const sd = c.createGain(); sd.gain.value = .35; g.connect(sd); sd.connect(this.delay); }
      o.start(t); o.stop(t + dur + .05);
    }
    // PERFECT はきらめきを足す
    if (grade === 'PERFECT') {
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(freq * 6, t);
      g.gain.setValueAtTime(.035, t); g.gain.exponentialRampToValueAtTime(.001, t + .18);
      o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + .2);
    }
  },

  /* 音楽バスを一瞬しゃがませる */
  duck(amount, sec) {
    if (!this.musicGain) return;
    const g = this.musicGain.gain, t = this.ctx.currentTime;
    const cur = g.value;
    g.cancelScheduledValues(t);
    g.setValueAtTime(cur, t);
    g.linearRampToValueAtTime(cur * (1 - amount), t + .02);
    g.linearRampToValueAtTime(1, t + .02 + (sec || .2));
  },

  /* -------------------------------------------------------------- SFX */
  sfx(name, param) {
    if (!this.ready) return;
    const c = this.ctx, t = c.currentTime;
    switch (name) {
      case 'perfect': {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'triangle';
        const f0 = 900 + (param || 0) * 120;
        o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + .07);
        g.gain.setValueAtTime(.10, t); g.gain.exponentialRampToValueAtTime(.001, t + .1);
        o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + .12);
        break;
      }
      case 'tapMiss': {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sine'; o.frequency.setValueAtTime(160, t);
        g.gain.setValueAtTime(.035, t); g.gain.exponentialRampToValueAtTime(.001, t + .06);
        o.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + .07);
        break;
      }
      case 'miss': {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(90, t + .22);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
        g.gain.setValueAtTime(.09, t); g.gain.exponentialRampToValueAtTime(.001, t + .25);
        o.connect(f); f.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + .28);
        break;
      }
      case 'eat': {
        const n = c.createBufferSource(); n.buffer = this.noiseBuf;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 500; f.Q.value = 1.5;
        const g = c.createGain(); g.gain.setValueAtTime(.22, t); g.gain.exponentialRampToValueAtTime(.001, t + .35);
        f.frequency.setValueAtTime(700, t); f.frequency.exponentialRampToValueAtTime(240, t + .3);
        n.connect(f); f.connect(g); g.connect(this.sfxGain); n.start(t); n.stop(t + .4);
        break;
      }
      case 'door': {
        const n = c.createBufferSource(); n.buffer = this.noiseBuf;
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1200;
        const g = c.createGain(); g.gain.setValueAtTime(.2, t); g.gain.exponentialRampToValueAtTime(.001, t + .18);
        n.connect(f); f.connect(g); g.connect(this.sfxGain); n.start(t); n.stop(t + .2);
        break;
      }
      case 'ignition': {
        const o = c.createOscillator(), g = c.createGain();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(30, t);
        o.frequency.linearRampToValueAtTime(140, t + .55);
        o.frequency.linearRampToValueAtTime(72, t + 1.1);
        const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
        g.gain.setValueAtTime(.001, t); g.gain.linearRampToValueAtTime(.18, t + .12);
        g.gain.linearRampToValueAtTime(.10, t + 1.2);
        g.gain.exponentialRampToValueAtTime(.001, t + 1.5);
        o.connect(f); f.connect(g); g.connect(this.sfxGain); o.start(t); o.stop(t + 1.6);
        break;
      }
      case 'whoosh': {
        const n = c.createBufferSource(); n.buffer = this.noiseBuf;
        const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
        f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(4000, t + .7);
        const g = c.createGain(); g.gain.setValueAtTime(.001, t);
        g.gain.linearRampToValueAtTime(.16, t + .3); g.gain.exponentialRampToValueAtTime(.001, t + .9);
        n.connect(f); f.connect(g); g.connect(this.sfxGain); n.start(t); n.stop(t + 1);
        break;
      }
      case 'shimmer': {
        for (let i = 0; i < 5; i++) {
          const o = c.createOscillator(), g = c.createGain();
          o.type = 'sine'; o.frequency.value = 700 * Math.pow(1.5, i) * (1 + (param || 0) * .1);
          g.gain.setValueAtTime(0, t + i * .03);
          g.gain.linearRampToValueAtTime(.05 / (i + 1), t + i * .03 + .02);
          g.gain.exponentialRampToValueAtTime(.001, t + i * .03 + 1.2);
          o.connect(g); g.connect(this.sfxGain); o.start(t + i * .03); o.stop(t + i * .03 + 1.3);
        }
        break;
      }
    }
  }
};

})(window.PX);
