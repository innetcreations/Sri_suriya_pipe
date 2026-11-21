// DOM micro-interactions. Everything degrades to "just visible" without JS or with reduced motion.
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const fine = () => window.matchMedia('(pointer:fine)').matches;

export function initReveal() {
  const els = $$('[data-reveal],[data-reveal-stagger] > *');
  if (!els.length || !('IntersectionObserver' in window)) return;
  document.documentElement.classList.add('fx-reveal-ready');
  $$('[data-reveal-stagger]').forEach((p) => { Array.from(p.children).forEach((c, i) => { if (!c.hasAttribute('data-reveal')) c.setAttribute('data-reveal', 'up'); if (!c.dataset.delay) c.dataset.delay = String(Math.min(i, 8) * 70); }); });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target; const d = parseInt(el.dataset.delay, 10) || 0;
      el.style.transitionDelay = d ? `${d}ms` : ''; el.classList.add('is-in'); io.unobserve(el);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  $$('[data-reveal]').forEach((el) => io.observe(el));
  setTimeout(() => $$('[data-reveal]:not(.is-in)').forEach((el) => { const r = el.getBoundingClientRect(); if (r.top < window.innerHeight) el.classList.add('is-in'); }), 1200);
}

export function initCounters() {
  const els = $$('[data-counter]');
  if (!els.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue; io.unobserve(e.target);
      const el = e.target; const to = parseFloat(el.dataset.counter) || 0; const dur = parseInt(el.dataset.duration, 10) || 1600;
      const pre = el.dataset.prefix || ''; const suf = el.dataset.suffix || ''; const t0 = performance.now();
      const run = (now) => {
        const p = Math.min(1, (now - t0) / dur); const v = to * (1 - Math.pow(1 - p, 3));
        el.textContent = pre + Math.round(v).toLocaleString('en-IN') + suf; if (p < 1) requestAnimationFrame(run);
      };
      requestAnimationFrame(run);
    }
  }, { threshold: 0.4 });
  els.forEach((el) => io.observe(el));
}

export function initTilt() {
  if (!fine()) return;
  $$('[data-tilt]').forEach((el) => {
    const max = parseFloat(el.dataset.tiltMax) || 8; let raf = 0;
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect(); const x = (e.clientX - r.left) / r.width - 0.5; const y = (e.clientY - r.top) / r.height - 0.5;
      cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { el.style.transform = `perspective(900px) rotateX(${(-y * max).toFixed(2)}deg) rotateY(${(x * max).toFixed(2)}deg) translateZ(0)`; });
    });
    el.addEventListener('pointerleave', () => { cancelAnimationFrame(raf); el.style.transform = ''; });
  });
}
export function initSpotlight() {
  if (!fine()) return;
  document.addEventListener('pointermove', (e) => {
    const c = e.target.closest && e.target.closest('.card'); if (!c) return;
    const r = c.getBoundingClientRect(); c.style.setProperty('--mx', `${e.clientX - r.left}px`); c.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}
export function initMagnetic() {
  if (!fine()) return;
  $$('[data-magnetic]').forEach((el) => {
    el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); el.style.transform = `translate(${((e.clientX - r.left) / r.width - 0.5) * 8}px,${((e.clientY - r.top) / r.height - 0.5) * 8}px)`; });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });
}
export function initRipple() {
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('.btn'); if (!b || b.disabled) return;
    const r = b.getBoundingClientRect(); const s = Math.max(r.width, r.height) * 2; const sp = document.createElement('span');
    sp.className = 'ripple'; sp.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
    b.appendChild(sp); setTimeout(() => sp.remove(), 650);
  }, { passive: true });
}
export function initProgress() {
  const bar = document.createElement('div'); bar.id = 'fx-progress'; bar.setAttribute('aria-hidden', 'true'); document.body.appendChild(bar);
  let raf = 0;
  const upd = () => { raf = 0; const h = document.documentElement.scrollHeight - window.innerHeight; bar.style.transform = `scaleX(${h > 0 ? Math.min(1, window.scrollY / h) : 0})`; };
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true }); upd();
}
export function initParallax() {
  const els = $$('[data-parallax]'); if (!els.length) return; let raf = 0;
  const upd = () => { raf = 0; const y = window.scrollY; els.forEach((el) => { const r = el.getBoundingClientRect(); if (r.bottom < -100 || r.top > window.innerHeight + 100) return; el.style.transform = `translate3d(0,${(y * (parseFloat(el.dataset.parallax) || 0.15)).toFixed(1)}px,0)`; }); };
  window.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
}
export function initSplit() {
  $$('[data-split]').forEach((el) => {
    const mode = el.dataset.split === 'chars' ? 'chars' : 'words'; const text = el.textContent.trim(); el.setAttribute('aria-label', text); el.textContent = '';
    const parts = mode === 'words' ? text.split(/\s+/) : Array.from(text); let i = 0;
    parts.forEach((w, idx) => {
      const s = document.createElement('span'); s.className = 'split-i'; s.setAttribute('aria-hidden', 'true'); s.style.setProperty('--i', String(i++)); s.textContent = w === ' ' ? ' ' : w; el.appendChild(s);
      if (mode === 'words' && idx < parts.length - 1) el.appendChild(document.createTextNode(' '));
    });
    el.classList.add('split-ready');
  });
}
export function initCursor() {
  if (!fine()) return;
  const dot = document.createElement('div'); dot.id = 'fx-cursor'; dot.setAttribute('aria-hidden', 'true'); dot.innerHTML = '<i></i><b></b>'; document.body.appendChild(dot);
  const ring = dot.querySelector('b'); const core = dot.querySelector('i'); let x = 0; let y = 0; let rx = 0; let ry = 0; let raf = 0;
  const loop = () => { rx += (x - rx) * 0.18; ry += (y - ry) * 0.18; ring.style.transform = `translate3d(${rx}px,${ry}px,0)`; core.style.transform = `translate3d(${x}px,${y}px,0)`; raf = requestAnimationFrame(loop); };
  window.addEventListener('pointermove', (e) => { x = e.clientX; y = e.clientY; dot.classList.add('is-on'); if (!raf) raf = requestAnimationFrame(loop); }, { passive: true });
  document.addEventListener('pointerover', (e) => { dot.classList.toggle('is-link', !!(e.target.closest && e.target.closest('a,button,.btn,input,select,textarea,summary,label'))); });
  document.documentElement.addEventListener('pointerleave', () => dot.classList.remove('is-on'));
}
