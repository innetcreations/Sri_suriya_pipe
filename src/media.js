'use strict';
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('./db');
const cfg = require('./config');
const { rand, nowISO, clean } = require('./util');
const audit = require('./audit');
const drive = require('./drive');

// Detect the real file type from magic bytes. The client-supplied name / MIME type is never trusted.
function detect(b) {
  if (b.length < 12) return null;
  const ascii = (s, e) => b.toString('latin1', s, e);
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg', kind: 'image' };
  if (b[0] === 0x89 && ascii(1, 4) === 'PNG') return { ext: 'png', mime: 'image/png', kind: 'image' };
  if (ascii(0, 4) === 'GIF8') return { ext: 'gif', mime: 'image/gif', kind: 'image' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { ext: 'webp', mime: 'image/webp', kind: 'image' };
  if (ascii(4, 8) === 'ftyp') { const brand = ascii(8, 12); if (/avif|avis/.test(brand)) return { ext: 'avif', mime: 'image/avif', kind: 'image' }; return { ext: 'mp4', mime: 'video/mp4', kind: 'video' }; }
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return { ext: 'webm', mime: 'video/webm', kind: 'video' };
  if (ascii(0, 4) === '%PDF') return { ext: 'pdf', mime: 'application/pdf', kind: 'file' };
  if (ascii(0, 4) === 'glTF') return { ext: 'glb', mime: 'model/gltf-binary', kind: 'model' };
  if (ascii(0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return { ext: 'mp3', mime: 'audio/mpeg', kind: 'audio' };
  if (ascii(0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg', kind: 'audio' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE') return { ext: 'wav', mime: 'audio/wav', kind: 'audio' };
  return null; // SVG, HTML, scripts, executables… are all rejected on purpose (stored-XSS risk)
}

const maxMb = Math.max(cfg.UPLOAD_MAX_MB, cfg.VIDEO_MAX_MB);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024, files: 10, fields: 10, parts: 30 } });

// Files uploaded from the admin are stored in the project's assets folder (public/assets/uploads) and served from /assets/uploads/…
// If UPLOAD_DIR points somewhere outside public/ (e.g. a mounted disk) they are served from /uploads/… instead.
const relToPublic = path.relative(cfg.PUBLIC_DIR, cfg.UPLOAD_DIR);
const URL_PREFIX = relToPublic && !relToPublic.startsWith('..') && !path.isAbsolute(relToPublic) ? '/' + relToPublic.split(path.sep).join('/') : '/uploads';
const localPath = (url) => {                       // URL -> file on disk (only inside UPLOAD_DIR), else null
  const u = String(url || ''); const pre = [URL_PREFIX + '/', '/uploads/'].find((p) => u.startsWith(p)); if (!pre) return null;
  const full = path.join(cfg.UPLOAD_DIR, u.slice(pre.length)); return full.startsWith(cfg.UPLOAD_DIR + path.sep) ? full : null;
};
const limitFor = (kind) => (kind === 'video' ? cfg.VIDEO_MAX_MB : cfg.UPLOAD_MAX_MB);
const insert = (row, req) => {
  const r = db.prepare('INSERT INTO media(file,original,mime,kind,size,alt,uploaded_by,created_at,source,thumb) VALUES(?,?,?,?,?,?,?,?,?,?)').run(row.file, row.original, row.mime, row.kind, row.size || 0, '', req && req.user ? req.user.id : null, nowISO(), row.source, row.thumb || '');
  audit.log(req, row.source === 'local' ? 'upload' : 'add-link', 'media', r.lastInsertRowid, `${row.original} (${row.kind}, ${row.source})`);
  return { id: Number(r.lastInsertRowid), file: row.file, kind: row.kind, mime: row.mime, original: row.original, source: row.source };
};
const driveRow = (id, name, mime, kind) => {
  const file = drive.normalize(`https://drive.google.com/file/d/${id}/view`, kind === 'video' ? 'video' : kind === 'image' ? 'image' : 'file');
  return { file, original: name, mime, kind, source: 'drive', thumb: kind === 'image' ? file : '' };
};

// target: 'local' (assets folder) or 'drive' (your Google Drive via Apps Script). Always async.
async function save(file, req, target = 'local') {
  const info = detect(file.buffer);
  const orig = clean(path.basename(String(file.originalname)), 120);
  if (!info) return { error: `${orig}: unsupported or unsafe file type (allowed: JPG, PNG, WebP, GIF, AVIF, MP4, WebM, PDF, GLB, MP3, OGG, WAV)` };
  if (file.size > limitFor(info.kind) * 1024 * 1024) return { error: `${orig}: too large (max ${limitFor(info.kind)} MB for ${info.kind === 'video' ? 'videos' : 'this file type'}). For bigger files upload to Google Drive and paste the link.` };
  if (target === 'drive') {
    try {
      const up = await drive.upload(file.buffer, `${rand(6).replace(/[^A-Za-z0-9]/g, 'x')}-${orig}`.slice(0, 120), info.mime);
      return insert(driveRow(up.id, orig, info.mime, info.kind), req);
    } catch (e) { return { error: `${orig}: ${e.message}` }; }
  }
  if (!cfg.UPLOADS_WRITABLE) return { error: 'This host cannot store files on disk (for example Vercel). Choose “My Google Drive folder” as the upload target, or paste a public link.' };
  const sub = new Date().toISOString().slice(0, 7).replace('-', '');
  const dir = path.join(cfg.UPLOAD_DIR, sub);
  fs.mkdirSync(dir, { recursive: true });
  const name = `${rand(12).replace(/[^A-Za-z0-9]/g, 'x')}.${info.ext}`;
  fs.writeFileSync(path.join(dir, name), file.buffer, { mode: 0o644 });
  return insert({ file: `${URL_PREFIX}/${sub}/${name}`, original: orig, mime: info.mime, kind: info.kind, size: file.size, source: 'local' }, req);
}

// "Paste a link": Google Drive share links are converted automatically; any other https link is kept as it is.
function addLink(rawUrl, { title = '', kind = '' } = {}, req) {
  const url = String(rawUrl || '').trim();
  if (drive.isFolderLink(url)) return { error: 'That is a folder link. Open the folder, right-click one file → Share → Anyone with the link → Copy link, and paste that file link.' };
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url) || url.length > 1500) return { error: 'Paste a full link that starts with https://' };
  const c = drive.classify(url); const name = clean(title, 120) || (c.id ? 'Google Drive file' : url.replace(/^https:\/\//, '').slice(0, 80));
  const k = ['image', 'video', 'file'].includes(kind) ? kind : (c.kind || 'image');
  const file = c.id ? drive.normalize(url, k === 'video' ? 'video' : k === 'image' ? 'image' : 'file') : url;
  const ex = db.prepare('SELECT * FROM media WHERE file=?').get(file);
  if (ex) return { id: ex.id, file: ex.file, kind: ex.kind, mime: ex.mime, original: ex.original, source: ex.source, existing: true };
  return insert({ file, original: name, mime: k === 'image' ? 'image/*' : k === 'video' ? 'video/*' : 'application/octet-stream', kind: k, source: c.id ? 'drive' : 'link', thumb: c.id && k === 'image' ? file : '' }, req);
}

function list({ kind = '', q = '', source = '', page = 1, per = 48 } = {}) {
  const where = []; const args = [];
  if (kind) { where.push('kind=?'); args.push(kind); }
  if (source) { where.push('source=?'); args.push(source); }
  if (q) { where.push("original LIKE ? ESCAPE '\\'"); args.push(`%${q.replace(/[\\%_]/g, '\\$&')}%`); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.prepare(`SELECT COUNT(*) n FROM media ${w}`).get(...args).n;
  const rows = db.prepare(`SELECT * FROM media ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, per, (Math.max(1, page) - 1) * per);
  return { rows, total };
}
function remove(id, req) {
  const m = db.prepare('SELECT * FROM media WHERE id=?').get(id); if (!m) return false;
  if (m.source === 'local') { const full = localPath(m.file); if (full) { try { fs.unlinkSync(full); } catch { /* already gone */ } } }
  db.prepare('DELETE FROM media WHERE id=?').run(id);   // a Drive / external file is only forgotten here, never deleted from Drive
  audit.log(req, 'delete', 'media', id, m.original);
  return true;
}

// Files you copied by hand into public/assets (images, videos, brand…): listed so you can pick them in any image field.
const EXT_KIND = { jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', avif: 'image', svg: 'image', mp4: 'video', webm: 'video', pdf: 'file', glb: 'model', mp3: 'audio' };
function scanAssets({ kind = '', q = '' } = {}) {
  const root = path.join(cfg.PUBLIC_DIR, 'assets'); const out = [];
  const walk = (dir, depth) => {
    if (depth > 4 || out.length >= 600) return;
    let ents; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.name.startsWith('.')) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (full === cfg.UPLOAD_DIR) continue; walk(full, depth + 1); continue; }
      const k = EXT_KIND[path.extname(e.name).slice(1).toLowerCase()]; if (!k) continue;
      if (kind && k !== kind) continue; if (q && !e.name.toLowerCase().includes(q.toLowerCase())) continue;
      let size = 0; try { size = fs.statSync(full).size; } catch { /* ignore */ }
      out.push({ file: '/assets/' + path.relative(root, full).split(path.sep).join('/'), original: e.name, kind: k, size, source: 'assets' });
    }
  };
  walk(root, 0); return out;
}
module.exports = { upload, save, addLink, list, remove, detect, scanAssets, URL_PREFIX, localPath };
