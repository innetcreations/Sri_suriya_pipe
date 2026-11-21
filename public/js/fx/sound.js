// WebAudio synthesised UI sounds. No audio files. Never starts before a user gesture.
const AC = window.AudioContext || window.webkitAudioContext;
const PACKS = ['water', 'soft', 'classic', 'neon', 'festive', 'spooky', 'fireworks', 'patriotic'];
const PENTA = [523.25, 587.33, 659.25, 783.99, 880, 1046.5];

let ctx = null; let master = null; let comp = null;
let enabled = false; let volume = 0.45; let pack = 'water'; let cfg = {};
let lastHover = 0; let ambientNode = null; const buffers = new Map();

function ensure() {
  if (!AC) return null;
  if (!ctx) {
    ctx = new AC();
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 6;
    master = ctx.createGain(); master.gain.value = volume;
    master.connect(comp); comp.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

// one enveloped oscillator
function tone({ f = 440, f2 = null, type = 'sine', dur = 0.12, vol = 0.18, delay = 0, attack = 0.005, lp = 0 }) {
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(); const g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let node = o;
  if (lp) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); node = fl; }
  node.connect(g); g.connect(master);
  o.start(t0); o.stop(t0 + dur + 0.05);
}
function noise({ dur = 0.2, vol = 0.1, delay = 0, hp = 800, lp = 6000, q = 0.7 }) {
  const t0 = ctx.currentTime + delay;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const s = ctx.createBufferSource(); s.buffer = buf;
  const h = ctx.createBiquadFilter(); h.type = 'highpass'; h.frequency.value = hp;
  const l = ctx.createBiquadFilter(); l.type = 'lowpass'; l.frequency.value = lp; l.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(h); h.connect(l); l.connect(g); g.connect(master); s.start(t0);
}
const jit = (v, p = 0.06) => v * (1 + (Math.random() * 2 - 1) * p);

// ── sound definitions per pack: name -> function
const water = {
  click: () => { tone({ f: jit(620), f2: jit(980), dur: 0.09, vol: 0.14 }); },
  hover: () => { tone({ f: jit(900), f2: jit(1100), dur: 0.05, vol: 0.04 }); },
  open: () => { tone({ f: 420, f2: 880, dur: 0.18, vol: 0.14 }); noise({ dur: 0.18, vol: 0.03, hp: 1500 }); },
  close: () => { tone({ f: 800, f2: 380, dur: 0.14, vol: 0.12 }); },
  add: () => { tone({ f: 520, f2: 1040, dur: 0.1, vol: 0.15 }); tone({ f: 780, f2: 1560, dur: 0.12, vol: 0.12, delay: 0.07 }); },
  remove: () => { tone({ f: 600, f2: 240, dur: 0.14, vol: 0.13 }); },
  toggle: () => { tone({ f: jit(700), f2: jit(1100), dur: 0.08, vol: 0.12 }); },
  success: () => { [523, 659, 784, 1047].forEach((f, i) => tone({ f, f2: f * 1.25, dur: 0.16, vol: 0.13, delay: i * 0.09 })); },
  error: () => { tone({ f: 220, f2: 150, type: 'triangle', dur: 0.22, vol: 0.16 }); tone({ f: 200, f2: 130, type: 'triangle', dur: 0.22, vol: 0.12, delay: 0.14 }); },
  notify: () => { tone({ f: 880, dur: 0.12, vol: 0.12 }); tone({ f: 1175, dur: 0.18, vol: 0.1, delay: 0.1 }); },
  whoosh: () => { noise({ dur: 0.35, vol: 0.08, hp: 400, lp: 3000 }); },
  drop: () => { tone({ f: 1200, f2: 300, dur: 0.12, vol: 0.14 }); },
};
const soft = {
  ...water,
  click: () => tone({ f: jit(300), type: 'sine', dur: 0.06, vol: 0.12, lp: 1400 }),
  hover: () => tone({ f: jit(420), dur: 0.035, vol: 0.03, lp: 1200 }),
  add: () => { tone({ f: 392, dur: 0.1, vol: 0.12, lp: 2000 }); tone({ f: 523, dur: 0.14, vol: 0.1, delay: 0.08, lp: 2000 }); },
  success: () => [392, 494, 587].forEach((f, i) => tone({ f, dur: 0.2, vol: 0.11, delay: i * 0.1, lp: 2400 })),
};
const classic = {
  ...water,
  click: () => { tone({ f: jit(520), type: 'triangle', dur: 0.07, vol: 0.14 }); tone({ f: 1040, type: 'sine', dur: 0.04, vol: 0.05 }); },
  hover: () => tone({ f: jit(660), type: 'triangle', dur: 0.04, vol: 0.04 }),
  add: () => { tone({ f: 523, type: 'triangle', dur: 0.14, vol: 0.14 }); tone({ f: 659, type: 'triangle', dur: 0.18, vol: 0.12, delay: 0.1 }); },
  success: () => [392, 523, 659, 784].forEach((f, i) => tone({ f, type: 'triangle', dur: 0.28, vol: 0.12, delay: i * 0.1 })),
};
const neon = {
  ...water,
  click: () => tone({ f: jit(880), type: 'square', dur: 0.05, vol: 0.06, lp: 3000 }),
  hover: () => tone({ f: jit(1320), type: 'square', dur: 0.025, vol: 0.02, lp: 3000 }),
  add: () => { tone({ f: 660, type: 'square', dur: 0.06, vol: 0.06 }); tone({ f: 990, type: 'square', dur: 0.08, vol: 0.06, delay: 0.06 }); },
  success: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone({ f, type: 'square', dur: 0.08, vol: 0.05, delay: i * 0.06, lp: 3500 })),
};
const festive = {
  ...water,
  click: () => { const f = PENTA[(Math.random() * PENTA.length) | 0]; tone({ f, dur: 0.22, vol: 0.1 }); tone({ f: f * 2, dur: 0.14, vol: 0.04 }); },
  hover: () => tone({ f: PENTA[(Math.random() * PENTA.length) | 0] * 2, dur: 0.06, vol: 0.025 }),
  add: () => PENTA.slice(0, 3).forEach((f, i) => tone({ f, dur: 0.2, vol: 0.1, delay: i * 0.07 })),
  success: () => PENTA.forEach((f, i) => tone({ f, dur: 0.3, vol: 0.09, delay: i * 0.08 })),
};
const spooky = {
  ...water,
  click: () => tone({ f: jit(330), f2: jit(262), type: 'sawtooth', dur: 0.14, vol: 0.05, lp: 900 }),
  hover: () => tone({ f: jit(180), f2: 150, type: 'sine', dur: 0.08, vol: 0.04 }),
  add: () => { tone({ f: 294, f2: 349, type: 'sawtooth', dur: 0.18, vol: 0.05, lp: 1100 }); tone({ f: 233, f2: 277, type: 'sawtooth', dur: 0.22, vol: 0.05, delay: 0.1, lp: 1100 }); },
  success: () => [220, 262, 330, 440].forEach((f, i) => tone({ f, f2: f * 1.03, type: 'sawtooth', dur: 0.3, vol: 0.05, delay: i * 0.1, lp: 1200 })),
};
const fireworks = {
  ...water,
  click: () => { noise({ dur: 0.1, vol: 0.09, hp: 1500, lp: 8000 }); tone({ f: 1400, f2: 300, dur: 0.1, vol: 0.06 }); },
  hover: () => noise({ dur: 0.03, vol: 0.02, hp: 4000 }),
  add: () => { tone({ f: 500, f2: 1500, dur: 0.18, vol: 0.08 }); noise({ dur: 0.14, vol: 0.08, hp: 2500, delay: 0.17 }); },
  success: () => { for (let i = 0; i < 4; i++) { noise({ dur: 0.18, vol: 0.07, hp: 2000, delay: i * 0.12 }); tone({ f: 1800 - i * 200, f2: 400, dur: 0.14, vol: 0.05, delay: i * 0.12 }); } },
};
const patriotic = {
  ...water,
  click: () => { tone({ f: jit(196), type: 'triangle', dur: 0.1, vol: 0.14 }); noise({ dur: 0.04, vol: 0.05, hp: 600, lp: 2500 }); },
  hover: () => tone({ f: jit(392), type: 'triangle', dur: 0.04, vol: 0.03 }),
  add: () => { tone({ f: 392, type: 'sawtooth', dur: 0.1, vol: 0.06, lp: 1800 }); tone({ f: 523, type: 'sawtooth', dur: 0.16, vol: 0.06, delay: 0.1, lp: 1800 }); },
  success: () => [392, 392, 523, 659].forEach((f, i) => tone({ f, type: 'sawtooth', dur: 0.2, vol: 0.06, delay: i * 0.12, lp: 2000 })),
};
const LIB = { water, soft, classic, neon, festive, spooky, fireworks, patriotic };

async function playCustom(name) {
  const url = cfg.sounds && cfg.sounds[name];
  if (!url) return false;
  try {
    let b = buffers.get(url);
    if (!b) {
      const r = await fetch(url, { credentials: 'omit' }); if (!r.ok) throw new Error('bad');
      b = await ctx.decodeAudioData(await r.arrayBuffer()); buffers.set(url, b);
    }
    const s = ctx.createBufferSource(); s.buffer = b; s.connect(master); s.start();
    return true;
  } catch { if (cfg.sounds) cfg.sounds[name] = ''; return false; }
}

export const sound = {
  PACKS,
  init(config = {}) {
    cfg = config || {};
    const fx = cfg.fx || {};
    volume = Math.min(1, Math.max(0, Number(fx.soundVolume) || 0.45));
    pack = LIB[cfg.theme && cfg.theme.soundPack] ? cfg.theme.soundPack : 'water';
    let stored = null; try { stored = localStorage.getItem('ssp:sound'); } catch { /* storage blocked */ }
    enabled = stored === null ? !!fx.soundDefaultOn : stored === '1';
  },
  isEnabled: () => enabled,
  enable() { enabled = true; try { localStorage.setItem('ssp:sound', '1'); } catch { /* ignore */ } if (ensure()) { master.gain.value = volume; this.play('toggle'); } },
  disable() { enabled = false; try { localStorage.setItem('ssp:sound', '0'); } catch { /* ignore */ } this.ambient(false); },
  toggle() { enabled ? this.disable() : this.enable(); return enabled; },
  setVolume(v) { volume = Math.min(1, Math.max(0, v)); if (master) master.gain.value = volume; },
  setPack(n) { if (LIB[n]) pack = n; },
  // Called from user gestures only (the caller guarantees this); `unlock` just prepares the context.
  unlock() { if (enabled) ensure(); },
  play(name = 'click') {
    if (!enabled || !AC) return;
    if (!ensure() || ctx.state !== 'running') return;
    if (name === 'hover') { const n = performance.now(); if (n - lastHover < 90) return; lastHover = n; }
    try {
      if (cfg.sounds && cfg.sounds[name]) { playCustom(name).then((ok) => { if (!ok) (LIB[pack][name] || LIB.water[name] || (() => {}))(); }); return; }
      (LIB[pack][name] || LIB.water[name] || LIB.water.click)();
    } catch { /* audio must never break the page */ }
  },
  ambient(on) {
    if (!ctx) return;
    if (!on) { if (ambientNode) { try { ambientNode.stop(); } catch { /* ignore */ } ambientNode = null; } return; }
    if (ambientNode || !enabled || !(cfg.fx && cfg.fx.ambient)) return;
    const len = ctx.sampleRate * 3; const buf = ctx.createBuffer(1, len, ctx.sampleRate); const d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 600; f.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0.05;
    s.connect(f); f.connect(g); g.connect(master); s.start(); ambientNode = s;
  },
};
