'use strict';
// Privacy-friendly visitor statistics.
//  - No IP addresses and no raw User-Agent text are stored. A "visitor" is a hash that includes a secret and the date, so it
//    cannot be reversed or followed from one day to the next.
//  - Only if the visitor presses "Accept" on the cookie notice, a random first-party id cookie (ssp_vid) is added so we can tell
//    NEW from RETURNING visitors. Without consent every statistic is still counted, just anonymously.
//  - Device / browser / OS / language / referrer / hour are stored as simple daily counters (tiny and fast).
//  - Country and city come from the hosting provider's headers when available (Vercel / Cloudflare).
const db = require('./db');
const { sha, today } = require('./util');
const cfg = require('./config');
const settings = require('./settings');
const { parseUA, geo, countryName } = require('./ua');

const BOT = /bot|crawl|spider|slurp|bing|yandex|baidu|duckduck|facebookexternalhit|whatsapp|telegram|preview|lighthouse|pingdom|uptime|monitor|curl|wget|python|java\/|go-http|headless|scrapy|ahrefs|semrush|mj12|gtmetrix|pagespeed/i;
const VID = /^[a-f0-9]{24}$/;
const hex24 = () => require('crypto').randomBytes(12).toString('hex');
const newBuf = () => ({ events: [], times: new Map(), day: today() });
let buf = newBuf();
buf.refs = { day: today(), set: new Set() };   // distinct referrers seen today (capped)

const upPath = db.prepare('INSERT INTO analytics_daily(day,path,views) VALUES(?,?,?) ON CONFLICT(day,path) DO UPDATE SET views=views+excluded.views');
const upUniq = db.prepare('INSERT OR IGNORE INTO analytics_uniques(day,vh) VALUES(?,?)');
const upDim = db.prepare('INSERT INTO analytics_dim(day,dim,val,n) VALUES(?,?,?,?) ON CONFLICT(day,dim,val) DO UPDATE SET n=n+excluded.n');
const upTime = db.prepare('INSERT INTO analytics_time(day,path,secs,n) VALUES(?,?,?,?) ON CONFLICT(day,path) DO UPDATE SET secs=secs+excluded.secs, n=n+excluded.n');
const insVisit = db.prepare('INSERT INTO analytics_visits(ts,path,dev,os,browser,country,city,ref,lang,ret,vh) VALUES(?,?,?,?,?,?,?,?,?,?,?)');

const hourIST = (d = new Date()) => String(new Date(d.getTime() + 330 * 60000).getUTCHours()).padStart(2, '0');
const consented = (req) => !settings.bool('cookie_banner') || (req.cookies && req.cookies.ssp_consent === 'all');

// Called for every successful public HTML page view (after the response was sent).
function record(req, res) {
  try {
    if (!settings.bool('analytics_on')) return;
    if (req.user) return;                                         // never count the owner's own browsing
    const ua = req.get('user-agent') || '';
    if (!ua || BOT.test(ua)) return;
    if (req.get('purpose') === 'prefetch' || req.get('sec-purpose')) return;
    const day = today();
    if (day !== buf.day) flush();
    const d = parseUA(ua); const g = geo(req);
    const p = (req.path.replace(/^\/ta(?=\/|$)/, '') || '/').slice(0, 160);
    let ref = 'direct'; const r = req.get('referer');
    if (r) { try { const h = new URL(r).hostname.replace(/^www\./, ''); if (h && h !== req.hostname) ref = h.slice(0, 80); } catch { /* ignore */ } }
    if (req.query && /^[\w.-]{1,40}$/.test(String(req.query.utm_source || ''))) ref = `${String(req.query.utm_source).toLowerCase()} (campaign)`;
    if (ref !== 'direct') { if (buf.refs.day !== day) buf.refs = { day, set: new Set() }; if (!buf.refs.set.has(ref)) { if (buf.refs.set.size >= 300) ref = 'other'; else buf.refs.set.add(ref); } }
    const vid = req.cookies && req.cookies.ssp_vid;
    const known = consented(req) && VID.test(vid || '');
    const vh = known ? sha(`vid|${vid}|${day}`).slice(0, 24) : sha(`${cfg.SECRET}|${day}|${req.ip}|${ua}`).slice(0, 24);
    const lang = String(req.get('accept-language') || '').slice(0, 2).toLowerCase().replace(/[^a-z]/g, '') || '??';
    buf.events.push({ day, ts: new Date().toISOString(), hour: hourIST(), p, d, g, ref, vh, ret: known ? 1 : 0, lang });
    if (cfg.IS_VERCEL || buf.events.length >= 500) flush();       // serverless instances can be frozen at any time: write straight away
  } catch { /* never break a request for analytics */ }
}

// Sets the optional "returning visitor" cookie, only after consent. Runs before the page is sent.
function ensureVisitorCookie(req, res) {
  try {
    if (!settings.bool('analytics_on') || req.user) return;
    if (!(settings.bool('cookie_banner') && req.cookies && req.cookies.ssp_consent === 'all')) return;
    if (VID.test(req.cookies.ssp_vid || '')) return;
    res.cookie('ssp_vid', hex24(), { maxAge: 180 * 864e5, httpOnly: true, sameSite: 'lax', secure: cfg.HTTPS, path: '/' });
  } catch { /* ignore */ }
}

function timeOnPage(path, secs) {
  try {
    if (!settings.bool('analytics_on')) return;
    const p = String(path || '/').replace(/^\/ta(?=\/|$)/, '').slice(0, 160) || '/'; if (!p.startsWith('/')) return;
    const s = Math.max(0, Math.min(1800, Math.round(Number(secs) || 0))); if (s < 1) return;
    const k = p;
    // only pages that were really viewed today can collect time (stops made-up paths from filling the table)
    if (!buf.times.has(k) && !buf.events.some((e) => e.p === k) && !db.prepare('SELECT 1 FROM analytics_daily WHERE day=? AND path=?').get(today(), k)) return;
    const cur = buf.times.get(k) || { secs: 0, n: 0 }; cur.secs += s; cur.n += 1; buf.times.set(k, cur);
    if (cfg.IS_VERCEL) flush();
  } catch { /* ignore */ }
}

function flush() {
  const b = buf; const refs = b.refs; buf = newBuf(); buf.refs = refs;
  if (!b.events.length && !b.times.size) return;
  try {
    db.transaction(() => {
      const paths = new Map(); const dims = new Map(); const uniq = new Set();
      const bump = (m, k, n = 1) => m.set(k, (m.get(k) || 0) + n);
      for (const e of b.events) {
        bump(paths, `${e.day}\u0001${e.p}`);
        uniq.add(`${e.day}\u0001${e.vh}`);
        for (const [dim, val] of [['dev', e.d.device], ['os', e.d.os], ['browser', e.d.browser], ['country', e.g.country || '??'], ['lang', e.lang], ['ref', e.ref], ['hour', e.hour], ['vtype', e.ret ? 'returning' : 'new']]) bump(dims, `${e.day}\u0001${dim}\u0001${val}`);
        insVisit.run(e.ts, e.p, e.d.device, e.d.os, e.d.browser, e.g.country, e.g.city, e.ref, e.lang, e.ret, e.vh);
      }
      for (const [k, n] of paths) { const [day, p] = k.split('\u0001'); upPath.run(day, p, n); }
      for (const k of uniq) { const [day, vh] = k.split('\u0001'); upUniq.run(day, vh); }
      for (const [k, n] of dims) { const [day, dim, val] = k.split('\u0001'); upDim.run(day, dim, val, n); }
      for (const [p, t] of b.times) upTime.run(b.day, p, t.secs, t.n);
    })();
  } catch (e) { console.error('[analytics] flush failed', e.message); }
}
const timer = setInterval(flush, 15000); timer.unref();

// Middleware: counts successful HTML page views after the response is sent.
function middleware(req, res, next) {
  if (req.method === 'GET') {
    ensureVisitorCookie(req, res);
    res.on('finish', () => { if (res.statusCode === 200 && /text\/html/.test(res.getHeader('content-type') || '')) record(req, res); });
  }
  next();
}

const isoDay = (offset = 0) => new Date(Date.now() - offset * 864e5).toISOString().slice(0, 10);
function dim(name, from, limit = 8) {
  return db.prepare('SELECT val, SUM(n) n FROM analytics_dim WHERE dim=? AND day>=? GROUP BY val ORDER BY n DESC LIMIT ?').all(name, from, limit);
}
function summary(days = 30) {
  flush();   // include what is still in memory
  const from = isoDay(days - 1);
  const daily = db.prepare('SELECT day, SUM(views) views FROM analytics_daily WHERE day>=? GROUP BY day ORDER BY day').all(from);
  const uniq = Object.fromEntries(db.prepare('SELECT day, COUNT(*) n FROM analytics_uniques WHERE day>=? GROUP BY day').all(from).map((r) => [r.day, r.n]));
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = isoDay(i); const row = daily.find((x) => x.day === d);
    series.push({ day: d, views: row ? row.views : 0, visitors: uniq[d] || 0 });
  }
  const t = db.prepare('SELECT SUM(secs) s, SUM(n) n FROM analytics_time WHERE day>=?').get(from);
  const hours = Object.fromEntries(dim('hour', from, 24).map((r) => [r.val, r.n]));
  const sumDays = (n) => series.slice(-n).reduce((a, b) => ({ views: a.views + b.views, visitors: a.visitors + b.visitors }), { views: 0, visitors: 0 });
  return {
    series, today: sumDays(1), last7: sumDays(7),
    totalViews: series.reduce((a, b) => a + b.views, 0), totalVisitors: series.reduce((a, b) => a + b.visitors, 0),
    avgSeconds: t && t.n ? Math.round(t.s / t.n) : 0,
    top: db.prepare('SELECT path, SUM(views) views FROM analytics_daily WHERE day>=? GROUP BY path ORDER BY views DESC LIMIT 12').all(from),
    refs: dim('ref', from, 8), devs: dim('dev', from, 5).map((r) => ({ kind: r.val, n: r.n })), os: dim('os', from, 6), browsers: dim('browser', from, 6),
    countries: dim('country', from, 8).map((r) => ({ val: r.val, name: r.val === '??' ? 'Unknown' : countryName(r.val), n: r.n })), langs: dim('lang', from, 5), vtype: dim('vtype', from, 3),
    hours: Array.from({ length: 24 }, (_, h) => hours[String(h).padStart(2, '0')] || 0),
  };
}
// Visitors seen in the last few minutes ("online now").
function live(minutes = 5) {
  flush();
  const since = new Date(Date.now() - minutes * 60000).toISOString();
  const r = db.prepare('SELECT COUNT(DISTINCT vh) n FROM analytics_visits WHERE ts>=?').get(since);
  return r ? r.n : 0;
}
function recent(n = 40) { flush(); return db.prepare('SELECT * FROM analytics_visits ORDER BY id DESC LIMIT ?').all(Math.min(200, n)); }
function prune(days = 400) {
  const from = isoDay(days);
  for (const t of ['analytics_daily', 'analytics_uniques', 'analytics_ref', 'analytics_dev', 'analytics_dim', 'analytics_time']) db.prepare(`DELETE FROM ${t} WHERE day<?`).run(from);
  db.prepare('DELETE FROM analytics_visits WHERE ts<?').run(new Date(Date.now() - 30 * 864e5).toISOString());
  db.prepare('DELETE FROM analytics_visits WHERE id <= (SELECT COALESCE(MAX(id),0)-3000 FROM analytics_visits)').run();
  db.prepare('DELETE FROM login_events WHERE ts<?').run(new Date(Date.now() - 180 * 864e5).toISOString());
}
module.exports = { middleware, summary, live, recent, flush, prune, timeOnPage, hex24 };
