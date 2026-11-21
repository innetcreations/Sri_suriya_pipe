'use strict';
const express = require('express');
const db = require('../db');
const crud = require('../crud');
const settings = require('../settings');
const sec = require('../security');
const mailer = require('../mailer');
const { clean, sha, nowISO, rand, parseJSON } = require('../util');
const cfg = require('../config');

const router = express.Router();
router.use(express.json({ limit: '40kb', strict: true }));
router.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

// Time-on-page beacon (sent by public/js/app.js when the visitor leaves a page). Counts seconds only - nothing personal.
router.post('/t', sec.requireJson, sec.limiters.beacon, (req, res) => {
  const b = req.body || {};
  if (typeof b.p === 'string' && b.p.length < 200 && b.p[0] === '/' && !b.p.startsWith('//') && !(req.user)) require('../analytics').timeOnPage(b.p, b.s);
  res.status(204).end();
});

router.get('/form-token', sec.limiters.formToken, (req, res) => res.json({ token: sec.issueFormToken() }));

// ───────────────────────── enquiries
const PHONE = /^\+?\d{10,15}$/;
const SPAM = /(https?:\/\/|www\.)[^\s]+/gi;
const SPAM_WORDS = /\b(viagra|casino|crypto|bitcoin|forex|seo services|backlinks?|loan offer|escort|porn|lottery|click here|telegram)\b/i;
const newRef = () => { const d = new Date(); const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`; return `SSP-${ymd}-${rand(4).replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase().padEnd(4, 'X')}`; };

router.post('/enquiry', sec.requireJson, sec.limiters.enquiry, async (req, res) => {
  try {
    const b = req.body || {}; const errors = {};
    if (b.website) return res.json({ ok: true, ref: newRef() }); // honeypot: pretend success, store nothing
    if (!sec.checkFormToken(b._ft)) return res.status(400).json({ error: 'Please reload the page and try again.' });
    if (!(await sec.verifyTurnstile(b['cf-turnstile-response'], req.ip))) return res.status(400).json({ error: 'Captcha check failed. Please try again.' });
    const name = clean(b.name, 80); const phone = clean(b.phone, 25).replace(/[\s\-()]/g, ''); const email = clean(b.email, 120);
    if (name.length < 2) errors.name = 'Please enter your name';
    if (!PHONE.test(phone)) errors.phone = 'Enter a valid phone number';
    if (email && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(email)) errors.email = 'Enter a valid email';
    if (Object.keys(errors).length) return res.status(422).json({ error: 'Please check the highlighted fields.', errors });

    const type = ['quote', 'order', 'dealer', 'support'].includes(b.type) ? b.type : 'quote';
    const message = clean(String(b.message || '').replace(/\r\n/g, '\n'), 1500);
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 30).map((i) => ({ name: clean(i && i.name, 140), size: clean(i && i.size, 40), color: clean(i && i.color, 40), qty: Math.max(1, Math.min(100000, parseInt(i && i.qty, 10) || 1)) })).filter((i) => i.name);
    const urls = (message.match(SPAM) || []).length;
    const spam = urls >= 2 || SPAM_WORDS.test(message + ' ' + name) ? 1 : 0;
    const iph = sha(cfg.SECRET + '|' + req.ip).slice(0, 20);
    const dup = db.prepare('SELECT ref FROM enquiries WHERE phone=? AND name=? AND created_at>?').get(phone, name, new Date(Date.now() - 120000).toISOString());
    if (dup) return res.json({ ok: true, ref: dup.ref });
    const e = { ref: newRef(), type, name, phone, email, product: clean(b.product, 140), size: clean(b.size, 40), color: clean(b.color, 40), qty: clean(b.qty, 40), location: clean(b.location, 120), message, items };
    db.prepare('INSERT INTO enquiries(ref,type,name,phone,email,product,size,color,qty,location,message,items,status,spam,lang,source,ip_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(e.ref, e.type, e.name, e.phone, e.email, e.product, e.size, e.color, e.qty, e.location, e.message, JSON.stringify(items), 'new', spam, b.lang === 'ta' ? 'ta' : 'en', clean(req.get('referer') || '', 200), iph, nowISO());
    // Serverless hosts (Vercel) may freeze the function right after the response, so there the mail is sent BEFORE replying. The enquiry is already saved, so a mail failure never loses it.
    if (!spam) { const sent = mailer.notifyEnquiry(e).catch(() => {}); if (cfg.IS_VERCEL) await sent; }
    res.json({ ok: true, ref: e.ref });
  } catch (err) { console.error('[enquiry]', err); res.status(500).json({ error: 'Something went wrong. Please call us.' }); }
});

// ───────────────────────── chat assistant (rule-based: FAQs + products + business facts; no external AI, no data leaves your server)
const STOP = new Set('a an the is are do you i me my we our to of for in on at and or can how what which where when does with your it this that about please tell any have has be get'.split(' '));
const tok = (s) => String(s).toLowerCase().replace(/[^a-z0-9஀-௿/." ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
const text = (h) => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

router.post('/chat', sec.requireJson, sec.limiters.chat, (req, res) => {
  const S = settings.all(); const q = clean((req.body || {}).q, 200); const lang = (req.body || {}).lang === 'ta' ? 'ta' : 'en';
  if (!q) return res.status(400).json({ error: 'Empty message' });
  const words = tok(q); const low = q.toLowerCase(); const u = (p) => (lang === 'ta' ? '/ta' : '') + p;
  const out = (answer, links = [], matched = 1) => { try { db.prepare('INSERT INTO chat_log(ts,q,matched) VALUES(?,?,?)').run(nowISO(), q, matched); db.prepare("DELETE FROM chat_log WHERE id < (SELECT MAX(id) FROM chat_log) - 2000").run(); } catch { /* ignore */ } res.json({ answer, links }); };
  if (/^(hi|hello|hey|hai|vanakkam|வணக்கம்)\b/.test(low)) return out(`${S.chat_greeting}`, [{ label: 'Products', url: u('/products') }]);
  if (/(phone|call|number|contact|mobile|whatsapp|தொடர்பு|எண்)/.test(low)) return out(`You can call ${S.phone1}${S.phone2 ? ' or ' + S.phone2 : ''}${S.office_phone ? ' (office: ' + S.office_phone + ')' : ''}, or message us on WhatsApp.`, [{ label: 'WhatsApp', url: `https://wa.me/${String(S.whatsapp).replace(/\D/g, '')}` }, { label: 'Contact page', url: u('/contact') }]);
  if (/(address|where|location|situated|map|visit|முகவரி)/.test(low)) return out(`${S.site_name}, ${[S.address1, S.address2, S.city, S.state].filter(Boolean).join(', ')} – ${S.pincode}.`, [{ label: 'Open map', url: S.map_link || u('/contact') }]);
  if (/(hours|timing|open|close|time)/.test(low) && S.hours) return out(`Our working hours: ${S.hours}.`, [{ label: 'Contact', url: u('/contact') }]);
  const faqs = crud.active('faqs'); let best = null; let bestScore = 0;
  for (const f of faqs) {
    const kw = (f.keywords || []).map((k) => k.toLowerCase()); const qt = new Set(tok(crud.tr(f, 'question', lang) + ' ' + f.question)); let score = 0;
    for (const w of words) { if (kw.some((k) => k === w || (w.length > 3 && (k.includes(w) || w.includes(k))))) score += 3; if (qt.has(w)) score += 1; }
    for (const k of kw) if (k.includes(' ') && low.includes(k)) score += 4;
    if (score > bestScore) { bestScore = score; best = f; }
  }
  if (best && bestScore >= 3) return out(text(crud.tr(best, 'answer', lang)), [{ label: 'All FAQs', url: u('/faq') }]);
  const prods = crud.active('products').map((p) => ({ p, s: words.reduce((a, w) => a + (String(p.name + ' ' + (p.uses || []).join(' ') + ' ' + p.summary).toLowerCase().includes(w) ? 1 : 0), 0) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 3);
  if (prods.length) return out('These products may help:', prods.map((x) => ({ label: crud.tr(x.p, 'name', lang), url: u('/products/' + x.p.slug) })).concat([{ label: 'Get a quote', url: u('/quote') }]));
  if (/(price|cost|rate|quote|how much|விலை)/.test(low)) return out('Prices depend on size, class and quantity. Send us your requirement and we will reply with a written quotation.', [{ label: 'Get a quote', url: u('/quote') }]);
  return out(S.chat_fallback, [{ label: 'Contact us', url: u('/contact') }, { label: 'Get a quote', url: u('/quote') }], 0);
});

router.use((req, res) => res.status(404).json({ error: 'Not found' }));
router.use((err, req, res, next) => { // JSON parse errors etc.
  if (err && (err.type === 'entity.parse.failed' || err.status === 400)) return res.status(400).json({ error: 'Invalid request' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large' });
  console.error('[api]', err); res.status(500).json({ error: 'Server error' });
});
module.exports = router;
