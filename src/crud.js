'use strict';
// Generic, schema-driven CRUD. Table / column names come ONLY from the registry in schema.js (never from
// user input) and every value is bound as a parameter, so SQL injection is not possible through this layer.
const db = require('./db');
const cache = require('./cache');
const { MODELS } = require('./schema');
const { rich, plain } = require('./sanitize');
const { slugify, clean, parseJSON, isImagePath, nowISO, rand } = require('./util');
const audit = require('./audit');

const SQLTYPE = { number: 'REAL', bool: 'INTEGER', rel: 'INTEGER' };
const JSONT = new Set(['images', 'tags', 'kv', 'json']);
const sqlType = (t) => SQLTYPE[t] || 'TEXT';

// ───────────────────────── tables
function ensureTables() {
  for (const [key, m] of Object.entries(MODELS)) {
    const cols = m.fields.map((x) => `"${x.k}" ${sqlType(x.t)}${x.t === 'bool' ? ' NOT NULL DEFAULT ' + (x.def ? 1 : 0) : ''}`);
    db.exec(`CREATE TABLE IF NOT EXISTS "${key}"(id INTEGER PRIMARY KEY, sort INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
      i18n TEXT NOT NULL DEFAULT '{}', created_at TEXT, updated_at TEXT, ${cols.join(', ')})`);
    const have = new Set(db.prepare(`PRAGMA table_info("${key}")`).all().map((c) => c.name));
    for (const x of m.fields) {
      if (!have.has(x.k)) db.exec(`ALTER TABLE "${key}" ADD COLUMN "${x.k}" ${sqlType(x.t)}${x.t === 'bool' ? ' NOT NULL DEFAULT ' + (x.def ? 1 : 0) : ''}`);
    }
    if (m.slug) db.exec(`CREATE INDEX IF NOT EXISTS "idx_${key}_slug" ON "${key}"("${m.slug}")`);
    db.exec(`CREATE INDEX IF NOT EXISTS "idx_${key}_active_sort" ON "${key}"(active, sort)`);
  }
}

// ───────────────────────── hydrate / formatting
function hydrate(key, row) {
  if (!row) return row;
  const m = MODELS[key];
  const out = { ...row };
  for (const x of m.fields) {
    if (JSONT.has(x.t)) out[x.k] = parseJSON(out[x.k], x.t === 'kv' || x.t === 'json' ? (x.t === 'json' ? {} : []) : []);
  }
  out.i18n = parseJSON(row.i18n, {});
  return out;
}
const options = (x) => (typeof x.options === 'function' ? x.options() : x.options || []);

// Value for an <input> in the admin form.
function formValue(x, v) {
  if (v == null) return x.def != null && !JSONT.has(x.t) ? x.def : '';
  if (x.t === 'tags') return (Array.isArray(v) ? v : parseJSON(v, [])).join(', ');
  if (x.t === 'images') return (Array.isArray(v) ? v : parseJSON(v, [])).join('\n');
  if (x.t === 'kv') return (Array.isArray(v) ? v : parseJSON(v, [])).map((p) => `${p.k}: ${p.v}`).join('\n');
  if (x.t === 'json') return typeof v === 'string' ? v : JSON.stringify(v, null, 2);
  if (x.t === 'datetime' && typeof v === 'string') return v.slice(0, 16);
  return v;
}

// ───────────────────────── coercion + validation
function coerce(x, raw, errors, prefix = '') {
  const label = x.label || x.k;
  const v = raw == null ? '' : raw;
  const bad = (msg) => { errors[prefix + x.k] = `${label}: ${msg}`; return null; };
  switch (x.t) {
    case 'text': case 'slug': case 'color': {
      const s = clean(v, x.max || 300);
      if (x.pattern && s && !new RegExp(x.pattern).test(s)) return bad('invalid format');
      if (x.t === 'color' && s && !/^#[0-9a-f]{3,8}$/i.test(s)) return bad('invalid colour');
      return s;
    }
    case 'textarea': return clean(String(v).replace(/\r\n/g, '\n'), x.max || 5000).replace(/\u0000/g, '');
    case 'html': return rich(v);
    case 'number': { if (v === '' || v == null) return null; const n = Number(v); if (!Number.isFinite(n)) return bad('must be a number');
      if (x.min != null && n < x.min) return bad(`min ${x.min}`); if (x.max != null && n > x.max) return bad(`max ${x.max}`); return n; }
    case 'bool': return v === '1' || v === 'on' || v === 'true' || v === 1 || v === true ? 1 : 0;
    case 'select': { const s = String(v); if (s === '' && !x.req) return ''; return options(x).some((o) => String(o[0]) === s) ? s : bad('invalid choice'); }
    case 'image': { const s = require('./drive').normalize(clean(v, 1500), 'image'); if (!s) return ''; return isImagePath(s) ? s : bad('use an uploaded image, /placeholder/… or https:// URL'); }
    case 'images': {
      const arr = (Array.isArray(v) ? v : String(v).split(/\r?\n/)).map((s) => require('./drive').normalize(clean(s, 1500), 'image')).filter(Boolean).slice(0, 30);
      if (arr.some((s) => !isImagePath(s))) return bad('one of the image URLs is invalid');
      return JSON.stringify(arr);
    }
    case 'url': { let s = clean(v, 1500); if (!s) return ''; if (x.media) s = require('./drive').normalize(s, x.media); return /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)[^\s"'<>]*$/i.test(s) ? s : bad('must start with / or https://'); }
    case 'email': { const s = clean(v, 200); return !s || /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s) ? s : bad('invalid email'); }
    case 'date': { const s = clean(v, 10); return !s || /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : bad('use YYYY-MM-DD'); }
    case 'datetime': { const s = clean(v, 25); return !s || /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') : bad('invalid date/time'); }
    case 'tags': {
      const arr = (Array.isArray(v) ? v : String(v).split(/[,\n]/)).map((s) => clean(s, 80)).filter(Boolean).slice(0, 60);
      return JSON.stringify([...new Set(arr)]);
    }
    case 'kv': {
      const arr = (Array.isArray(v) ? v : String(v).split(/\r?\n/)).map((l) => {
        if (typeof l !== 'string') return l;
        const i = l.indexOf(':'); return i < 1 ? null : { k: clean(l.slice(0, i), 80), v: clean(l.slice(i + 1), 200) };
      }).filter((p) => p && p.k).slice(0, 40);
      return JSON.stringify(arr);
    }
    case 'json': {
      if (v === '' || v == null) return '{}';
      try { const o = typeof v === 'string' ? JSON.parse(v) : v; const s = JSON.stringify(o); if (s.length > 8000) return bad('too large'); return s; } catch { return bad('invalid JSON'); }
    }
    case 'rel': { if (v === '' || v == null) return null; const n = parseInt(v, 10); return Number.isInteger(n) ? n : bad('invalid selection'); }
    default: return clean(v, 300);
  }
}

function parseInput(key, input, existing) {
  const m = MODELS[key];
  const errors = {}; const values = {};
  for (const x of m.fields) {
    if (x.readonly) continue;
    // PATCH-like: only touch fields that were submitted (checkboxes are always submitted via the form helper).
    const needsSlug = x.t === 'slug' && x.from && (!existing || !existing[x.k]); // new rows (or rows that never got one) always get a slug
    if (!(x.k in input) && x.t !== 'bool' && !needsSlug) continue;
    let val = coerce(x, input[x.k], errors);
    if (x.t === 'slug' && !val && x.from) val = slugify(input[x.from] || (existing && existing[x.from]) || '');
    if (x.t === 'slug' && val) val = slugify(val);
    if (needsSlug && !val) val = `${slugify(key) || 'item'}-${Date.now().toString(36)}`; // e.g. a Tamil-only title
    if (x.req && (val === '' || val == null)) errors[x.k] = `${x.label || x.k} is required`;
    values[x.k] = val;
  }
  // Tamil (and any future language) overrides: input names are  ta__<field>
  const i18n = {};
  for (const x of m.fields) {
    if (!x.tr) continue;
    const raw = input['ta__' + x.k];
    if (raw == null || String(raw).trim() === '') continue;
    const e2 = {};
    const val = coerce({ ...x, req: 0, t: x.t === 'html' ? 'html' : x.t === 'tags' ? 'tags' : x.t === 'textarea' ? 'textarea' : 'text' }, raw, e2, 'ta__');
    if (Object.keys(e2).length) Object.assign(errors, e2); else i18n[x.k] = x.t === 'tags' ? parseJSON(val, []) : val;
  }
  return { values, errors, i18n: Object.keys(i18n).length ? { ta: i18n } : {} };
}

function uniqueSlug(key, slugField, slug, id) {
  if (!slug) return slug;
  let s = slug; let n = 2;
  const q = db.prepare(`SELECT id FROM "${key}" WHERE "${slugField}"=? AND id<>?`);
  while (q.get(s, id || 0)) s = `${slug}-${n++}`;
  return s;
}

// ───────────────────────── operations
function create(key, input, req) {
  const m = MODELS[key]; if (!m) throw new Error('unknown model');
  const { values, errors, i18n } = parseInput(key, input, null);
  if (Object.keys(errors).length) return { errors };
  if (m.slug && values[m.slug] !== undefined) values[m.slug] = uniqueSlug(key, m.slug, values[m.slug], 0);
  const maxSort = db.prepare(`SELECT COALESCE(MAX(sort),0)+1 n FROM "${key}"`).get().n;
  const cols = ['sort', 'active', 'i18n', 'created_at', 'updated_at', ...Object.keys(values)];
  const now = nowISO();
  const vals = [maxSort, input.active === undefined ? 1 : (input.active === '1' || input.active === 'on' || input.active === 1 ? 1 : 0), JSON.stringify(i18n), now, now, ...Object.values(values)];
  const r = db.prepare(`INSERT INTO "${key}"(${cols.map((c) => `"${c}"`).join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...vals);
  cache.bump();
  audit.log(req, 'create', key, r.lastInsertRowid, String(values[m.title] || '').slice(0, 80));
  return { id: Number(r.lastInsertRowid) };
}

function update(key, id, input, req) {
  const m = MODELS[key]; if (!m) throw new Error('unknown model');
  const existing = db.prepare(`SELECT * FROM "${key}" WHERE id=?`).get(id);
  if (!existing) return { notFound: true };
  const { values, errors, i18n } = parseInput(key, input, existing);
  if (Object.keys(errors).length) return { errors };
  if (m.slug && values[m.slug] !== undefined) values[m.slug] = uniqueSlug(key, m.slug, values[m.slug], id);
  const sets = { ...values, updated_at: nowISO(), i18n: JSON.stringify(i18n) };
  if ('active' in input) sets.active = input.active === '1' || input.active === 'on' || input.active === 1 || input.active === true ? 1 : 0;
  const names = Object.keys(sets);
  db.prepare(`UPDATE "${key}" SET ${names.map((c) => `"${c}"=?`).join(',')} WHERE id=?`).run(...names.map((c) => sets[c]), id);
  cache.bump();
  audit.log(req, 'update', key, id, String(values[m.title] || existing[m.title] || '').slice(0, 80));
  return { id };
}

function remove(key, id, req) {
  const m = MODELS[key]; if (!m) throw new Error('unknown model');
  const row = db.prepare(`SELECT "${m.title}" t FROM "${key}" WHERE id=?`).get(id);
  if (!row) return false;
  db.prepare(`DELETE FROM "${key}" WHERE id=?`).run(id);
  cache.bump();
  audit.log(req, 'delete', key, id, String(row.t || '').slice(0, 80));
  return true;
}
function toggle(key, id, req) {
  if (!MODELS[key]) throw new Error('unknown model');
  db.prepare(`UPDATE "${key}" SET active=1-active, updated_at=? WHERE id=?`).run(nowISO(), id);
  cache.bump(); audit.log(req, 'toggle', key, id);
}
function duplicate(key, id, req) {
  const m = MODELS[key]; const row = db.prepare(`SELECT * FROM "${key}" WHERE id=?`).get(id); if (!row) return null;
  const cols = ['sort', 'active', 'i18n', 'created_at', 'updated_at', ...m.fields.map((x) => x.k)];
  const vals = cols.map((c) => row[c]);
  const ti = cols.indexOf(m.title); if (ti >= 0) vals[ti] = `${row[m.title]} (copy)`.slice(0, 160);
  if (m.slug) { const si = cols.indexOf(m.slug); vals[si] = uniqueSlug(key, m.slug, `${row[m.slug]}-copy`, 0); }
  vals[0] = (row.sort || 0) + 1; vals[1] = 0; vals[3] = vals[4] = nowISO();
  const r = db.prepare(`INSERT INTO "${key}"(${cols.map((c) => `"${c}"`).join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...vals);
  cache.bump(); audit.log(req, 'duplicate', key, id);
  return Number(r.lastInsertRowid);
}
function reorder(key, ids, req) {
  if (!MODELS[key]) throw new Error('unknown model');
  const st = db.prepare(`UPDATE "${key}" SET sort=? WHERE id=?`);
  db.transaction(() => ids.forEach((id, i) => st.run(i + 1, parseInt(id, 10) || 0)))();
  cache.bump(); audit.log(req, 'reorder', key, '', `${ids.length} items`);
}
function move(key, id, dir, req) {
  const m = MODELS[key]; const rows = db.prepare(`SELECT id FROM "${key}" ORDER BY ${orderBy(m)}`).all().map((r) => r.id);
  const i = rows.indexOf(id); const j = dir === 'up' ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return;
  [rows[i], rows[j]] = [rows[j], rows[i]];
  reorder(key, rows, req);
}

// ───────────────────────── queries
const escLike = (s) => String(s).replace(/[\\%_]/g, '\\$&');
function orderBy(m, sort, dir) {
  const allowed = new Set(['id', 'sort', 'created_at', 'updated_at', ...m.fields.map((x) => x.k)]);
  if (sort && allowed.has(sort)) return `"${sort}" ${dir === 'desc' ? 'DESC' : 'ASC'}, id DESC`;
  return m.order || (m.sortable ? 'sort ASC, id ASC' : 'id DESC');
}

function list(key, { q = '', page = 1, per = 25, sort, dir, filters = {}, onlyActive = false, hydrateRows = true, limit } = {}) {
  const m = MODELS[key]; if (!m) throw new Error('unknown model');
  const where = []; const args = [];
  if (onlyActive) where.push('active=1');
  if (q && m.search) { where.push('(' + m.search.map((c) => `"${c}" LIKE ? ESCAPE '\\'`).join(' OR ') + ')'); m.search.forEach(() => args.push(`%${escLike(q)}%`)); }
  for (const [k, v] of Object.entries(filters)) {
    if (m.fields.some((x) => x.k === k) || k === 'active') { where.push(`"${k}"=?`); args.push(v); }
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM "${key}" ${w}`).get(...args).n;
  const lim = limit ? `LIMIT ${parseInt(limit, 10) || 50}` : `LIMIT ${Math.min(200, parseInt(per, 10) || 25)} OFFSET ${(Math.max(1, parseInt(page, 10) || 1) - 1) * Math.min(200, parseInt(per, 10) || 25)}`;
  const rows = db.prepare(`SELECT * FROM "${key}" ${w} ORDER BY ${orderBy(m, sort, dir)} ${lim}`).all(...args);
  return { rows: hydrateRows ? rows.map((r) => hydrate(key, r)) : rows, total };
}
const get = (key, id) => hydrate(key, db.prepare(`SELECT * FROM "${key}" WHERE id=?`).get(id));
const bySlug = (key, slug, onlyActive = true) => {
  const m = MODELS[key];
  return hydrate(key, db.prepare(`SELECT * FROM "${key}" WHERE "${m.slug}"=? ${onlyActive ? 'AND active=1' : ''}`).get(slug));
};
// Cached helper used by the public site.
const active = (key, { where = '', args = [], limit, order } = {}) =>
  cache.memo(`active:${key}:${where}:${args.join('|')}:${limit || ''}:${order || ''}`, 60000, () => {
    const m = MODELS[key];
    return db.prepare(`SELECT * FROM "${key}" WHERE active=1 ${where ? 'AND ' + where : ''} ORDER BY ${order || orderBy(m)} ${limit ? 'LIMIT ' + parseInt(limit, 10) : ''}`).all(...args).map((r) => hydrate(key, r));
  });

// Tamil-aware field accessor: tr(row,'name','ta')
const tr = (row, field, lang) => (lang && lang !== 'en' && row && row.i18n && row.i18n[lang] && row.i18n[lang][field] != null && row.i18n[lang][field] !== '' ? row.i18n[lang][field] : row ? row[field] : '');

// Re-sanitise translations coming from an imported file.
function cleanI18n(m, raw) {
  const src = parseJSON(typeof raw === 'string' ? raw : JSON.stringify(raw || {}), {});
  const out = {};
  for (const [lang, fields] of Object.entries(src)) {
    if (!/^[a-z]{2}$/.test(lang) || !fields || typeof fields !== 'object') continue;
    out[lang] = {};
    for (const x of m.fields) {
      if (!x.tr || !(x.k in fields)) continue;
      const v = fields[x.k];
      if (Array.isArray(v)) out[lang][x.k] = v.map((s) => clean(s, 80)).slice(0, 60);
      else out[lang][x.k] = x.t === 'html' ? rich(v) : clean(v, x.max || 5000);
    }
  }
  return JSON.stringify(out);
}

// Export / import all content (Admin → Backup)
function exportAll() {
  const out = { exported_at: nowISO(), version: 1, models: {} };
  for (const key of Object.keys(MODELS)) out.models[key] = db.prepare(`SELECT * FROM "${key}" ORDER BY id`).all();
  return out;
}
function importAll(data, req) {
  if (!data || typeof data !== 'object' || !data.models) throw new Error('Invalid backup file');
  let count = 0;
  db.transaction(() => {
    for (const [key, rows] of Object.entries(data.models)) {
      const m = MODELS[key]; if (!m || !Array.isArray(rows)) continue;
      const cols = ['id', 'sort', 'active', 'i18n', 'created_at', 'updated_at', ...m.fields.map((x) => x.k)];
      db.prepare(`DELETE FROM "${key}"`).run();
      const st = db.prepare(`INSERT INTO "${key}"(${cols.map((c) => `"${c}"`).join(',')}) VALUES(${cols.map(() => '?').join(',')})`);
      for (const r of rows.slice(0, 20000)) {
        // Re-validate every value through the same coercion used by the forms (never trust a file blindly).
        const errs = {}; const clean_ = {};
        for (const x of m.fields) {
          let raw = r[x.k];
          if (JSONT.has(x.t) && typeof raw === 'string') { raw = x.t === 'kv' ? parseJSON(raw, []).map((p) => `${p.k}: ${p.v}`).join('\n') : x.t === 'json' ? raw : parseJSON(raw, []); }
          clean_[x.k] = coerce({ ...x, req: 0 }, raw, errs);
          if (clean_[x.k] === null && !['number', 'rel'].includes(x.t)) clean_[x.k] = '';
        }
        st.run(parseInt(r.id, 10) || null, parseInt(r.sort, 10) || 0, r.active ? 1 : 0, cleanI18n(m, r.i18n), r.created_at || nowISO(), nowISO(), ...m.fields.map((x) => clean_[x.k]));
        count++;
      }
    }
  })();
  cache.bump(); audit.log(req, 'import', 'content', '', `${count} rows`);
  return count;
}

module.exports = { ensureTables, create, update, remove, toggle, duplicate, reorder, move, list, get, bySlug, active, tr, hydrate, formValue, options, exportAll, importAll, plain, rand };
