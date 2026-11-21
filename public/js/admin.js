/* Admin panel behaviour. Plain JavaScript (no framework, no build step, CSP-safe: no inline code, no eval). */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var meta = $('meta[name="csrf"]');
  var CSRF = meta ? meta.content : '';
  var logo = $('.a-logo');
  var BASE = logo ? (logo.getAttribute('href') || '/admin').replace(/\/$/, '') : '/admin';
  var store = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

  /* ───────── toast */
  var toastEl = $('#a-toast'); var toastTimer;
  function toast(msg, kind) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.className = 'a-toast show' + (kind === 'err' ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.className = 'a-toast'; }, kind === 'err' ? 6000 : 2600);
  }

  /* ───────── dark / light / auto */
  function applyDark() {
    var p = store.get('a-dark'); var root = document.documentElement;
    if (p === 'dark') root.setAttribute('data-dark', '1'); else if (p === 'light') root.setAttribute('data-dark', '0'); else root.removeAttribute('data-dark');
  }
  applyDark();
  var topR = $('.a-top__r');
  if (topR) {
    var tb = document.createElement('button'); tb.type = 'button'; tb.className = 'a-btn a-btn--ghost'; tb.title = 'Colour mode: auto / dark / light';
    var label = function () { var p = store.get('a-dark'); tb.textContent = p === 'dark' ? '🌙 Dark' : p === 'light' ? '☀️ Light' : '🌓 Auto'; };
    label(); tb.addEventListener('click', function () { var p = store.get('a-dark'); store.set('a-dark', p === 'dark' ? 'light' : p === 'light' ? 'auto' : 'dark'); applyDark(); label(); });
    topR.insertBefore(tb, topR.firstChild);
  }

  /* ───────── mobile menu */
  var burger = $('[data-a-menu]');
  if (burger) {
    burger.addEventListener('click', function () { document.body.classList.toggle('nav-open'); });
    document.addEventListener('click', function (e) { if (document.body.classList.contains('nav-open') && (e.target === document.body || (e.target.closest && e.target.closest('.a-nav a')))) document.body.classList.remove('nav-open'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') document.body.classList.remove('nav-open'); });
  }
  var cur = $('.a-nav a.on'); if (cur && cur.scrollIntoView) { try { cur.scrollIntoView({ block: 'nearest' }); } catch (e) { /* old browsers */ } }

  /* ───────── confirm dialogs for dangerous forms */
  document.addEventListener('submit', function (e) {
    var f = e.target; var msg = f && f.getAttribute && f.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  /* ───────── copy buttons */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]'); if (!b) return;
    var text = location.origin + b.getAttribute('data-copy');
    var done = function () { toast('Copied: ' + b.getAttribute('data-copy')); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { fallbackCopy(text); done(); });
    else { fallbackCopy(text); done(); }
  });
  function fallbackCopy(t) { var a = document.createElement('textarea'); a.value = t; a.style.position = 'fixed'; a.style.opacity = '0'; document.body.appendChild(a); a.select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } a.remove(); }

  /* ───────── tabs (content / SEO / Tamil) */
  $$('.a-tabs').forEach(function (tabs) {
    var form = tabs.closest('form') || document;
    var btns = $$('[data-tab]', tabs); var panels = $$('[data-panel]', form);
    function show(name) {
      btns.forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === name ? 'true' : 'false'); });
      panels.forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-tab')); }); });
    var bad = panels.filter(function (p) { return p.querySelector('.has-err'); })[0];
    if (bad) show(bad.getAttribute('data-panel'));
    // HTML5 validation messages must be visible: open the tab that holds the invalid field
    form.addEventListener('invalid', function (e) { var p = e.target.closest && e.target.closest('[data-panel]'); if (p && p.hidden) show(p.getAttribute('data-panel')); }, true);
  });

  /* ───────── slug auto-fill */
  function slugify(s) { return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80); }
  $$('[data-slug-from]').forEach(function (slug) {
    var from = slug.getAttribute('data-slug-from'); var form = slug.form; var src = form && from ? form.elements[from] : null; if (!src) return;
    var auto = !slug.value;
    slug.addEventListener('input', function () { auto = !slug.value; });
    src.addEventListener('input', function () { if (auto) slug.value = slugify(src.value); });
  });

  /* ───────── unsaved-changes guard + Ctrl/Cmd+S */
  var dirty = false; var submitting = false;
  $$('form[data-dirty]').forEach(function (f) {
    f.addEventListener('input', function () { dirty = true; }); f.addEventListener('change', function () { dirty = true; });
    f.addEventListener('submit', function () { submitting = true; });
  });
  window.addEventListener('beforeunload', function (e) { if (dirty && !submitting) { e.preventDefault(); e.returnValue = ''; } });
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) { var f = $('form[data-dirty]'); if (f) { e.preventDefault(); if (f.reportValidity()) { syncAllRte(); submitting = true; f.submit(); } } }
  });

  /* ───────── media picker modal */
  var modal = $('#media-modal'); var grid = $('#media-grid'); var q = $('#media-q'); var up = $('#media-up');
  var picker = { multi: false, kind: '', cb: null, sel: [], opener: null, src: '' };
  var useBtn = null;
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function loadGrid() {
    if (!grid) return;
    var url = BASE + '/media/api?kind=' + encodeURIComponent(picker.kind) + '&src=' + encodeURIComponent(picker.src) + '&q=' + encodeURIComponent(q ? q.value : '');
    grid.innerHTML = '<p class="a-muted">Loading…</p>';
    fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json', 'x-csrf-token': CSRF } }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(function (d) {
      fillTargets(d.caps);
      if (!d.files.length) { grid.innerHTML = '<p class="a-empty">' + (picker.src === 'assets' ? 'Nothing found. Copy images/videos into public/assets/images or public/assets/videos and reopen.' : 'No files yet – click “Upload” or “Paste a link”.') + '</p>'; return; }
      grid.innerHTML = d.files.map(function (f) {
        var prev = f.kind === 'image' ? '<img src="' + esc(f.file) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span>' + esc(f.kind.toUpperCase()) + '</span>';
        return '<figure class="a-media" tabindex="0" role="button" data-file="' + esc(f.file) + '" data-kind="' + esc(f.kind) + '" aria-label="Choose ' + esc(f.name) + '"><div class="a-media__p">' + prev + '</div><figcaption><b>' + esc(f.name) + '</b><small>' + esc({ drive: 'Google Drive', link: 'Link', assets: 'Assets folder' }[f.source] || 'This site') + (f.size ? ' · ' + Math.round(f.size / 1024) + ' KB' : '') + '</small></figcaption></figure>';
      }).join('');
    }).catch(function () { grid.innerHTML = '<p class="a-empty">Could not load files. Reload the page and try again.</p>'; });
  }
  function fillTargets(caps) {
    var sel = $('#media-target'); if (!sel || !caps || sel.getAttribute('data-filled')) return; sel.setAttribute('data-filled', '1');
    var o = []; if (caps.local) o.push(['local', 'Store on this website']); if (caps.drive) o.push(['drive', 'Store in my Google Drive']);
    if (!o.length) o.push(['', 'Uploads unavailable – paste a link']);
    sel.innerHTML = o.map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === caps.def ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('');
  }
  function setTab(t) {
    if (!modal) return; picker.src = t === 'assets' ? 'assets' : '';
    $$('[data-mtab]', modal).forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-mtab') === t); b.setAttribute('aria-selected', b.getAttribute('data-mtab') === t ? 'true' : 'false'); });
    $$('[data-mpanel]', modal).forEach(function (p) { p.hidden = (t === 'link') ? p.getAttribute('data-mpanel') !== 'link' : p.getAttribute('data-mpanel') !== 'lib'; });
    if (t !== 'link') loadGrid(); else if (grid) grid.innerHTML = '<p class="a-muted">Paste the link above and press “Add &amp; use”.</p>';
  }
  function openPicker(opts) {
    if (!modal) return;
    picker = { multi: !!opts.multi, kind: opts.kind || '', cb: opts.cb, sel: [], opener: document.activeElement, src: '' };
    setTab('lib'); if (q) q.value = ''; modal.hidden = false; document.body.style.overflow = 'hidden'; loadGrid();
    if (!useBtn) { useBtn = document.createElement('button'); useBtn.type = 'button'; useBtn.className = 'a-btn a-btn--primary'; useBtn.hidden = true; $('.a-modal__tools', modal).appendChild(useBtn); useBtn.addEventListener('click', function () { finish(picker.sel.slice()); }); }
    useBtn.hidden = !picker.multi; useBtn.textContent = 'Insert selected';
    var first = $('#media-q'); if (first) first.focus();
  }
  function closePicker() { if (!modal || modal.hidden) return; modal.hidden = true; document.body.style.overflow = ''; if (picker.opener && picker.opener.focus) picker.opener.focus(); }
  function finish(files) { if (picker.cb && files.length) picker.cb(files); closePicker(); }
  if (modal) {
    modal.addEventListener('click', function (e) { if (e.target === modal || (e.target.closest && e.target.closest('[data-modal-close]'))) closePicker(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !modal.hidden) closePicker(); });
    var pick = function (fig) {
      var f = fig.getAttribute('data-file');
      if (!picker.multi) return finish([f]);
      var i = picker.sel.indexOf(f); if (i >= 0) { picker.sel.splice(i, 1); fig.classList.remove('sel'); } else { picker.sel.push(f); fig.classList.add('sel'); }
      useBtn.textContent = picker.sel.length ? 'Insert ' + picker.sel.length + ' selected' : 'Insert selected';
    };
    grid.addEventListener('click', function (e) { var fig = e.target.closest('.a-media'); if (fig) pick(fig); });
    grid.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.classList.contains('a-media')) { e.preventDefault(); pick(e.target); } });
    modal.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-mtab]'); if (b) setTab(b.getAttribute('data-mtab')); });
    var linkAdd = $('#media-link-add'); var linkIn = $('#media-link');
    if (linkAdd) linkAdd.addEventListener('click', function () {
      var v = (linkIn.value || '').trim(); if (!v) return; toast('Adding link…');
      fetch(BASE + '/media/link', { method: 'POST', credentials: 'same-origin', headers: { 'x-csrf-token': CSRF, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ url: v }).toString() })
        .then(function (r) { return r.json().catch(function () { return { error: 'Could not add the link.' }; }); })
        .then(function (d) { if (d.error) return toast(d.error, 'err'); linkIn.value = ''; toast('Link added ✓'); if (!picker.multi) finish([d.file.file]); else { setTab('lib'); } })
        .catch(function () { toast('Could not add the link.', 'err'); });
    });
    var t; if (q) q.addEventListener('input', function () { clearTimeout(t); t = setTimeout(loadGrid, 250); });
    if (up) up.addEventListener('change', function () { uploadFiles(up.files, function (files) { up.value = ''; if (files.length && !picker.multi) finish([files[0].file]); else loadGrid(); }); });
    ['dragover', 'drop'].forEach(function (ev) { modal.addEventListener(ev, function (e) { e.preventDefault(); if (ev === 'drop' && e.dataTransfer && e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files, function () { loadGrid(); }); }); });
  }
  function uploadFiles(fileList, done) {
    if (!fileList || !fileList.length) return;
    var fd = new FormData(); var tg = $('#media-target') && $('#media-target').closest('[hidden]') === null ? $('#media-target') : ($('#media-target-page') || $('#media-target')); fd.append('target', tg && tg.value ? tg.value : 'local'); Array.prototype.forEach.call(fileList, function (f) { fd.append('files', f); });
    toast('Uploading…');
    fetch(BASE + '/media/upload', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'x-csrf-token': CSRF, Accept: 'application/json' } })
      .then(function (r) { return r.json().catch(function () { return { error: 'Upload failed (HTTP ' + r.status + ')' }; }); })
      .then(function (d) {
        if (d.error) toast(d.error, 'err'); else if (d.errors && d.errors.length) toast(d.errors[0], 'err'); else toast('Uploaded ✓');
        done(d.files || []);
      }).catch(function () { toast('Upload failed. Check your connection.', 'err'); done([]); });
  }
  var pageUp = $('#media-up-page');
  if (pageUp) pageUp.addEventListener('change', function () { uploadFiles(pageUp.files, function (f) { if (f.length) setTimeout(function () { location.reload(); }, 600); }); });

  /* image fields */
  function setPreview(input) {
    var box = input.closest('.a-img'); if (!box) return; var prev = $('.a-img__prev', box); if (!prev) return;
    var v = input.value.trim();
    if (v && /^(\/|https?:\/\/)/.test(v)) { var im = prev.querySelector('img'); if (!im) { prev.textContent = ''; im = document.createElement('img'); im.alt = ''; prev.appendChild(im); } im.src = v; } else { prev.textContent = '—'; }
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-pick],[data-clear],[data-pick-multi]'); if (!t) return;
    if (t.hasAttribute('data-pick')) {
      var inp = document.getElementById(t.getAttribute('data-pick'));
      openPicker({ kind: 'image', cb: function (files) { inp.value = files[0]; setPreview(inp); inp.dispatchEvent(new Event('input', { bubbles: true })); } });
    } else if (t.hasAttribute('data-clear')) {
      var i2 = document.getElementById(t.getAttribute('data-clear')); i2.value = ''; setPreview(i2); i2.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      var ta = document.getElementById(t.getAttribute('data-pick-multi'));
      openPicker({ kind: 'image', multi: true, cb: function (files) { ta.value = (ta.value.trim() ? ta.value.replace(/\s+$/, '') + '\n' : '') + files.join('\n'); ta.dispatchEvent(new Event('input', { bubbles: true })); } });
    }
  });
  $$('[data-img-input]').forEach(function (i) { i.addEventListener('change', function () { setPreview(i); }); });

  /* ───────── rich text editor */
  function syncRte(box) {
    var ed = $('.a-rte__ed', box); var ta = $('textarea', box);
    if (box.getAttribute('data-src') === '1') ed.innerHTML = ta.value; else ta.value = ed.innerHTML.replace(/^<br>$/, '');
  }
  function syncAllRte() { $$('[data-rte]').forEach(function (b) { if (b.getAttribute('data-src') !== '1') $('textarea', b).value = $('.a-rte__ed', b).innerHTML.replace(/^<br>$/, ''); }); }
  var safeHref = function (u) { u = String(u || '').trim(); return /^(https?:\/\/|\/|mailto:|tel:|#)/i.test(u) ? u : ''; };
  $$('[data-rte]').forEach(function (box) {
    var ed = $('.a-rte__ed', box); var ta = $('textarea', box);
    ed.addEventListener('input', function () { ta.value = ed.innerHTML; });
    ed.addEventListener('paste', function (e) { // paste as plain text → no messy Word/web formatting
      var d = e.clipboardData; if (!d) return; e.preventDefault(); document.execCommand('insertText', false, d.getData('text/plain'));
    });
    box.addEventListener('mousedown', function (e) { if (e.target.closest('.a-rte__bar button')) e.preventDefault(); }); // keep the text selection
    box.addEventListener('click', function (e) {
      var b = e.target.closest('.a-rte__bar button'); if (!b) return;
      if (b.hasAttribute('data-rte-src')) {
        var on = box.getAttribute('data-src') === '1';
        if (!on) { ta.value = ed.innerHTML; ta.hidden = false; ta.classList.add('src'); ed.hidden = true; box.setAttribute('data-src', '1'); }
        else { ed.innerHTML = ta.value; ta.hidden = true; ta.classList.remove('src'); ed.hidden = false; box.setAttribute('data-src', '0'); }
        return;
      }
      if (box.getAttribute('data-src') === '1') return;
      ed.focus();
      if (b.hasAttribute('data-rte-img')) {
        openPicker({ kind: 'image', cb: function (files) { ed.focus(); document.execCommand('insertImage', false, files[0]); ta.value = ed.innerHTML; } });
        return;
      }
      var cmd = b.getAttribute('data-cmd'); var val = b.getAttribute('data-val');
      if (cmd === 'createLink') { var u = safeHref(window.prompt('Link address (https://… or /page):', 'https://')); if (!u) return; document.execCommand('createLink', false, u); }
      else if (cmd === 'formatBlock') document.execCommand('formatBlock', false, '<' + val + '>');
      else document.execCommand(cmd, false, val || null);
      ta.value = ed.innerHTML;
    });
    var form = box.closest('form'); if (form) form.addEventListener('submit', function () { syncRte(box); });
  });

  /* ───────── theme editor: live preview + contrast check */
  var tf = $('[data-theme-form]');
  if (tf) {
    var prev = $('[data-theme-prev]', tf); var mapsEl = $('#theme-maps'); var maps = { fonts: {}, shadows: {} };
    try { maps = JSON.parse(mapsEl.textContent); } catch (e) { /* use defaults */ }
    var HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
    var to6 = function (h) { h = h.toLowerCase(); if (h.length === 4) return '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3]; return h.slice(0, 7); };
    var rgbOf = function (h) { h = to6(h); return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; };
    var lum = function (h) { var c = rgbOf(h).map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    var ratio = function (a, b) { var x = lum(a); var y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    var field = function (n) { return tf.elements[n]; };
    var val = function (k) { var el = field('v_' + k); return el && HEX.test(el.value.trim()) ? to6(el.value.trim()) : null; };
    var note = document.createElement('p'); note.className = 'a-note'; var colorsBox = $('.a-colors', tf); if (colorsBox) colorsBox.parentNode.appendChild(note);

    var render = function () {
      $$('[data-var]', tf).forEach(function (el) {
        var v = el.value.trim(); var ok = HEX.test(v); el.style.borderColor = ok || !v ? '' : 'var(--a-danger)';
        if (ok) { prev.style.setProperty('--' + el.getAttribute('data-var'), to6(v)); if (['primary', 'surface', 'bg', 'text', 'secondary', 'accent'].indexOf(el.getAttribute('data-var')) >= 0) prev.style.setProperty('--' + el.getAttribute('data-var') + '-rgb', rgbOf(v).join(',')); }
      });
      var r = field('v_radius'); if (r) { prev.style.setProperty('--radius', r.value + 'px'); var o = $('[data-out="v_radius"]', tf); if (o) o.textContent = r.value; }
      var an = field('v_anim'); if (an) { var o2 = $('[data-out="v_anim"]', tf); if (o2) o2.textContent = an.value; }
      var fh = field('v_font-heading'); if (fh && maps.fonts[fh.value]) prev.style.setProperty('--font-heading', maps.fonts[fh.value]);
      var fb = field('v_font-body'); if (fb && maps.fonts[fb.value]) prev.style.setProperty('--font-body', maps.fonts[fb.value]);
      var sh = field('v_shadow'); if (sh && maps.shadows[sh.value]) prev.style.setProperty('--shadow', maps.shadows[sh.value]);
      var dk = field('dark'); prev.style.colorScheme = dk && dk.checked ? 'dark' : 'light';
      var msgs = []; var bg = val('bg'); var tx = val('text'); var pr = val('primary'); var pc = val('primary-contrast');
      var chk = function (label, a, b) { if (!a || !b) return; var x = ratio(a, b); msgs.push(label + ' ' + x.toFixed(1) + ':1 ' + (x >= 4.5 ? '✓' : '⚠ low')); };
      chk('Text on background', tx, bg); chk('Button text', pc, pr); chk('Text on cards', tx, val('surface'));
      note.textContent = 'Readability check (aim for 4.5:1 or more) – ' + msgs.join(' · ');
    };
    $$('[data-cp]', tf).forEach(function (c) {
      var t = c.parentNode.querySelector('[data-cp-text]');
      c.addEventListener('input', function () { t.value = c.value; t.dispatchEvent(new Event('input', { bubbles: true })); });
      t.addEventListener('input', function () { var v = t.value.trim(); if (HEX.test(v)) c.value = to6(v); });
    });
    // text colour on the primary button follows automatically until you change it yourself
    var pcEl = field('v_primary-contrast'); var pcTouched = false;
    if (pcEl) pcEl.addEventListener('input', function (e) { if (e.isTrusted) pcTouched = true; });
    var prEl = field('v_primary');
    if (prEl && pcEl) prEl.addEventListener('input', function () {
      if (pcTouched || !HEX.test(prEl.value.trim())) return;
      var p = to6(prEl.value.trim()); var white = ratio('#ffffff', p); var dark = ratio('#0b1220', p); pcEl.value = white >= dark ? '#ffffff' : '#0b1220'; pcEl.dispatchEvent(new Event('input', { bubbles: true }));
    });
    tf.addEventListener('input', render); tf.addEventListener('change', render); render();
  }

  /* ───────── backup restore (JSON upload via fetch so large files work) */
  $$('[data-import-json]').forEach(function (inp) {
    var out = $('[data-import-out]');
    inp.addEventListener('change', function () {
      var f = inp.files[0]; if (!f) return;
      if (!window.confirm('Replace ALL current content, settings and custom themes with “' + f.name + '”? This cannot be undone.')) { inp.value = ''; return; }
      var rd = new FileReader();
      rd.onload = function () {
        var data; try { data = JSON.parse(rd.result); } catch (e) { out.textContent = 'That file is not valid JSON.'; return; }
        out.textContent = 'Restoring…';
        fetch(inp.getAttribute('data-import-json'), { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'x-csrf-token': CSRF }, body: JSON.stringify(data) })
          .then(function (r) { return r.json(); }).then(function (d) { if (d.ok) { out.textContent = '✓ ' + d.message; toast('Restored ✓'); setTimeout(function () { location.href = BASE + '?m=imported'; }, 1400); } else out.textContent = '⚠ ' + (d.error || 'Restore failed'); })
          .catch(function () { out.textContent = '⚠ Restore failed. Check your connection.'; });
      };
      rd.readAsText(f);
    });
  });

  /* theme colour swatches rendered with data-bg (fallback if inline styles are ever blocked) */
  $$('[data-bg]').forEach(function (el) { el.style.background = el.getAttribute('data-bg'); });

  /* flash messages fade out */
  var flash = $('.a-alert.ok[role="status"]'); if (flash) setTimeout(function () { flash.style.transition = 'opacity .6s'; flash.style.opacity = '0'; setTimeout(function () { flash.remove(); }, 700); }, 5000);
  if (location.search.indexOf('m=') >= 0 && window.history && history.replaceState) { try { var u = new URL(location.href); u.searchParams.delete('m'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); } catch (e) { /* ignore */ } }
})();
