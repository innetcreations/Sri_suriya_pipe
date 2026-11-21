// Minimal Three.js: a hero pipe bundle + a pipe configurator. Built to scene3d.bundle.js by `npm run build:3d`.
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Color, CylinderGeometry, RingGeometry, MeshStandardMaterial, MeshPhysicalMaterial,
  HemisphereLight, DirectionalLight, DoubleSide, BackSide, PMREMGenerator, Plane, Vector3, MathUtils, SRGBColorSpace, ACESFilmicToneMapping,
} from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export function supportsWebGL() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch { return false; }
}
const CAP = { low: 1, medium: 1.5, high: 2 };

function makeRenderer(container, quality, clip) {
  const r = new WebGLRenderer({ antialias: quality !== 'low', alpha: true, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, CAP[quality] || 1.5));
  r.outputColorSpace = SRGBColorSpace; r.toneMapping = ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.setClearColor(0x000000, 0);
  if (clip) r.localClippingEnabled = true;
  r.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(r.domElement);
  return r;
}
function lighting(scene, renderer, quality) {
  scene.add(new HemisphereLight(0xffffff, 0x8899aa, 1.1));
  const key = new DirectionalLight(0xffffff, 2.2); key.position.set(4, 6, 5); scene.add(key);
  const rim = new DirectionalLight(0xbfd8ff, 1.0); rim.position.set(-5, 2, -4); scene.add(rim);
  if (quality !== 'low') {
    const pm = new PMREMGenerator(renderer);
    const env = pm.fromScene(new RoomEnvironment(), 0.04).texture; scene.environment = env; scene.environmentIntensity = 0.7; pm.dispose();
  }
}
// A hollow PVC pipe: outer wall + inner wall + two end rings, so the bore is visible.
function makePipe(od, len, color, { clip = null, quality = 'medium' } = {}) {
  const g = new Group();
  const id = od * 0.86;
  const mat = new MeshPhysicalMaterial({ color: new Color(color), roughness: 0.32, metalness: 0, clearcoat: quality === 'low' ? 0 : 0.6, clearcoatRoughness: 0.25, side: DoubleSide, clippingPlanes: clip ? [clip] : [] });
  const inner = new MeshStandardMaterial({ color: new Color(color).multiplyScalar(0.7), roughness: 0.6, side: BackSide, clippingPlanes: clip ? [clip] : [] });
  const seg = quality === 'low' ? 32 : 64;
  const outer = new Mesh(new CylinderGeometry(od / 2, od / 2, len, seg, 1, true), mat);
  const bore = new Mesh(new CylinderGeometry(id / 2, id / 2, len, seg, 1, true), inner);
  const ringGeo = new RingGeometry(id / 2, od / 2, seg);
  const r1 = new Mesh(ringGeo, mat); r1.rotation.x = -Math.PI / 2; r1.position.y = len / 2;
  const r2 = new Mesh(ringGeo, mat); r2.rotation.x = Math.PI / 2; r2.position.y = -len / 2;
  g.add(outer, bore, r1, r2);
  g.userData = { mats: [mat, inner] };
  return g;
}
function disposeTree(root) {
  root.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
}
// Shared render-loop plumbing: pause off-screen / hidden tab, resize, context loss.
function loop(container, renderer, tick) {
  let raf = 0; let visible = true; let paused = false; let dead = false; let last = performance.now();
  const step = (now) => { raf = 0; if (dead || paused || !visible || document.hidden) return; const dt = Math.min(0.05, (now - last) / 1000); last = now; tick(dt, now / 1000); raf = requestAnimationFrame(step); };
  const kick = () => { if (!raf && !dead) { last = performance.now(); raf = requestAnimationFrame(step); } };
  const io = new IntersectionObserver((e) => { visible = e[0].isIntersecting; if (visible) kick(); }, { rootMargin: '80px' }); io.observe(container);
  const onVis = () => { if (!document.hidden) kick(); }; document.addEventListener('visibilitychange', onVis);
  renderer.domElement.addEventListener('webglcontextlost', (e) => { e.preventDefault(); paused = true; });
  renderer.domElement.addEventListener('webglcontextrestored', () => { paused = false; kick(); });
  kick();
  return { pause() { paused = true; }, resume() { paused = false; kick(); }, stop() { dead = true; if (raf) cancelAnimationFrame(raf); io.disconnect(); document.removeEventListener('visibilitychange', onVis); } };
}
function sizer(container, renderer, camera, onSize) {
  const apply = () => { const w = Math.max(1, container.clientWidth); const h = Math.max(1, container.clientHeight); renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); if (onSize) onSize(w, h); };
  const ro = new ResizeObserver(apply); ro.observe(container); apply();
  return () => ro.disconnect();
}

// ───────────────────────── hero
export function initHeroScene(container, opts = {}) {
  const quality = opts.quality || 'medium';
  const pipes = (opts.colors && opts.colors.pipes && opts.colors.pipes.length ? opts.colors.pipes : ['#1e88e5', '#ffffff', '#9e9e9e', '#f5f0e1']);
  const renderer = makeRenderer(container, quality, false);
  const scene = new Scene();
  const camera = new PerspectiveCamera(32, 1, 0.1, 100);
  lighting(scene, renderer, quality);
  const bundle = new Group(); scene.add(bundle);
  const specs = [[1.0, 5.2, 0, 0.0], [0.8, 5.6, 1.15, 0.28], [0.8, 5.0, -1.1, 0.34], [0.62, 5.4, 0.55, -0.95], [0.62, 4.9, -0.55, -0.9], [0.46, 5.0, 1.55, -0.78], [0.46, 5.3, -1.6, -0.72]];
  const items = specs.map(([od, len, x, y], i) => {
    const p = makePipe(od, len, pipes[i % pipes.length], { quality });
    p.rotation.z = Math.PI / 2; p.position.set(0, y, x * 0.0); p.position.z = x; p.userData.phase = i * 0.9; p.userData.baseY = y;
    bundle.add(p); return p;
  });
  bundle.rotation.set(0.28, -0.62, 0.12);
  const target = { x: 0, y: 0 }; const cur = { x: 0, y: 0 };
  const onMove = (e) => { target.x = (e.clientX / window.innerWidth - 0.5) * 2; target.y = (e.clientY / window.innerHeight - 0.5) * 2; };
  if (!opts.reducedMotion) window.addEventListener('pointermove', onMove, { passive: true });
  const frame = () => { const w = container.clientWidth; const wide = w > 700; camera.position.set(wide ? 1.1 : 0, 0.4, wide ? 11.5 : 14.5); camera.lookAt(wide ? 0.4 : 0, 0, 0); };
  const unsize = sizer(container, renderer, camera, frame);
  let scroll = 0; const onScroll = () => { scroll = Math.min(1, window.scrollY / (container.clientHeight * 1.2)); }; window.addEventListener('scroll', onScroll, { passive: true });
  const L = loop(container, renderer, (dt, t) => {
    cur.x += (target.x - cur.x) * Math.min(1, dt * 2.5); cur.y += (target.y - cur.y) * Math.min(1, dt * 2.5);
    bundle.rotation.y = -0.62 + t * 0.12 * (opts.reducedMotion ? 0 : 1) + cur.x * 0.25 + scroll * 0.6;
    bundle.rotation.x = 0.28 + cur.y * 0.12;
    items.forEach((p) => { p.position.y = p.userData.baseY + Math.sin(t * 0.8 + p.userData.phase) * 0.06; });
    renderer.render(scene, camera);
  });
  renderer.render(scene, camera);
  return {
    destroy() { L.stop(); unsize(); window.removeEventListener('pointermove', onMove); window.removeEventListener('scroll', onScroll); disposeTree(scene); renderer.dispose(); renderer.domElement.remove(); },
    setTheme(c) { const list = c && c.pipes; if (!list) return; items.forEach((p, i) => p.userData.mats.forEach((m, k) => { m.color.set(list[i % list.length]); if (k) m.color.multiplyScalar(0.7); })); },
    setQuality() {}, pause: L.pause, resume: L.resume,
  };
}

// ───────────────────────── configurator
export function initPipeConfigurator(root, opts = {}) {
  const container = root.querySelector('[data-scene="configurator"]');
  if (!container) return null;
  const quality = opts.quality || 'medium';
  const clip = new Plane(new Vector3(0, 0, -1), 5);
  const renderer = makeRenderer(container, quality, true);
  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 100); camera.position.set(0, 1.4, 6.6);
  lighting(scene, renderer, quality);
  const holder = new Group(); scene.add(holder);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.enablePan = false; controls.minDistance = 4; controls.maxDistance = 11; controls.autoRotate = !opts.reducedMotion; controls.autoRotateSpeed = 1.2;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  const state = { size: 2, color: opts.colors && opts.colors.pipes ? opts.colors.pipes[0] : '#1e88e5', length: 3, section: false };
  const shown = { d: 0, len: 0, clip: 5 }; let want = { d: 1, len: 2, clip: 5 }; let pipe = null; let builtFor = '';
  const dims = () => ({ d: 0.25 + state.size * 0.17, len: 1.2 + state.length * 0.25 });
  function rebuild() {
    const { d, len } = dims();
    const key = `${d.toFixed(2)}|${len.toFixed(2)}|${state.color}`;
    if (key === builtFor) return; builtFor = key;
    if (pipe) { holder.remove(pipe); disposeTree(pipe); }
    pipe = makePipe(1, 1, state.color, { clip, quality }); pipe.rotation.z = Math.PI / 2; holder.add(pipe);
  }
  function read() {
    const v = (n) => { const els = root.querySelectorAll(`[data-cfg="${n}"]`); for (const el of els) { if ((el.type === 'radio' && el.checked) || (el.type === 'checkbox' && el.checked) || (el.type !== 'radio' && el.type !== 'checkbox')) return el.type === 'checkbox' ? true : el.value; } return null; };
    const s = parseFloat(v('size')); if (s > 0) state.size = s;
    const c = v('color'); if (c && /^#[0-9a-f]{3,8}$/i.test(c)) state.color = c;
    const l = parseFloat(v('length')); if (l > 0) state.length = l;
    state.section = !!v('section');
    const { d, len } = dims(); want = { d, len, clip: state.section ? 0 : len * 2 + 4 };
    document.dispatchEvent(new CustomEvent('cfg:change', { detail: { size: state.size, color: state.color, length: state.length, section: state.section } }));
  }
  const onChange = () => { read(); };
  root.addEventListener('change', onChange); root.addEventListener('input', onChange);
  read(); shown.d = want.d; shown.len = want.len; shown.clip = want.clip;
  const unsize = sizer(container, renderer, camera);
  const L = loop(container, renderer, (dt) => {
    const k = Math.min(1, dt * 7);
    shown.d += (want.d - shown.d) * k; shown.len += (want.len - shown.len) * k; shown.clip += (want.clip - shown.clip) * Math.min(1, dt * 4);
    rebuild();
    if (pipe) {
      pipe.scale.set(shown.d, shown.len, shown.d);
      pipe.userData.mats.forEach((m, i) => { m.color.lerp(new Color(state.color).multiplyScalar(i ? 0.7 : 1), Math.min(1, dt * 8)); });
    }
    clip.constant = shown.clip; clip.normal.set(0, 0, -1);
    controls.update();
    renderer.render(scene, camera);
  });
  return {
    destroy() { L.stop(); unsize(); controls.dispose(); root.removeEventListener('change', onChange); root.removeEventListener('input', onChange); disposeTree(scene); renderer.dispose(); renderer.domElement.remove(); },
    setTheme() {}, setQuality() {}, pause: L.pause, resume: L.resume, get state() { return { ...state }; },
  };
}
export const _math = MathUtils;
