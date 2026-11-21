'use strict';
const nodemailer = require('nodemailer');
const settings = require('./settings');
const cfg = require('./config');
const { esc } = require('./render');

// ── EmailJS (https://www.emailjs.com): the site sends the enquiry to EmailJS from the SERVER, EmailJS sends the e-mail to your Gmail.
// Your keys never reach the visitor's browser. EmailJS allows 1 request per second.
const EMAILJS_URL = (!cfg.isProd && process.env.EMAILJS_API_URL) || 'https://api.emailjs.com/api/v1.0/email/send';
const emailjsConfigured = (S) => !!(S.emailjs_service_id && S.emailjs_template_id && S.emailjs_public_key && S.notify_email);
let lastEmailJS = 0;
async function viaEmailJS(S, params) {
  const wait = lastEmailJS + 1100 - Date.now();
  if (wait > 4000) throw new Error('EmailJS is busy (1 request per second) - try again shortly');
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastEmailJS = Date.now();
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 9000);
  try {
    const res = await fetch(EMAILJS_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
      body: JSON.stringify({ service_id: S.emailjs_service_id, template_id: S.emailjs_template_id, user_id: S.emailjs_public_key, accessToken: S.emailjs_private_key || undefined, template_params: params }),
    });
    const text = (await res.text()).slice(0, 200);
    if (!res.ok) throw new Error(`EmailJS answered ${res.status}: ${text}`);
    return true;
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'EmailJS did not answer in time' : e.message); } finally { clearTimeout(t); }
}
const istNow = () => new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
const oneLine = (v, n = 200) => String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').slice(0, n);

let cached = { key: '', tx: null };
function transport() {
  const S = settings.all();
  if (!S.smtp_host || !S.notify_email) return null;
  const key = [S.smtp_host, S.smtp_port, S.smtp_user, S.smtp_pass].join('|');
  if (cached.key !== key) {
    cached = {
      key, tx: nodemailer.createTransport({
        host: S.smtp_host, port: parseInt(S.smtp_port, 10) || 587, secure: parseInt(S.smtp_port, 10) === 465,
        auth: S.smtp_user ? { user: S.smtp_user, pass: S.smtp_pass } : undefined, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 12000,
        requireTLS: parseInt(S.smtp_port, 10) !== 465 && parseInt(S.smtp_port, 10) !== 25,
      }),
    };
  }
  return cached.tx;
}
// Fire-and-forget. A failing mail server must never lose or delay a customer's enquiry (it is saved first).
async function notifyEnquiry(e) {
  const S = settings.all();
  const rows = [['Reference', e.ref], ['Type', e.type], ['Name', e.name], ['Phone', e.phone], ['Email', e.email], ['Product', e.product], ['Size', e.size], ['Colour', e.color],
    ['Quantity', e.qty], ['Location', e.location], ['Message', e.message]].filter((r) => r[1]);
  const items = (e.items || []).map((i) => `• ${i.name}${i.size ? ' – ' + i.size : ''}${i.color ? ' – ' + i.color : ''} × ${i.qty || 1}`);
  const adminUrl = `${cfg.SITE_URL}${cfg.ADMIN_PATH}/enquiries`;
  const text = rows.map((r) => `${r[0]}: ${r[1]}`).join('\n') + (items.length ? `\n\nItems:\n${items.join('\n')}` : '') + `\n\nOpen in admin: ${adminUrl}`;
  const subject = oneLine(`New ${e.type} enquiry ${e.ref} - ${e.name}`, 140);
  // 1) EmailJS (when its three IDs + the destination address are filled in Admin -> Settings -> Forms, Email & Spam)
  if (emailjsConfigured(S)) {
    try {
      await viaEmailJS(S, { to_email: S.notify_email, reply_to: oneLine(e.email || S.notify_email, 120), subject, site_name: S.site_name, ref: e.ref, type: e.type, name: oneLine(e.name, 80), phone: oneLine(e.phone, 30), email: oneLine(e.email, 120),
        product: oneLine(e.product, 140), size: oneLine(e.size, 40), color: oneLine(e.color, 40), qty: oneLine(e.qty, 40), location: oneLine(e.location, 120), message: String(e.message || '').slice(0, 2000), items: items.join('\n'), summary: text, admin_url: adminUrl, time: istNow() });
      return true;
    } catch (err) { console.error('[mail] EmailJS failed:', err.message); /* fall through to SMTP if it is set up */ }
  }
  // 2) classic SMTP (optional)
  const tx = transport(); if (!tx) return false;
  const htmlBody = `<table cellpadding="6" style="font-family:Arial,sans-serif;font-size:14px;border-collapse:collapse">${rows.map((r) => `<tr><td style="color:#667;vertical-align:top">${esc(r[0])}</td><td><b>${esc(r[1])}</b></td></tr>`).join('')}</table>${items.length ? `<p><b>Items</b><br>${items.map(esc).join('<br>')}</p>` : ''}<p><a href="${esc(cfg.SITE_URL + cfg.ADMIN_PATH + '/enquiries')}">Open in admin</a></p>`;
  try {
    await tx.sendMail({ from: S.smtp_from || S.smtp_user || S.notify_email, to: S.notify_email, replyTo: e.email || undefined, subject: `New ${e.type} enquiry ${e.ref} – ${e.name}`.replace(/[\r\n]/g, ' '), text, html: htmlBody });
    return true;
  } catch (err) { console.error('[mail] failed:', err.message); return false; }
}
async function sendTest(to) {
  const S = settings.all(); const dest = to || S.notify_email;
  if (!dest) return { ok: false, error: 'Fill in “Send new enquiries to (email)” first.' };
  const params = { to_email: dest, reply_to: dest, subject: 'Test e-mail from your website', site_name: S.site_name, ref: 'TEST-0000', type: 'test', name: 'Website test', phone: '', email: dest, product: '', size: '', color: '', qty: '', location: '', message: 'If you can read this, e-mail sending works.', items: '', summary: 'If you can read this, e-mail sending works.', admin_url: `${cfg.SITE_URL}${cfg.ADMIN_PATH}`, time: istNow() };
  if (emailjsConfigured({ ...S, notify_email: dest })) { try { await viaEmailJS(S, params); return { ok: true, via: 'EmailJS' }; } catch (e) { return { ok: false, via: 'EmailJS', error: e.message }; } }
  const tx = transport(); if (!tx) return { ok: false, error: 'No mail service is set up yet: fill the three EmailJS IDs (or the SMTP fields).' };
  try { await tx.sendMail({ from: S.smtp_from || S.smtp_user || dest, to: dest, subject: params.subject, text: params.message }); return { ok: true, via: 'SMTP' }; } catch (e) { return { ok: false, via: 'SMTP', error: e.message }; }
}
module.exports = { notifyEnquiry, sendTest, emailjsConfigured };
