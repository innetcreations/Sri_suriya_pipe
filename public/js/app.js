/* Sri Suriya Polymers – public site behaviour. Plain JS, no dependencies, CSP-safe (no eval / inline handlers). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var cfg = {};
  try { cfg = JSON.parse($('#app-config').textContent) || {}; } catch (e) { cfg = {}; }
  var S = cfg.strings || {};
  var fire = function (n, d) { document.dispatchEvent(new CustomEvent(n, { detail: d })); };
  var sfx = function (n) { fire('fx:sound', { name: n }); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  var toastT;
  function toast(msg) { var t = $('#toast'); if (!t) return; t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2600); }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === 'text') n.textContent = attrs[k]; else if (k === 'class') n.className = attrs[k]; else n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }

  // ── header: stuck shadow, mobile nav, popovers, back-to-top, scrim
  var header = $('.site-header'); var toTop = $('[data-to-top]'); var scrim = $('[data-scrim]');
  function onScroll() { if (header) header.classList.toggle('is-stuck', window.scrollY > 8); if (toTop) toTop.classList.toggle('show', window.scrollY > 700); }
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  if (toTop) toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });

  var nav = $('#nav'); var navBtn = $('[data-nav-open]');
  function openNav(o) { if (!nav) return; nav.classList.toggle('open', o); if (navBtn) navBtn.setAttribute('aria-expanded', String(o)); if (scrim) scrim.classList.toggle('open', o || drawer.classList.contains('open')); document.body.style.overflow = o ? 'hidden' : ''; }
  if (navBtn) navBtn.addEventListener('click', function () { openNav(true); });
  $$('[data-nav-close]').forEach(function (b) { b.addEventListener('click', function () { openNav(false); }); });
  $$('#nav a').forEach(function (a) { a.addEventListener('click', function () { openNav(false); }); });

  $$('[data-pop]').forEach(function (b) {
    var pop = document.getElementById(b.getAttribute('data-pop'));
    b.addEventListener('click', function (e) { e.stopPropagation(); var open = pop.hidden; $$('.popover').forEach(function (p) { p.hidden = true; }); pop.hidden = !open; b.setAttribute('aria-expanded', String(open)); });
  });
  document.addEventListener('click', function (e) { if (!e.target.closest || !e.target.closest('.pop-wrap')) $$('.popover').forEach(function (p) { p.hidden = true; }); });

  // ── theme picker (cookie read by the server; validated there)
  $$('[data-theme]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-theme'); var secure = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = 'ssp_theme=' + encodeURIComponent(v) + '; Path=/; Max-Age=' + (v ? 31536000 : 0) + '; SameSite=Lax' + secure;
      sfx('toggle'); location.reload();
    });
  });

  // ── announcement dismiss (remembered per announcement)
  var ann = $('[data-announce]');
  if (ann) {
    var id = ann.getAttribute('data-announce');
    if (store.get('ssp:ann') === id) ann.remove();
    var cb = $('[data-announce-close]', ann); if (cb) cb.addEventListener('click', function () { store.set('ssp:ann', id); ann.remove(); });
  }

  // ── search overlay
  var sbox = $('#search-box');
  function openSearch() { if (!sbox) return; sbox.classList.add('open'); var i = $('input', sbox); if (i) setTimeout(function () { i.focus(); }, 30); }
  $$('[data-search-open]').forEach(function (b) { b.addEventListener('click', openSearch); });
  $$('[data-search-close]').forEach(function (b) { b.addEventListener('click', function () { sbox.classList.remove('open'); }); });
  if (sbox) sbox.addEventListener('click', function (e) { if (e.target === sbox) sbox.classList.remove('open'); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { $$('.lightbox.open').forEach(function (l) { l.classList.remove('open'); }); closeDrawer(); closeChat(); openNav(false); $$('.popover').forEach(function (p) { p.hidden = true; }); }
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '')) { e.preventDefault(); openSearch(); }
  });

  // ── quote basket (stored in this browser only)
  var drawer = $('#basket'); var BK = 'ssp:basket';
  var basket = store.get(BK, []); if (!Array.isArray(basket)) basket = [];
  function saveBasket() { store.set(BK, basket); renderBasket(); }
  function openDrawer() { if (!drawer) return; drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); scrim.classList.add('open'); sfx('open'); }
  function closeDrawer() { if (!drawer || !drawer.classList.contains('open')) return; drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); scrim.classList.remove('open'); sfx('close'); }
  $$('[data-basket-open]').forEach(function (b) { b.addEventListener('click', openDrawer); });
  $$('[data-basket-close]').forEach(function (b) { b.addEventListener('click', closeDrawer); });
  if (scrim) scrim.addEventListener('click', function () { closeDrawer(); openNav(false); });
  var clr = $('[data-basket-clear]'); if (clr) clr.addEventListener('click', function () { basket = []; saveBasket(); sfx('remove'); });
  function addItem(it) {
    var key = it.name + '|' + (it.size || '') + '|' + (it.color || '');
    var f = basket.filter(function (b) { return b.key === key; })[0];
    if (f) f.qty = Math.min(100000, f.qty + (it.qty || 1)); else basket.push({ key: key, name: String(it.name).slice(0, 140), size: it.size || '', color: it.color || '', qty: it.qty || 1 });
    saveBasket(); toast((S.in_quote || 'Added') + ': ' + it.name); sfx('add');
  }
  function renderBasket() {
    var n = basket.reduce(function (a, b) { return a + b.qty; }, 0);
    $$('[data-basket-count]').forEach(function (c) { c.textContent = String(Math.min(n, 999)); c.hidden = !basket.length; });
    var box = $('[data-basket-items]'); if (box) {
      box.textContent = '';
      if (!basket.length) box.appendChild(el('p', { class: 'muted', text: S.basket_empty || 'No items yet.' }));
      basket.forEach(function (b, i) {
        var qty = el('div', { class: 'q-qty' }, [
          el('button', { type: 'button', 'aria-label': 'Decrease', text: '−' }), el('span', { text: String(b.qty) }), el('button', { type: 'button', 'aria-label': 'Increase', text: '+' })]);
        qty.children[0].addEventListener('click', function () { b.qty = Math.max(1, b.qty - 1); saveBasket(); });
        qty.children[2].addEventListener('click', function () { b.qty = Math.min(100000, b.qty + 1); saveBasket(); });
        var rm = el('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove', text: '×' }); rm.addEventListener('click', function () { basket.splice(i, 1); saveBasket(); sfx('remove'); });
        box.appendChild(el('div', { class: 'q-item' }, [el('div', {}, [el('b', { text: b.name }), el('br'), el('small', { text: [b.size, b.color].filter(Boolean).join(' · ') })]), rm, qty]));
      });
    }
    $$('[data-basket-summary]').forEach(function (s) {
      s.textContent = ''; if (!basket.length) return;
      var ul = el('ul', { class: 'checks' }); basket.forEach(function (b) { ul.appendChild(el('li', { text: b.name + (b.size ? ' – ' + b.size : '') + (b.color ? ' – ' + b.color : '') + ' × ' + b.qty })); });
      s.appendChild(el('div', { class: 'alert alert-ok' }, [el('strong', { text: (S.basket_empty ? '' : '') + 'Your quote list' }), ul]));
    });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-add-quote]'); if (!b) return;
    addItem({ name: b.getAttribute('data-name'), qty: 1 });
  });
  renderBasket();
  // 3D configurator → quote
  var cfgState = null; document.addEventListener('cfg:change', function (e) { cfgState = e.detail; });
  var addCfg = $('[data-add-cfg]'); if (addCfg) addCfg.addEventListener('click', function () {
    var root = $('[data-configurator]'); var c = cfgState; if (!c && root) { var s = $('[data-cfg="size"]:checked', root); var col = $('[data-cfg="color"]:checked', root); var l = $('[data-cfg="length"]:checked', root); c = { size: s ? s.value : 2, color: col ? col.value : '#1e88e5', length: l ? l.value : 3 }; }
    var names = { '#1e88e5': 'Blue', '#f4f4f4': 'White', '#9e9e9e': 'Grey', '#f5f0e1': 'Ivory', '#1565c0': 'Royal Blue' };
    var inch = { '0.5': '1/2', '0.75': '3/4', '1.5': '1.5', '2.5': '2.5' }[String(c.size)] || String(c.size);
    addItem({ name: 'PVC pipe (custom)', size: inch + '" × ' + c.length + ' m', color: names[String(c.color).toLowerCase()] || '', qty: 1 });
  });

  // ── enquiry forms
  $$('[data-enquiry-form]').forEach(function (form) {
    var status = $('[data-form-status]', form); var btn = $('button[type=submit]', form); var label = $('[data-label]', form);
    var q = new URLSearchParams(location.search);
    ['product', 'location', 'size', 'color', 'qty'].forEach(function (k) { if (q.get(k) && form.elements[k]) form.elements[k].value = q.get(k).slice(0, 140); });
    var tokenP = null;
    function token() { if (!tokenP) tokenP = fetch('/api/form-token', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (j) { form.elements._ft.value = j.token; return j.token; }).catch(function () { tokenP = null; return ''; }); return tokenP; }
    form.addEventListener('focusin', token, { once: true }); setTimeout(token, 1500);
    function err(name, msg) { var s = $('[data-err="' + name + '"]', form); if (s) s.textContent = msg || ''; if (form.elements[name]) form.elements[name].setAttribute('aria-invalid', msg ? 'true' : 'false'); }
    form.addEventListener('submit', function (e) {
      e.preventDefault(); ['name', 'phone', 'email'].forEach(function (n) { err(n, ''); }); status.textContent = '';
      var name = form.elements.name.value.trim(); var phone = form.elements.phone.value.replace(/[\s\-()]/g, ''); var bad = false;
      if (name.length < 2) { err('name', S.f_required || 'Required'); bad = true; }
      if (!/^\+?\d{10,15}$/.test(phone)) { err('phone', S.f_invalid || 'Invalid'); bad = true; }
      if (bad) { sfx('error'); var first = $('[aria-invalid="true"]', form); if (first) first.focus(); return; }
      btn.disabled = true; var old = label.textContent; label.textContent = S.f_sending || '…';
      token().then(function () {
        var data = {}; Array.prototype.forEach.call(form.elements, function (f) { if (f.name && f.type !== 'submit') data[f.name] = f.value; });
        data.items = basket.map(function (b) { return { name: b.name, size: b.size, color: b.color, qty: b.qty }; });
        return fetch('/api/enquiry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(data) });
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); }).then(function (res) {
        if (res.ok && res.j.ok) {
          status.textContent = ''; status.appendChild(el('div', { class: 'alert alert-ok' }, [el('strong', { text: S.f_thanks || 'Thank you!' }), el('br'), el('span', { text: (S.f_ref || 'Reference') + ': ' + res.j.ref })]));
          form.reset(); basket = []; saveBasket(); sfx('success'); fire('fx:burst', { type: 'confetti' }); form.scrollIntoView({ behavior: 'smooth', block: 'center' }); tokenP = null; form.elements._ft.value = ''; setTimeout(token, 3000);
        } else {
          Object.keys(res.j.errors || {}).forEach(function (k) { err(k, res.j.errors[k]); });
          status.textContent = ''; status.appendChild(el('div', { class: 'alert alert-err', text: res.j.error || S.f_error })); sfx('error'); tokenP = null;
        }
      }).catch(function () { status.textContent = ''; status.appendChild(el('div', { class: 'alert alert-err', text: S.f_error || 'Error' })); sfx('error'); tokenP = null; })
        .then(function () { btn.disabled = false; label.textContent = old; });
    });
  });
  if (cfg.turnstile && $('.cf-turnstile')) { var ts = document.createElement('script'); ts.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js'; ts.async = true; document.head.appendChild(ts); }

  // ── chat assistant
  var chat = $('#chat'); var chatFab = $('[data-chat-open]');
  function openChat() { if (!chat) return; chat.classList.add('open'); chatFab.setAttribute('aria-expanded', 'true'); var i = $('input', chat); if (i) i.focus(); sfx('open'); }
  function closeChat() { if (!chat || !chat.classList.contains('open')) return; chat.classList.remove('open'); chatFab.setAttribute('aria-expanded', 'false'); }
  if (chatFab) chatFab.addEventListener('click', function () { chat.classList.contains('open') ? closeChat() : openChat(); });
  $$('[data-chat-close]').forEach(function (b) { b.addEventListener('click', closeChat); });
  if (chat) {
    var log = $('[data-chat-log]', chat); var form = $('[data-chat-form]', chat); var sugg = $('[data-chat-sugg]', chat);
    ['Which pipe for borewell?', 'Do you deliver?', 'Payment methods?', 'Phone number'].forEach(function (t) { var b = el('button', { type: 'button', text: t }); b.addEventListener('click', function () { ask(t); }); sugg.appendChild(b); });
    var say = function (txt, cls, links) {
      var m = el('div', { class: 'msg ' + cls, text: txt }); (links || []).forEach(function (l) { if (!/^(https:\/\/wa\.me\/|https:\/\/www\.google\.com\/|\/)/.test(l.url)) return; m.appendChild(document.createElement('br')); var a = el('a', { href: l.url, text: l.label }); if (/^https/.test(l.url)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } m.appendChild(a); });
      log.appendChild(m); log.scrollTop = log.scrollHeight;
    };
    var busy = false;
    function ask(q) {
      q = q.trim(); if (!q || busy) return; busy = true; say(q, 'me'); sugg.textContent = ''; sfx('click');
      fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ q: q, lang: cfg.lang }) }).then(function (r) { return r.json(); })
        .then(function (j) { say(j.answer || j.error || S.f_error, 'bot', j.links); sfx('notify'); }).catch(function () { say(S.f_error, 'bot'); }).then(function () { busy = false; });
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); var i = form.elements.q; var v = i.value; i.value = ''; ask(v); });
  }

  // ── pipe quantity calculator
  var calc = $('[data-calculator]');
  if (calc) {
    var out = $('[data-calc-out] b'); var cq = $('[data-calc-quote]'); var last = 0;
    var run = function () {
      var r = parseFloat(calc.elements.run.value); var l = parseFloat(calc.elements.len.value); var w = parseFloat(calc.elements.waste.value) || 0;
      if (!(r > 0) || !(l > 0)) { out.textContent = '–'; return; }
      last = Math.ceil((r * (1 + w / 100)) / l); out.textContent = last.toLocaleString('en-IN');
      if (cq) cq.href = (cfg.prefix || '') + '/quote?qty=' + encodeURIComponent(last + ' pipes of ' + l + ' m (' + r + ' m run + ' + w + '% wastage)');
    };
    calc.addEventListener('input', run); run();
  }

  // ── gallery: filter + lightbox
  var lb = $('#lightbox');
  $$('[data-lightbox] figure').forEach(function (f) {
    f.addEventListener('click', function () { var im = $('img', f); if (!im || !lb) return; var big = $('img', lb); big.src = im.currentSrc || im.src; big.alt = im.alt; $('p', lb).textContent = im.alt; lb.classList.add('open'); sfx('open'); });
  });
  if (lb) { lb.addEventListener('click', function (e) { if (e.target === lb || (e.target.closest && e.target.closest('[data-lb-close]'))) lb.classList.remove('open'); }); }
  $$('[data-gallery-filter] [data-cat]').forEach(function (b) {
    b.addEventListener('click', function () {
      var c = b.getAttribute('data-cat'); $$('[data-gallery-filter] .chip').forEach(function (x) { x.classList.toggle('is-active', x === b); });
      $$('[data-lightbox] figure').forEach(function (f) { f.classList.toggle('is-hidden', !!c && f.getAttribute('data-cat') !== c); });
    });
  });
  // product gallery thumbs
  $$('[data-gallery]').forEach(function (g) {
    $$('[data-thumb]', g).forEach(function (t) { t.addEventListener('click', function () { var im = $('.main img', g); im.src = t.getAttribute('data-thumb'); $$('[data-thumb]', g).forEach(function (x) { x.removeAttribute('aria-current'); }); t.setAttribute('aria-current', 'true'); }); });
  });

  // ── lazy map (loads Google only after a click: faster + more private)
  $$('[data-load-map]').forEach(function (b) {
    b.addEventListener('click', function () {
      var u = b.getAttribute('data-load-map'); if (!/^https:\/\/www\.google\.com\/maps\/embed/.test(u)) return;
      var f = document.createElement('iframe'); f.src = u; f.loading = 'lazy'; f.title = 'Map'; f.referrerPolicy = 'no-referrer-when-downgrade'; f.setAttribute('allowfullscreen', ''); b.parentNode.appendChild(f); b.remove();
    });
  });
  $$('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { var u = b.getAttribute('data-copy'); (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(function () { toast('✓'); }, function () { window.prompt('Copy', u); }); }); });

  // ── cookie notice, optional trackers (only after "Accept all"), and the time-on-page beacon
  function loadScript(src) { var s = document.createElement('script'); s.async = true; s.src = src; document.head.appendChild(s); }
  function getCookie(n) { var m = document.cookie.match(new RegExp('(?:^|; )' + n + '=([^;]*)')); return m ? decodeURIComponent(m[1]) : ''; }
  function setConsent(v) { document.cookie = 'ssp_consent=' + v + '; Path=/; Max-Age=15552000; SameSite=Lax' + (location.protocol === 'https:' ? '; Secure' : ''); }
  var trackersLoaded = false;
  function loadTrackers() {
    if (trackersLoaded) return; trackersLoaded = true;
    if (cfg.ga4) { window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); }; window.gtag('js', new Date()); window.gtag('config', cfg.ga4, { anonymize_ip: true }); loadScript('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(cfg.ga4)); }
    if (cfg.gtm) { window.dataLayer = window.dataLayer || []; window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' }); loadScript('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(cfg.gtm)); }
    if (cfg.clarity) { window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); }; loadScript('https://www.clarity.ms/tag/' + encodeURIComponent(cfg.clarity)); }
  }
  var consent = getCookie('ssp_consent');
  if (!cfg.consent || consent === 'all') loadTrackers();
  var banner = $('#cookie-banner');
  if (banner && cfg.consent && !consent) { banner.hidden = false; }
  $$('[data-cookie]').forEach(function (b) {
    b.addEventListener('click', function () {
      var v = b.getAttribute('data-cookie') === 'all' ? 'all' : 'essential';
      setConsent(v); if (banner) banner.hidden = true;
      if (v === 'all') loadTrackers();
      sfx('click');
    });
  });
  // time on page: count only while the tab is visible, send once when the visitor leaves
  (function () {
    if (cfg.page === 'admin' || !navigator.sendBeacon || location.pathname.indexOf('/admin') === 0) return;
    var shown = document.visibilityState === 'visible' ? Date.now() : 0, total = 0, sent = false;
    function leave() {
      if (shown) { total += Date.now() - shown; shown = 0; }
      var secs = Math.round(total / 1000); if (sent || secs < 2) return;
      sent = true;
      try { navigator.sendBeacon('/api/t', new Blob([JSON.stringify({ p: location.pathname, s: secs })], { type: 'application/json' })); } catch (e) { /* ignore */ }
    }
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') leave(); else { shown = Date.now(); sent = false; total = 0; } });
    window.addEventListener('pagehide', leave);
  })();
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !document.cookie.match(/ssp_theme=/)) { window.addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () { }); }); }
})();
