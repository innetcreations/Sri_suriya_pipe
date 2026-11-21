'use strict';
// Google Drive helpers.
//  1. normalize(): turn any pasted Drive "share" link into a link the website can really use
//     (image -> direct image URL, video -> embeddable player URL, PDF/file -> preview/download URL).
//  2. upload(): optional server-side upload into YOUR Drive folder through YOUR Apps Script web app
//     (docs/GOOGLE_DRIVE.md). The access key stays on the server and is only ever sent to Google.
// Nothing here fetches an address that a visitor controls (no SSRF): the upload target must be a Google Apps Script URL.
const cfg = require('./config');

const ID = '[A-Za-z0-9_-]{20,}';
// Accepts: /file/d/ID/view, /open?id=ID, /uc?id=ID, /uc?export=view&id=ID, /thumbnail?id=ID, lh3.googleusercontent.com/d/ID, docs.google.com/.../d/ID
function driveId(u) {
  let url; try { url = new URL(String(u).trim()); } catch { return ''; }
  if (url.protocol !== 'https:') return '';
  const h = url.hostname.toLowerCase();
  if (h === 'drive.google.com' || h === 'docs.google.com') {
    const m = url.pathname.match(new RegExp(`/d/(${ID})`)); if (m) return m[1];
    const q = url.searchParams.get('id'); if (q && new RegExp(`^${ID}$`).test(q)) return q;
  }
  if (/^lh\d\.googleusercontent\.com$/.test(h)) { const m = url.pathname.match(new RegExp(`^/d/(${ID})`)); if (m) return m[1]; }
  return '';
}
const isFolderLink = (u) => /^https:\/\/drive\.google\.com\/(drive\/(u\/\d+\/)?folders|folderview)/i.test(String(u).trim());

// kind: 'image' | 'video' | 'file' | 'any'
function normalize(u, kind = 'any') {
  const s = String(u || '').trim(); const id = driveId(s);
  if (!id) return s;
  if (kind === 'video') return `https://drive.google.com/file/d/${id}/preview`;
  if (kind === 'file') return `https://drive.google.com/uc?export=download&id=${id}`;
  return `https://lh3.googleusercontent.com/d/${id}`;               // image (and the default for 'any')
}
const isDriveVideo = (u) => /^https:\/\/drive\.google\.com\/file\/d\/[\w-]+\/preview$/.test(String(u || ''));
const isDirectVideoFile = (u) => /\.(mp4|webm|ogv)(\?|#|$)/i.test(String(u || '')) || /^\/(uploads|assets)\//.test(String(u || ''));

// Classify a pasted link so the media library can show the right icon and the right player.
function classify(u) {
  const s = String(u || '').trim();
  const id = driveId(s);
  if (id) return { source: 'drive', id };
  if (/^https:\/\/(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//i.test(s)) return { source: 'link', kind: 'video' };
  if (/\.(jpe?g|png|webp|gif|avif)(\?|#|$)/i.test(s)) return { source: 'link', kind: 'image' };
  if (/\.(mp4|webm|ogv)(\?|#|$)/i.test(s)) return { source: 'link', kind: 'video' };
  if (/\.pdf(\?|#|$)/i.test(s)) return { source: 'link', kind: 'file' };
  return { source: 'link', kind: 'file' };
}

// ---- optional upload to Drive through the user's Apps Script web app
const cfgOf = () => { const settings = require('./settings'); return { url: settings.get('drive_script_url') || cfg.DRIVE_SCRIPT_URL, key: settings.get('drive_admin_key') || cfg.DRIVE_ADMIN_KEY }; };
const enabled = () => { const c = cfgOf(); return !!(c.url && c.key); };
function allowedTarget(u) {
  let url; try { url = new URL(u); } catch { return false; }
  if (url.protocol === 'https:' && /^script\.google\.com$/i.test(url.hostname) && /^\/macros\/s\/[\w-]+\/exec$/.test(url.pathname)) return true;
  // local mock server for automated tests only
  return !cfg.isProd && url.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(url.hostname);
}
const okFinalHost = (u) => { try { const h = new URL(u); return (h.protocol === 'https:' && /(^|\.)google(usercontent)?\.com$/i.test(h.hostname)) || (!cfg.isProd && ['127.0.0.1', 'localhost'].includes(h.hostname)); } catch { return false; } };

async function upload(buffer, name, mime) {
  const c = cfgOf();
  if (!c.url || !c.key) throw new Error('Google Drive upload is not set up yet (Settings -> Media & Storage).');
  if (!allowedTarget(c.url)) throw new Error('The Apps Script URL must look like https://script.google.com/macros/s/.../exec');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 45000);
  try {
    // text/plain avoids a CORS pre-flight and is what Apps Script web apps accept
    const res = await fetch(c.url, { method: 'POST', redirect: 'follow', signal: ctl.signal, headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'upload', key: c.key, name, mime, data: buffer.toString('base64') }) });
    if (!okFinalHost(res.url)) throw new Error('Unexpected redirect target.');
    const j = await res.json().catch(() => null);
    if (!j || !j.ok) {
      let err = (j && j.error) || `Drive upload failed (HTTP ${res.status}).`;
      if (/Access denied: DriveApp/i.test(err)) {
        err = 'Drive authorization needed: open script.google.com, run authorizeScript(), and redeploy (Manage deployments -> Edit -> New version).';
      }
      throw new Error(err);
    }
    if (!new RegExp(`^${ID}$`).test(String(j.id || ''))) throw new Error('Drive returned an unexpected file id.');
    return { id: j.id, name: String(j.name || name).slice(0, 120) };
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'Google Drive did not answer in time.' : e.message); } finally { clearTimeout(t); }
}

module.exports = { driveId, isFolderLink, normalize, classify, isDriveVideo, isDirectVideoFile, upload, enabled, allowedTarget };
