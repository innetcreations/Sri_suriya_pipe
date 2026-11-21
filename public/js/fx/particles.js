// 2D canvas particle engine. No images, no emoji: everything is drawn with paths and cached sprites.
const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const QUALITY = {
  low: { dpr: 1, cap: 40, mul: 0.5, minDt: 1 / 40, burst: 18 },
  medium: { dpr: 1.5, cap: 90, mul: 0.8, minDt: 0, burst: 30 },
  high: { dpr: 1.75, cap: 160, mul: 1, minDt: 0, burst: 44 },
};

// ---------- colour helpers ----------
const probe = document.createElement('canvas').getContext('2d');
function rgbOf(str, fb) {
  try {
    probe.fillStyle = '#010203';
    probe.fillStyle = String(str).trim();
    const v = probe.fillStyle;
    if (v === '#010203' && !/^#010203$/i.test(String(str).trim())) return fb || [11, 94, 215];
    if (v[0] === '#') return [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)];
    const m = v.match(/[\d.]+/g);
    if (m && m.length >= 3) return [+m[0], +m[1], +m[2]];
  } catch (e) { /* ignore */ }
  return fb || [11, 94, 215];
}
const hexOf = (c) => '#' + ((1 << 24) | (Math.round(c[0]) << 16) | (Math.round(c[1]) << 8) | Math.round(c[2])).toString(16).slice(1);
const mixWhite = (c, t) => c.map((v) => v + (255 - v) * t);
const entry = (rgb) => ({ rgb, hex: hexOf(rgb) });
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function readTheme() {
  const bg = cssVar('--bg');
  let bgc = bg ? rgbOf(bg, [255, 255, 255]) : null;
  if (!bgc) {
    const b = getComputedStyle(document.body).backgroundColor;
    bgc = /rgba?\(/.test(b) && !/,\s*0\)$/.test(b) ? rgbOf(b, [255, 255, 255]) : [255, 255, 255];
  }
  const lum = (0.2126 * bgc[0] + 0.7152 * bgc[1] + 0.0722 * bgc[2]) / 255;
  return {
    dark: lum < 0.45,
    colors: [
      rgbOf(cssVar('--primary') || '#0b5ed7', [11, 94, 215]),
      rgbOf(cssVar('--accent') || '#00b3a4', [0, 179, 164]),
      rgbOf(cssVar('--secondary') || '#0a2540', [10, 37, 64]),
    ],
  };
}

const FIXED = {
  sparks: ['#ff9800', '#ffb300', '#ff6d00', '#ffd54f'],
  fireworks: ['#ffd166', '#ef476f', '#06d6a0', '#4cc9f0', '#ff9f1c', '#ffffff'],
  leaves: ['#4caf50', '#7cb342', '#8bc34a', '#558b2f', '#c9a227'],
  petals: ['#ff9f1c', '#ffb703', '#fb8500', '#ffd166', '#f77f00'],
  hearts: ['#ff4d6d', '#ff758f', '#c9184a', '#ff8fa3'],
  tricolor: ['#ff9933', '#ffffff', '#138808'],
  diyas: ['#ffb347'],
};

function paletteFor(name, opts, theme) {
  if (opts.colors && opts.colors.length) return opts.colors.map((c) => entry(rgbOf(c)));
  if (FIXED[name]) return FIXED[name].map((c) => entry(rgbOf(c)));
  let cols = theme.colors.slice();
  if (name === 'confetti') cols = cols.concat(['#ffc107', '#e91e63', '#8bc34a', '#ff7043'].map((c) => rgbOf(c)));
  if (name === 'stars') cols = theme.dark ? [[255, 255, 255], [255, 233, 168], [184, 212, 255]] : [theme.colors[1], theme.colors[0], [245, 179, 1]];
  if (theme.dark) cols = cols.map((c) => mixWhite(c, 0.35));
  return cols.map(entry);
}

// ---------- cached sprites ----------
const sprites = new Map();
function sprite(key, size, draw) {
  let s = sprites.get(key);
  if (!s) {
    s = document.createElement('canvas');
    s.width = s.height = size;
    draw(s.getContext('2d'), size);
    sprites.set(key, s);
  }
  return s;
}
const glow = (rgb) => sprite('g' + rgb.join(), 64, (g, n) => {
  const r = rgb.map(Math.round).join(',');
  const gr = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  gr.addColorStop(0, 'rgba(255,255,255,.95)');
  gr.addColorStop(0.18, `rgba(${r},.8)`);
  gr.addColorStop(0.5, `rgba(${r},.22)`);
  gr.addColorStop(1, `rgba(${r},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
});
const bubbleSprite = (rgb, dark) => sprite('b' + rgb.join() + dark, 96, (g, n) => {
  const r = rgb.map(Math.round).join(',');
  const c = n / 2;
  const gr = g.createRadialGradient(c, c, 0, c, c, c);
  gr.addColorStop(0, `rgba(${r},.03)`);
  gr.addColorStop(0.72, `rgba(${r},.12)`);
  gr.addColorStop(0.93, `rgba(${r},.42)`);
  gr.addColorStop(1, `rgba(${r},0)`);
  g.fillStyle = gr; g.beginPath(); g.arc(c, c, c, 0, TAU); g.fill();
  g.strokeStyle = dark ? 'rgba(255,255,255,.35)' : `rgba(${r},.55)`;
  g.lineWidth = 2; g.beginPath(); g.arc(c, c, c - 3, 0, TAU); g.stroke();
  const h = g.createRadialGradient(c * 0.62, c * 0.55, 0, c * 0.62, c * 0.55, c * 0.38);
  h.addColorStop(0, 'rgba(255,255,255,.95)'); h.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = h; g.beginPath(); g.arc(c * 0.62, c * 0.55, c * 0.38, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(c * 1.35, c * 1.4, c * 0.09, 0, TAU); g.fill();
});
const snowSprite = (dark) => sprite('s' + dark, 48, (g, n) => {
  const c = n / 2, r = dark ? '255,255,255' : '120,160,215';
  const gr = g.createRadialGradient(c, c, 0, c, c, c);
  gr.addColorStop(0, `rgba(${r},1)`); gr.addColorStop(0.45, `rgba(${r},.85)`); gr.addColorStop(1, `rgba(${r},0)`);
  g.fillStyle = gr; g.fillRect(0, 0, n, n);
});

// ---------- shapes (unit space) ----------
let SHAPES;
function shapes() {
  if (SHAPES) return SHAPES;
  const leaf = new Path2D();
  leaf.moveTo(0, -1); leaf.bezierCurveTo(0.9, -0.55, 0.8, 0.45, 0, 1); leaf.bezierCurveTo(-0.8, 0.45, -0.9, -0.55, 0, -1); leaf.closePath();
  const petal = new Path2D();
  petal.moveTo(0, -1); petal.bezierCurveTo(0.95, -0.4, 0.7, 0.85, 0, 1); petal.bezierCurveTo(-0.7, 0.85, -0.95, -0.4, 0, -1); petal.closePath();
  const heart = new Path2D();
  heart.moveTo(0, 0.9); heart.bezierCurveTo(-1.3, -0.1, -0.8, -1, 0, -0.4); heart.bezierCurveTo(0.8, -1, 1.3, -0.1, 0, 0.9); heart.closePath();
  const flame = new Path2D();
  flame.moveTo(0, -1); flame.bezierCurveTo(0.8, -0.2, 0.55, 0.9, 0, 1); flame.bezierCurveTo(-0.55, 0.9, -0.8, -0.2, 0, -1); flame.closePath();
  const bowl = new Path2D();
  bowl.moveTo(-1, 0); bowl.quadraticCurveTo(-0.8, 0.9, 0, 0.95); bowl.quadraticCurveTo(0.8, 0.9, 1, 0); bowl.closePath();
  const ghost = new Path2D();
  ghost.moveTo(-0.8, 0.9); ghost.lineTo(-0.8, -0.1); ghost.arc(0, -0.1, 0.8, Math.PI, 0); ghost.lineTo(0.8, 0.9);
  ghost.quadraticCurveTo(0.6, 0.62, 0.4, 0.9); ghost.quadraticCurveTo(0.2, 0.62, 0, 0.9);
  ghost.quadraticCurveTo(-0.2, 0.62, -0.4, 0.9); ghost.quadraticCurveTo(-0.6, 0.62, -0.8, 0.9); ghost.closePath();
  return (SHAPES = { leaf, petal, heart, flame, bowl, ghost });
}

function drawBat(g, f) {
  g.beginPath();
  for (const s of [1, -1]) {
    g.moveTo(0.08 * s, -0.12);
    g.quadraticCurveTo(0.55 * s, -0.75 - f * 0.55, 1.5 * s, -0.15 - f * 1.0);
    g.quadraticCurveTo(1.25 * s, 0.05 - f * 0.45, 1.05 * s, 0.28 - f * 0.35);
    g.quadraticCurveTo(0.85 * s, 0.08 - f * 0.2, 0.68 * s, 0.36 - f * 0.2);
    g.quadraticCurveTo(0.5 * s, 0.14, 0.3 * s, 0.34);
    g.quadraticCurveTo(0.15 * s, 0.3, 0.08 * s, 0.42);
    g.closePath();
  }
  g.fill();
  g.beginPath(); g.ellipse(0, 0.12, 0.17, 0.34, 0, 0, TAU); g.fill();
  g.beginPath(); g.arc(0, -0.28, 0.14, 0, TAU);
  g.moveTo(-0.12, -0.34); g.lineTo(-0.1, -0.62); g.lineTo(-0.02, -0.4);
  g.moveTo(0.12, -0.34); g.lineTo(0.1, -0.62); g.lineTo(0.02, -0.4); g.fill();
}
function drawPumpkin(g) {
  g.fillStyle = '#f28c28'; g.beginPath(); g.ellipse(0, 0, 1, 0.85, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(160,70,0,.45)'; g.lineWidth = 0.07;
  for (const k of [-0.55, 0, 0.55]) { g.beginPath(); g.ellipse(k, 0, 0.28, 0.82, 0, 0, TAU); g.stroke(); }
  g.fillStyle = '#4d7c2a'; g.fillRect(-0.09, -1.05, 0.18, 0.3);
  g.fillStyle = '#3a1d05';
  g.beginPath(); g.moveTo(-0.5, -0.2); g.lineTo(-0.22, -0.2); g.lineTo(-0.36, -0.46); g.closePath();
  g.moveTo(0.5, -0.2); g.lineTo(0.22, -0.2); g.lineTo(0.36, -0.46); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-0.5, 0.22);
  for (let i = 0; i < 6; i++) g.lineTo(-0.5 + (i + 1) * 0.166, i % 2 ? 0.22 : 0.45);
  g.lineTo(0.5, 0.22); g.closePath(); g.fill();
}

// ---------- preset definitions ----------
// init(p,E,first) / step(p,dt,E,L) -> true when particle must respawn / draw(g,p,E,L)
const tr = (g, E, x, y, rot, sx, sy) => {
  const c = Math.cos(rot), s = Math.sin(rot), d = E.dpr;
  g.setTransform(c * sx * d, s * sx * d, -s * sy * d, c * sy * d, x * d, y * d);
};
const reset = (g, E) => g.setTransform(E.dpr, 0, 0, E.dpr, 0, 0);
const out = (p, E, m = 40) => p.y > E.h + m || p.x < -m * 2 || p.x > E.w + m * 2;
const faller = (p, E, f, [vmin, vmax]) => {
  p.x = rnd(0, E.w); p.y = f ? rnd(-20, E.h) : rnd(-50, -8);
  p.vy = rnd(vmin, vmax); p.bx = p.x; p.ph = rnd(0, TAU); p.wf = rnd(0.5, 1.4); p.wa = rnd(10, 36);
  p.rot = rnd(0, TAU); p.vr = rnd(-2, 2); p.fl = rnd(0, TAU); p.vf = rnd(1.5, 5); p.pc = pick(E.pal); p.a = rnd(0.55, 0.95);
};
const fallStep = (p, dt, E) => {
  p.y += p.vy * dt; p.ph += p.wf * dt; p.x = p.bx + Math.sin(p.ph) * p.wa; p.rot += p.vr * dt; p.fl += p.vf * dt;
  return p.y > E.h + 30;
};

function confettiDef(n, outline) {
  return {
    n,
    init(p, E, f) { faller(p, E, f, [45, 110]); p.w = rnd(6, 11); p.h = rnd(3, 6); p.round = Math.random() < 0.2; },
    step: fallStep,
    draw(g, p, E, L) {
      g.globalAlpha = p.a * L.alpha * 0.9;
      tr(g, E, p.x, p.y, p.rot, 1, Math.cos(p.fl));
      g.fillStyle = p.pc.hex;
      if (p.round) { g.beginPath(); g.arc(0, 0, p.h * 0.6, 0, TAU); g.fill(); } else g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      if (outline && p.pc.hex === '#ffffff') { g.strokeStyle = 'rgba(80,90,110,.45)'; g.lineWidth = 0.8; g.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); }
      reset(g, E);
    },
  };
}
const shapeFaller = (n, key, range, size, alpha, extra) => ({
  n,
  init(p, E, f) { faller(p, E, f, range); p.s = rnd(size[0], size[1]); if (extra) extra(p, E); },
  step: fallStep,
  draw(g, p, E, L) {
    g.globalAlpha = p.a * L.alpha * alpha;
    tr(g, E, p.x, p.y, p.rot, p.s * Math.max(0.3, Math.abs(Math.cos(p.fl))), p.s);
    g.fillStyle = p.pc.hex; g.fill(shapes()[key]);
    if (key === 'leaf') { g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 0.07; g.beginPath(); g.moveTo(0, -0.9); g.lineTo(0, 0.9); g.stroke(); }
    reset(g, E);
  },
});

const PRESETS = {
  bubbles: {
    n: 30,
    init(p, E, f) {
      p.r = 3 + Math.pow(Math.random(), 2.2) * 17;
      p.x = rnd(0, E.w); p.bx = p.x; p.y = f ? rnd(0, E.h) : E.h + p.r + rnd(0, 60);
      p.vy = -(14 + p.r * 3.2 * rnd(0.7, 1.2)); p.ph = rnd(0, TAU); p.wf = rnd(0.6, 1.6); p.wa = rnd(5, 18);
      p.a = rnd(0.5, 0.95); p.pc = pick(E.pal);
    },
    step(p, dt) { p.y += p.vy * dt; p.ph += p.wf * dt; p.x = p.bx + Math.sin(p.ph) * p.wa; return p.y < -p.r - 10; },
    draw(g, p, E, L) { g.globalAlpha = p.a * L.alpha; g.drawImage(bubbleSprite(p.pc.rgb, E.dark), p.x - p.r, p.y - p.r, p.r * 2, p.r * 2); },
  },
  rain: {
    n: 110,
    init(p, E, f) {
      p.x = rnd(-60, E.w + 60); p.y = f ? rnd(-E.h * 0.2, E.h) : rnd(-140, -10);
      p.vy = rnd(620, 980); p.vx = p.vy * 0.16; p.len = rnd(0.018, 0.03); p.a = rnd(0.2, 0.5); p.pc = pick(E.pal);
    },
    step(p, dt, E) { p.x += p.vx * dt; p.y += p.vy * dt; return p.y > E.h + 20; },
    draw(g, p, E, L) {
      g.globalAlpha = p.a * L.alpha; g.strokeStyle = p.pc.hex; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * p.len, p.y - p.vy * p.len); g.stroke();
    },
  },
  snow: {
    n: 90,
    init(p, E, f) {
      p.r = rnd(1.4, 4.6); p.x = rnd(0, E.w); p.bx = p.x; p.y = f ? rnd(0, E.h) : rnd(-20, -4);
      p.vy = rnd(20, 48) * (0.5 + p.r / 4); p.ph = rnd(0, TAU); p.wf = rnd(0.4, 1); p.wa = rnd(8, 26); p.a = rnd(0.55, 0.95);
    },
    step(p, dt, E) { p.y += p.vy * dt; p.ph += p.wf * dt; p.x = p.bx + Math.sin(p.ph) * p.wa; return p.y > E.h + 8; },
    draw(g, p, E, L) { g.globalAlpha = p.a * L.alpha * (E.dark ? 1 : 0.8); g.drawImage(snowSprite(E.dark), p.x - p.r * 2, p.y - p.r * 2, p.r * 4, p.r * 4); },
  },
  confetti: confettiDef(38, false),
  tricolor: confettiDef(38, true),
  sparks: {
    n: 40,
    init(p, E, f) {
      p.x = rnd(0, E.w); p.y = f ? rnd(E.h * 0.3, E.h) : E.h + rnd(0, 30);
      p.vy = -rnd(40, 130); p.vx = rnd(-18, 18); p.r = rnd(1.2, 3); p.life = rnd(2.5, 5); p.age = f ? rnd(0, p.life) : 0;
      p.ph = rnd(0, TAU); p.pc = pick(E.pal);
    },
    step(p, dt) { p.age += dt; p.x += (p.vx + Math.sin(p.age * 3 + p.ph) * 14) * dt; p.y += p.vy * dt; return p.age > p.life; },
    draw(g, p, E, L) {
      const f = p.age / p.life;
      g.globalAlpha = Math.pow(Math.sin(Math.PI * f), 0.7) * (0.75 + 0.25 * Math.sin(p.age * 30 + p.ph)) * L.alpha;
      const s = p.r * 8;
      g.drawImage(glow(p.pc.rgb), p.x - s / 2, p.y - s / 2, s, s);
    },
  },
  fireworks: {
    n: 140, custom: true,
    init(p) { p.on = false; },
    tick(L, dt, E) {
      L.timer = (L.timer || 0) - dt;
      if (L.timer > 0) return;
      L.timer = rnd(1.1, 2.4) / Math.max(0.5, L.density);
      const p = L.parts.find((q) => !q.on); if (!p) return;
      Object.assign(p, { on: true, k: 'r', x: rnd(E.w * 0.15, E.w * 0.85), y: E.h + 10, vx: rnd(-20, 20), vy: -rnd(430, 580), ty: rnd(E.h * 0.14, E.h * 0.45), a: 1, pc: pick(E.pal) });
    },
    step(p, dt, E, L) {
      if (!p.on) return false;
      if (p.k === 'r') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy *= 1 - 0.9 * dt;
        if (p.y <= p.ty || p.vy > -70) {
          p.on = false;
          const cnt = Math.min(Math.round(rnd(26, 44)), Math.floor(L.parts.length / 3));
          const ring = Math.random() < 0.4, col = p.pc;
          for (let i = 0, j = 0; i < cnt && j < L.parts.length; j++) {
            const q = L.parts[j]; if (q.on) continue;
            const ang = (i / cnt) * TAU + rnd(-0.05, 0.05), sp = ring ? rnd(150, 170) : rnd(50, 230);
            Object.assign(q, { on: true, k: 's', x: p.x, y: p.y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: rnd(1.1, 1.8), age: 0, pc: Math.random() < 0.25 ? entry([255, 255, 255]) : col });
            i++;
          }
        }
      } else {
        p.age += dt; p.vx *= 1 - 1.1 * dt; p.vy = p.vy * (1 - 1.1 * dt) + 95 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.age > p.life) p.on = false;
      }
      return false;
    },
    draw(g, p, E, L) {
      if (!p.on) return;
      if (p.k === 'r') {
        g.globalAlpha = L.alpha; g.strokeStyle = p.pc.hex; g.lineWidth = 2;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); g.stroke();
        g.drawImage(glow(p.pc.rgb), p.x - 8, p.y - 8, 16, 16);
      } else {
        const f = 1 - p.age / p.life;
        g.globalAlpha = f * f * L.alpha; g.strokeStyle = p.pc.hex; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); g.stroke();
        g.drawImage(glow(p.pc.rgb), p.x - 6, p.y - 6, 12, 12);
      }
    },
  },
  leaves: shapeFaller(16, 'leaf', [25, 55], [7, 15], 0.7),
  petals: shapeFaller(24, 'petal', [22, 50], [4, 9], 0.85),
  hearts: {
    n: 14,
    init(p, E, f) {
      p.s = rnd(6, 15); p.x = rnd(0, E.w); p.bx = p.x; p.y = f ? rnd(0, E.h) : E.h + p.s * 2;
      p.vy = -rnd(25, 60); p.ph = rnd(0, TAU); p.wf = rnd(0.6, 1.3); p.wa = rnd(10, 28); p.pc = pick(E.pal); p.a = rnd(0.5, 0.9);
    },
    step(p, dt) { p.y += p.vy * dt; p.ph += p.wf * dt; p.x = p.bx + Math.sin(p.ph) * p.wa; return p.y < -p.s * 2; },
    draw(g, p, E, L) {
      g.globalAlpha = p.a * L.alpha * clamp(p.y / (E.h * 0.25), 0, 1) * 0.85;
      tr(g, E, p.x, p.y, Math.sin(p.ph) * 0.3, p.s, p.s);
      g.fillStyle = p.pc.hex; g.fill(shapes().heart); reset(g, E);
    },
  },
  bats: {
    n: 7,
    init(p, E, f) {
      const r = Math.random(); p.k = r < 0.72 ? 'bat' : r < 0.87 ? 'pumpkin' : 'ghost';
      if (p.k === 'bat') {
        p.s = rnd(8, 16); p.dir = Math.random() < 0.5 ? 1 : -1; p.x = f ? rnd(0, E.w) : (p.dir > 0 ? -40 : E.w + 40);
        p.by = rnd(E.h * 0.08, E.h * 0.7); p.vx = p.dir * rnd(35, 90); p.ph = rnd(0, TAU); p.fs = rnd(9, 14); p.y = p.by;
      } else {
        p.s = rnd(11, 19); p.x = rnd(0, E.w); p.bx = p.x; p.y = f ? rnd(0, E.h) : E.h + 40; p.vy = -rnd(10, 24);
        p.ph = rnd(0, TAU); p.fs = rnd(0.5, 1);
      }
      p.a = rnd(0.55, 0.85);
    },
    step(p, dt, E) {
      p.ph += p.fs * dt;
      if (p.k === 'bat') { p.x += p.vx * dt; p.y = p.by + Math.sin(p.ph * 0.35) * 26; return p.x < -60 || p.x > E.w + 60; }
      p.y += p.vy * dt; p.x = p.bx + Math.sin(p.ph) * 22; return p.y < -40;
    },
    draw(g, p, E, L) {
      g.globalAlpha = p.a * L.alpha * (p.k === 'bat' ? 0.8 : 0.6);
      if (p.k === 'bat') {
        tr(g, E, p.x, p.y, Math.sin(p.ph * 0.35) * 0.15, p.s * (p.dir > 0 ? 1 : -1), p.s);
        g.fillStyle = E.dark ? '#a58bd0' : '#2d1b3d'; drawBat(g, Math.sin(p.ph));
      } else if (p.k === 'pumpkin') {
        tr(g, E, p.x, p.y, Math.sin(p.ph) * 0.12, p.s, p.s); drawPumpkin(g);
      } else {
        tr(g, E, p.x, p.y, Math.sin(p.ph) * 0.1, p.s, p.s);
        g.fillStyle = E.dark ? '#e8e8ff' : '#ffffff'; g.strokeStyle = E.dark ? 'rgba(200,200,255,.5)' : 'rgba(110,100,150,.55)'; g.lineWidth = 0.07;
        g.fill(shapes().ghost); g.stroke(shapes().ghost);
        g.fillStyle = '#2b2540'; g.beginPath(); g.ellipse(-0.3, -0.15, 0.12, 0.17, 0, 0, TAU); g.ellipse(0.3, -0.15, 0.12, 0.17, 0, 0, TAU); g.fill();
      }
      reset(g, E);
    },
  },
  stars: {
    n: 70,
    init(p, E) {
      p.x = rnd(0, E.w); p.y = rnd(0, E.h); p.r = rnd(0.8, 2.6); p.ph = rnd(0, TAU); p.tw = rnd(0.8, 2.6); p.pc = pick(E.pal); p.t = 0;
    },
    step(p, dt) { p.t += dt; p.y -= 1.5 * dt; return p.y < -6; },
    draw(g, p, E, L) {
      const tw = 0.5 + 0.5 * Math.sin(p.t * p.tw + p.ph);
      g.globalAlpha = (0.25 + 0.75 * tw) * L.alpha * (E.dark ? 1 : 0.8);
      const s = p.r * 6; g.drawImage(glow(p.pc.rgb), p.x - s / 2, p.y - s / 2, s, s);
      if (p.r > 1.9) {
        g.strokeStyle = p.pc.hex; g.lineWidth = 0.8; const l = p.r * 3 * (0.6 + tw * 0.6);
        g.beginPath(); g.moveTo(p.x - l, p.y); g.lineTo(p.x + l, p.y); g.moveTo(p.x, p.y - l); g.lineTo(p.x, p.y + l); g.stroke();
      }
    },
  },
  diyas: {
    n: 6,
    init(p, E, f) {
      p.s = rnd(9, 15); p.x = rnd(E.w * 0.04, E.w * 0.96); p.bx = p.x; p.y = f ? rnd(E.h * 0.2, E.h) : E.h + 30;
      p.vy = -rnd(12, 28); p.ph = rnd(0, TAU); p.wf = rnd(0.4, 0.9); p.wa = rnd(8, 20); p.a = rnd(0.7, 1); p.t = 0;
    },
    step(p, dt) { p.t += dt; p.y += p.vy * dt; p.ph += p.wf * dt; p.x = p.bx + Math.sin(p.ph) * p.wa; return p.y < -50; },
    draw(g, p, E, L) {
      const fl = 0.85 + 0.15 * Math.sin(p.t * 11 + p.ph * 3) * Math.sin(p.t * 7);
      const edge = clamp(p.y / (E.h * 0.2), 0, 1) * clamp((E.h + 30 - p.y) / 60, 0, 1);
      g.globalAlpha = p.a * L.alpha * edge * 0.55;
      const hs = p.s * 7 * fl; g.drawImage(glow([255, 170, 60]), p.x - hs / 2, p.y - p.s * 0.6 - hs / 2, hs, hs);
      g.globalAlpha = p.a * L.alpha * edge * 0.95;
      tr(g, E, p.x, p.y, 0, p.s, p.s * 0.7);
      g.fillStyle = '#b5532a'; g.fill(shapes().bowl);
      g.strokeStyle = '#f5c04a'; g.lineWidth = 0.14; g.beginPath(); g.moveTo(-1, 0); g.lineTo(1, 0); g.stroke();
      tr(g, E, p.x, p.y - p.s * 0.55, Math.sin(p.t * 6 + p.ph) * 0.08, p.s * 0.32 * fl, p.s * 0.7 * fl);
      g.fillStyle = '#ffb02e'; g.fill(shapes().flame);
      g.fillStyle = '#fff4c2'; g.scale(0.5, 0.55); g.translate(0, 0.35); g.fill(shapes().flame);
      reset(g, E);
    },
  },
};

// ───────────────────────── engine
const BURST_COLORS = {
  confetti: ['#ffc107', '#e91e63', '#8bc34a', '#29b6f6', '#ff7043', '#ab47bc'],
  sparks: ['#ffb300', '#ff9800', '#ffd54f', '#fff3c4'],
  hearts: ['#ff4d6d', '#ff758f', '#c9184a', '#ff8fa3'],
  bubbles: ['#4fc3f7', '#81d4fa', '#b3e5fc', '#ffffff'],
};

export function startParticles(canvas, opts = {}) {
  const g = canvas.getContext('2d');
  const E = { w: 0, h: 0, dpr: 1, dark: false, pal: [] };
  let quality = QUALITY[opts.quality] || QUALITY.medium;
  let intensity = clamp(Number(opts.intensity) || 1, 0.3, 2);
  let layers = [];
  let bursts = [];
  let raf = 0; let last = 0; let paused = false; let dead = false; let acc = 0;

  function resize() {
    E.w = window.innerWidth; E.h = window.innerHeight; E.dpr = Math.min(window.devicePixelRatio || 1, quality.dpr);
    canvas.width = Math.round(E.w * E.dpr); canvas.height = Math.round(E.h * E.dpr);
    g.setTransform(E.dpr, 0, 0, E.dpr, 0, 0);
  }

  function count(def, density) {
    const area = clamp((E.w * E.h) / (1280 * 720), 0.45, 1.5);
    return Math.max(2, Math.min(quality.cap, Math.round(def.n * density * intensity * quality.mul * area)));
  }

  function makeLayer(name, o) {
    const def = PRESETS[name];
    if (!def) return null;
    const theme = readTheme(); E.dark = theme.dark;
    const L = { name, def, o, alpha: 0, target: 1, density: clamp(Number(o.density) || 1, 0.1, 3), pal: paletteFor(name, o, theme), parts: [], timer: 0 };
    E.pal = L.pal;
    const n = count(def, L.density);
    for (let i = 0; i < n; i++) { const p = {}; def.init(p, E, true); L.parts.push(p); }
    return L;
  }

  function setPreset(name, o = {}) {
    for (const l of layers) l.target = 0;
    if (name && name !== 'none') { const L = makeLayer(name, o); if (L) layers.push(L); }
    kick();
  }

  function burst(type = 'confetti', x, y) {
    const cols = BURST_COLORS[type] || BURST_COLORS.confetti;
    const cx = x == null ? E.w / 2 : x; const cy = y == null ? E.h / 2 : y;
    const n = quality.burst;
    for (let i = 0; i < n; i++) {
      const a = type === 'bubbles' ? -Math.PI / 2 + rnd(-0.9, 0.9) : rnd(0, TAU);
      const sp = type === 'sparks' ? rnd(80, 260) : type === 'bubbles' ? rnd(40, 140) : rnd(120, 380);
      bursts.push({ type, x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (type === 'hearts' ? 80 : 0), age: 0, life: rnd(0.9, 1.7), r: rnd(3, 7), rot: rnd(0, TAU), vr: rnd(-8, 8), c: pick(cols) });
    }
    kick();
  }

  function drawBursts(dt) {
    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i];
      b.age += dt; if (b.age >= b.life) { bursts.splice(i, 1); continue; }
      const grav = b.type === 'bubbles' ? -40 : b.type === 'hearts' ? 60 : 520;
      b.vx *= 1 - 1.4 * dt; b.vy = b.vy * (1 - 1.1 * dt) + grav * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.rot += b.vr * dt;
      const f = 1 - b.age / b.life;
      g.globalAlpha = Math.min(1, f * 1.6);
      if (b.type === 'confetti') { g.setTransform(Math.cos(b.rot) * E.dpr, Math.sin(b.rot) * E.dpr, -Math.sin(b.rot) * E.dpr, Math.cos(b.rot) * E.dpr, b.x * E.dpr, b.y * E.dpr); g.fillStyle = b.c; g.fillRect(-b.r, -b.r / 2, b.r * 2, b.r); reset(g, E); }
      else if (b.type === 'hearts') { tr(g, E, b.x, b.y, 0, b.r * 1.6, b.r * 1.6); g.fillStyle = b.c; g.fill(shapes().heart); reset(g, E); }
      else if (b.type === 'bubbles') { g.strokeStyle = b.c; g.lineWidth = 1.5; g.beginPath(); g.arc(b.x, b.y, b.r * 1.4, 0, TAU); g.stroke(); }
      else { const s = b.r * 6; g.drawImage(glow(rgbOf(b.c)), b.x - s / 2, b.y - s / 2, s, s); }
    }
    g.globalAlpha = 1;
  }

  function frame(t) {
    raf = 0; if (dead || paused) return;
    const now = t / 1000; let dt = last ? now - last : 0.016; last = now;
    dt = Math.min(dt, 0.05);
    if (quality.minDt) { acc += dt; if (acc < quality.minDt) { raf = requestAnimationFrame(frame); return; } dt = acc; acc = 0; }
    g.clearRect(0, 0, E.w, E.h);
    for (let li = layers.length - 1; li >= 0; li--) {
      const L = layers[li];
      L.alpha += (L.target - L.alpha) * Math.min(1, dt * 2.2);
      if (L.target === 0 && L.alpha < 0.02) { layers.splice(li, 1); continue; }
      E.pal = L.pal; E.dark = readDark();
      if (L.def.tick) L.def.tick(L, dt, E);
      for (const p of L.parts) { if (L.def.step(p, dt, E, L)) L.def.init(p, E, false); L.def.draw(g, p, E, L); }
      g.globalAlpha = 1;
    }
    if (bursts.length) drawBursts(dt);
    if (layers.length || bursts.length) raf = requestAnimationFrame(frame);
    else g.clearRect(0, 0, E.w, E.h);
  }
  let darkCache = { t: 0, v: false };
  function readDark() { const n = performance.now(); if (n - darkCache.t > 1500) darkCache = { t: n, v: readTheme().dark }; return darkCache.v; }

  function kick() { if (!raf && !paused && !dead) { last = 0; raf = requestAnimationFrame(frame); } }
  function pause() { paused = true; if (raf) cancelAnimationFrame(raf); raf = 0; }
  function resume() { if (!paused) return; paused = false; kick(); }
  function destroy() { dead = true; if (raf) cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); g.clearRect(0, 0, E.w, E.h); }
  let rt = 0; function onResize() { clearTimeout(rt); rt = setTimeout(() => { resize(); for (const l of layers) { const n = count(l.def, l.density); while (l.parts.length < n) { const p = {}; l.def.init(p, E, true); l.parts.push(p); } l.parts.length = Math.min(l.parts.length, n); } }, 150); }

  window.addEventListener('resize', onResize, { passive: true });
  resize();
  setPreset(opts.preset || 'none', opts);
  return { setPreset, burst, pause, resume, destroy, setQuality(q) { quality = QUALITY[q] || quality; resize(); }, get running() { return !paused && !dead; } };
}
