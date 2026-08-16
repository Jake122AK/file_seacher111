// audio.js -- small synthesised blips. No files, no loading, no music.
let ctx = null;
let muted = false;

function ac() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setMuted(v) { muted = v; }
export function isMuted() { return muted; }

function tone({ freq = 440, dur = 0.08, type = 'square', gain = 0.06, slide = 0, delay = 0 }) {
  if (muted) return;
  let a;
  try { a = ac(); } catch { return; }
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

export const SFX = {
  step: () => tone({ freq: 220, dur: 0.03, gain: 0.03 }),
  blip: () => tone({ freq: 660, dur: 0.05, gain: 0.04 }),
  err: () => tone({ freq: 110, dur: 0.09, type: 'sawtooth', gain: 0.05 }),
  thud: () => tone({ freq: 90, dur: 0.12, type: 'triangle', gain: 0.07 }),
  low: () => tone({ freq: 70, dur: 0.3, type: 'sine', gain: 0.09 }),
  get: () => { tone({ freq: 880, dur: 0.05 }); tone({ freq: 1320, dur: 0.06, delay: 0.05 }); },
  warp: () => { tone({ freq: 200, dur: 0.18, slide: 900, type: 'sawtooth', gain: 0.05 }); },
  ui: () => tone({ freq: 520, dur: 0.03, gain: 0.03 }),
  discover: () => {
    tone({ freq: 55, dur: 0.6, type: 'sine', gain: 0.12 });
    tone({ freq: 330, dur: 0.1, delay: 0.05 });
    tone({ freq: 440, dur: 0.1, delay: 0.16 });
    tone({ freq: 660, dur: 0.22, delay: 0.27 });
  },
  win: () => {
    tone({ freq: 523, dur: 0.08 });
    tone({ freq: 659, dur: 0.08, delay: 0.08 });
    tone({ freq: 784, dur: 0.08, delay: 0.16 });
    tone({ freq: 1046, dur: 0.22, delay: 0.24 });
  },
  dead: () => tone({ freq: 160, dur: 0.35, slide: -120, type: 'sawtooth', gain: 0.07 }),
};

export function play(name) { (SFX[name] || SFX.blip)(); }
