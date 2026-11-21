// FX entry. Reads #app-config, then starts only the features that are enabled and supported.
import { sound } from './sound.js';
import * as ui from './ui.js';

const html = document.documentElement;
const safe = (fn) => { try { return fn(); } catch (e) { if (window.console) console.warn('[fx]', e && e.message); return null; } };
let cfg = {};
try { cfg = JSON.parse(document.getElementById('app-config').textContent) || {}; } catch { cfg = {}; }
const fx = cfg.fx || {};
const theme = cfg.theme || {};
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const conn = navigator.connection || {};
const saveData = !!conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');
const mem = navigator.deviceMemory || 8; const cores = navigator.hardwareConcurrency || 8;
const lowEnd = saveData || mem <= 2 || cores <= 2;

function pickQuality() {
  if (fx.quality && fx.quality !== 'auto') return fx.quality;
  if (lowEnd) return 'low';
  if (window.innerWidth < 700 || mem <= 4 || cores <= 4) return 'medium';
  return 'high';
}
const quality = pickQuality();
const api = { sound, particles: null, scene: null, cfgScene: null, quality, setPreset() {}, burst() {}, destroy() {} };
window.SSP_FX = api;

// ── preloader
function hideLoader() { html.classList.remove('fx-loading'); }
(function loader() {
  if (!html.classList.contains('fx-loading')) return;
  const t0 = performance.now();
  const done = () => setTimeout(hideLoader, Math.max(0, 700 - (performance.now() - t0)));
  if (document.readyState === 'complete') done(); else window.addEventListener('load', done, { once: true });
})();

// ── sound
safe(() => {
  sound.init(cfg);
  const btn = document.getElementById('sound-toggle');
  if (!fx.sound) { if (btn) btn.hidden = true; return; }
  const paint = () => { if (!btn) return; const on = sound.isEnabled(); btn.setAttribute('aria-pressed', String(on)); btn.classList.toggle('is-on', on); };
  paint();
  if (btn) btn.addEventListener('click', () => { sound.toggle(); paint(); });
  const unlock = () => sound.unlock();
  window.addEventListener('pointerdown', unlock, { once: true, passive: true }); window.addEventListener('keydown', unlock, { once: true });
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-sound],a[href],button,.btn,summary,label[for]'); if (!t || t.id === 'sound-toggle') return;
    const n = t.getAttribute('data-sound'); if (n === 'none') return; sound.play(n || 'click');
  }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    const t = e.target.closest && e.target.closest('[data-sound-hover],.btn,.card a,.nav a'); if (!t) return;
    if (e.relatedTarget && t.contains(e.relatedTarget)) return; sound.play(t.getAttribute('data-sound-hover') || 'hover');
  }, { passive: true });
  document.addEventListener('fx:sound', (e) => sound.play((e.detail && e.detail.name) || 'click'));
});

// ── UI effects
safe(() => {
  ui.initRipple(); ui.initSpotlight();
  if (!reduced) {
    ui.initReveal(); ui.initCounters(); ui.initTilt(); ui.initMagnetic(); ui.initParallax(); ui.initSplit();
    if (fx.cursor) ui.initCursor();
  } else {
    document.querySelectorAll('[data-counter]').forEach((el) => { el.textContent = (el.dataset.prefix || '') + (parseFloat(el.dataset.counter) || 0).toLocaleString('en-IN') + (el.dataset.suffix || ''); });
  }
  ui.initProgress();
});

// ── particles (lazy: only after the page is interactive)
safe(() => {
  const canvas = document.getElementById('fx-particles');
  if (!canvas) return;
  const preset = (theme.particles && theme.particles.preset) || 'none';
  const wants = fx.particles && !saveData && (preset !== 'none' || true);
  if (!wants) { canvas.remove(); return; }
  const run = () => import('./particles.js').then((m) => {
    const p = theme.particles || {};
    const lightOnly = reduced; // reduced motion: only a very calm, sparse variant
    api.particles = m.startParticles(canvas, { preset: lightOnly ? (preset === 'none' ? 'none' : 'stars') : preset, density: (p.density || 1) * (lightOnly ? 0.35 : 1), colors: p.colors || [], intensity: fx.intensity || 1, quality });
    document.addEventListener('visibilitychange', () => { if (!api.particles) return; document.hidden ? api.particles.pause() : api.particles.resume(); });
    api.setPreset = (n, o) => api.particles && api.particles.setPreset(n, o || {});
    api.burst = (t, x, y) => api.particles && api.particles.burst(t, x, y);
    document.addEventListener('fx:burst', (e) => { const d = e.detail || {}; if (!reduced) api.burst(d.type, d.x, d.y); });
  }).catch(() => canvas.remove());
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 1500 }); else setTimeout(run, 600);
});

// ── 3D (minimal: hero bundle + configurator), lazy-loaded when a container becomes visible
safe(() => {
  const hero = document.querySelector('[data-scene="hero"]');
  const cfgRoot = document.querySelector('[data-configurator]');
  const targets = [hero, cfgRoot].filter(Boolean);
  const fallback = (el) => { if (el) el.setAttribute('data-state', 'fallback'); };
  if (!targets.length) return;
  if (!fx.scene3d || reduced || saveData || mem <= 1) { targets.forEach(fallback); return; }
  let mod = null; let loading = null;
  const load = () => loading || (loading = import('./scene3d.bundle.js').then((m) => { mod = m; return m; }));
  const start = async (el) => {
    el.setAttribute('data-state', 'loading');
    try {
      const m = await load();
      if (!m.supportsWebGL()) return fallback(el);
      const opts = { colors: theme.colors || {}, quality, reducedMotion: reduced, intensity: fx.intensity || 1 };
      if (el === hero) { api.scene = m.initHeroScene(hero, opts); hero.setAttribute('data-state', 'ready'); }
      else { api.cfgScene = m.initPipeConfigurator(cfgRoot, opts); cfgRoot.setAttribute('data-state', api.cfgScene ? 'ready' : 'fallback'); }
    } catch (e) { fallback(el); if (window.console) console.warn('[fx] 3D unavailable', e && e.message); }
  };
  if (!('IntersectionObserver' in window)) { targets.forEach(start); return; }
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); start(e.target); } }), { rootMargin: '200px' });
  targets.forEach((t) => io.observe(t));
});

api.destroy = () => { if (api.particles) api.particles.destroy(); if (api.scene) api.scene.destroy(); if (api.cfgScene) api.cfgScene.destroy(); };
