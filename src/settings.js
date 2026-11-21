'use strict';
const db = require('./db');
const cache = require('./cache');
const { SETTINGS, BY_KEY } = require('./settings_schema');
const { encrypt, decrypt, clean, nowISO } = require('./util');

const selAll = db.prepare("SELECT key,value FROM settings WHERE key NOT LIKE '\\_%' ESCAPE '\\'");
const upsert = db.prepare('INSERT INTO settings(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at');

// Merged defaults + stored values (secrets decrypted). Cached until any write.
function all() {
  return cache.memo('settings:all', 60000, () => {
    const out = {};
    for (const d of SETTINGS) out[d.key] = d.def;
    for (const r of selAll.all()) {
      const def = BY_KEY[r.key];
      if (!def) continue;
      out[r.key] = def.type === 'secret' ? decrypt(r.value) : r.value;
    }
    return out;
  });
}
const get = (k) => all()[k];
const bool = (k) => { const v = all()[k]; return v === '1' || v === 'true' || v === true; };
const num = (k, d = 0) => { const n = parseFloat(all()[k]); return Number.isFinite(n) ? n : d; };

function validate(def, raw) {
  let v = raw == null ? '' : raw;
  switch (def.type) {
    case 'bool': return v === '1' || v === 'on' || v === 'true' || v === true ? '1' : '0';
    case 'number': { const n = parseFloat(v); return Number.isFinite(n) ? String(n) : ''; }
    case 'select': return (def.options || []).some((o) => o[0] === v) ? v : def.def;
    case 'email': v = clean(v, 200); return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(v) || v === '' ? v : null;
    case 'url': case 'image':
      v = clean(v, 1500);
      if (v && !/^(https?:\/\/|\/)[^\s"'<>]*$/i.test(v)) return null;
      // a pasted Google Drive share link is converted to a link the website can really use
      if (v && (def.type === 'image' || def.media)) v = require('./drive').normalize(v, def.type === 'image' ? 'image' : def.media);
      return v;
    case 'color': v = clean(v, 20); return /^#[0-9a-f]{3,8}$/i.test(v) || v === '' ? v : null;
    case 'textarea': return def.code ? String(v).replace(/</g, '').replace(/@import[^;]*;?/gi, '').replace(/javascript:/gi, '').slice(0, 20000) : clean(v, 4000);
    case 'secret': return String(v).slice(0, 500);
    default: return clean(v, def.type === 'tel' ? 40 : 300);
  }
}

// Save a subset of settings. Returns {saved:[keys], errors:{key:msg}}.
function save(values, keys) {
  const saved = []; const errors = {};
  const targetDefs = keys ? SETTINGS.filter((d) => keys.includes(d.key)) : SETTINGS.filter((d) => d.key in values);
  const tx = db.transaction(() => {
    for (const def of targetDefs) {
      if (!(def.key in values)) {
        if (def.type === 'bool') values[def.key] = '0'; else continue; // unchecked checkbox
      }
      if (def.type === 'secret' && (values[def.key] === '' || values[def.key] === '********')) continue; // keep existing
      const v = validate(def, values[def.key]);
      if (v === null) { errors[def.key] = 'Invalid value'; continue; }
      upsert.run(def.key, def.type === 'secret' && v ? encrypt(v) : v, nowISO());
      saved.push(def.key);
    }
  });
  tx();
  if (saved.length) cache.bump();
  return { saved, errors };
}
function setOne(key, value) { return save({ [key]: value }, [key]); }

module.exports = { all, get, bool, num, save, setOne, SETTINGS, BY_KEY };
