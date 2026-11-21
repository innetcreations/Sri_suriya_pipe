/* SEO inspector - shown ONLY to a signed-in admin (the server adds this script tag for them alone).
   Reads the page that is already on screen and lists what search engines see. Nothing is sent anywhere. */
(function () {
  'use strict';
  var script = document.currentScript;
  var admin = (script && script.getAttribute('data-admin')) || '/admin';
  var el = function (tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  var meta = function (sel) { var m = document.querySelector(sel); return m ? (m.getAttribute('content') || '').trim() : ''; };

  function collect() {
    var title = document.title.trim();
    var desc = meta('meta[name="description"]');
    var canon = document.querySelector('link[rel="canonical"]');
    var h1 = [].slice.call(document.querySelectorAll('h1'));
    var heads = [].slice.call(document.querySelectorAll('main h1, main h2, main h3, h1, h2, h3')).filter(function (h, i, a) { return a.indexOf(h) === i; });
    var imgs = [].slice.call(document.querySelectorAll('img'));
    var noAlt = imgs.filter(function (i) { return !i.hasAttribute('alt'); });
    var links = [].slice.call(document.querySelectorAll('a[href]'));
    var internal = links.filter(function (a) { return a.hostname === location.hostname; }).length;
    var ld = [];
    [].slice.call(document.querySelectorAll('script[type="application/ld+json"]')).forEach(function (s) {
      try { var j = JSON.parse(s.textContent); (Array.isArray(j) ? j : [j]).forEach(function (x) { if (x && x['@type']) ld.push(String(x['@type'])); }); } catch (e) { ld.push('INVALID JSON-LD'); }
    });
    var main = document.querySelector('main') || document.body;
    var words = (main.innerText || '').trim().split(/\s+/).filter(Boolean).length;
    return { title: title, desc: desc, canon: canon ? canon.href : '', robots: meta('meta[name="robots"]'), lang: document.documentElement.lang,
      hreflang: document.querySelectorAll('link[rel="alternate"][hreflang]').length, ogTitle: meta('meta[property="og:title"]'), ogImage: meta('meta[property="og:image"]'),
      h1: h1, heads: heads, imgs: imgs.length, noAlt: noAlt, links: links.length, internal: internal, ld: ld, words: words, viewport: !!meta('meta[name="viewport"]') };
  }

  function checks(d) {
    var c = [];
    var add = function (ok, label, detail, warn) { c.push({ st: ok ? 'ok' : warn ? 'warn' : 'fail', label: label, detail: detail || '' }); };
    add(d.title.length >= 25 && d.title.length <= 62, 'Title', d.title.length + ' characters: ' + d.title, d.title.length > 0);
    add(d.desc.length >= 70 && d.desc.length <= 165, 'Meta description', d.desc ? d.desc.length + ' characters' : 'missing', d.desc.length > 0);
    add(d.h1.length === 1, 'One H1 heading', d.h1.length + ' found' + (d.h1[0] ? ': ' + d.h1[0].textContent.trim().slice(0, 70) : ''), d.h1.length > 1);
    add(!!d.canon, 'Canonical link', d.canon || 'missing');
    add(!/noindex/i.test(d.robots), 'Allowed in search results', d.robots || 'no robots tag (default: index)');
    add(!!d.lang, 'Page language set', d.lang || 'missing');
    add(d.hreflang >= 2, 'Language alternates (hreflang)', d.hreflang + ' found', d.hreflang > 0);
    add(!!d.ogTitle && !!d.ogImage, 'Share preview (Open Graph)', (d.ogImage ? 'image set' : 'no share image'), !!d.ogTitle);
    add(d.noAlt.length === 0, 'Images have alt text', d.noAlt.length + ' of ' + d.imgs + ' without alt');
    add(d.ld.length > 0 && d.ld.indexOf('INVALID JSON-LD') < 0, 'Structured data', d.ld.length ? d.ld.join(', ') : 'none');
    add(d.words >= 150, 'Enough text on the page', d.words + ' words', d.words >= 60);
    add(d.viewport, 'Mobile viewport', d.viewport ? 'set' : 'missing');
    return c;
  }

  function build() {
    var d = collect(); var cs = checks(d);
    var pass = cs.filter(function (x) { return x.st === 'ok'; }).length;
    var score = Math.round((pass / cs.length) * 100);
    var root = el('div', 'seo-insp'); root.setAttribute('data-seo-insp', '1');
    var btn = el('button', 'seo-insp__btn', 'SEO ' + score + '%'); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false');
    var panel = el('div', 'seo-insp__panel'); panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'SEO inspector');
    var head = el('div', 'seo-insp__head'); head.appendChild(el('b', '', 'SEO inspector - ' + score + '% (' + pass + '/' + cs.length + ')'));
    var close = el('button', 'seo-insp__x', '×'); close.type = 'button'; close.setAttribute('aria-label', 'Close'); head.appendChild(close); panel.appendChild(head);
    var list = el('ul', 'seo-insp__list');
    cs.forEach(function (x) { var li = el('li', 'seo-insp__' + x.st); li.appendChild(el('span', 'seo-insp__dot', x.st === 'ok' ? '✓' : x.st === 'warn' ? '!' : '✕')); var t = el('div'); t.appendChild(el('b', '', x.label)); if (x.detail) t.appendChild(el('small', '', x.detail)); li.appendChild(t); list.appendChild(li); });
    panel.appendChild(list);
    var outline = el('details', 'seo-insp__more'); outline.appendChild(el('summary', '', 'Heading outline (' + d.heads.length + ')'));
    var ol = el('ol'); d.heads.slice(0, 40).forEach(function (h) { var li = el('li', 'lvl' + h.tagName.slice(1), h.tagName + ' ' + h.textContent.trim().slice(0, 80)); ol.appendChild(li); }); outline.appendChild(ol); panel.appendChild(outline);
    if (d.noAlt.length) { var im = el('details', 'seo-insp__more'); im.appendChild(el('summary', '', 'Images without alt (' + d.noAlt.length + ')')); var ul = el('ul'); d.noAlt.slice(0, 15).forEach(function (i) { ul.appendChild(el('li', '', (i.getAttribute('src') || '').slice(0, 90))); }); im.appendChild(ul); panel.appendChild(im); }
    var foot = el('p', 'seo-insp__foot'); var a = el('a', '', 'Open SEO Centre'); a.href = admin + '/seo'; foot.appendChild(a);
    foot.appendChild(document.createTextNode(' · ' + d.links + ' links (' + d.internal + ' internal) · only you see this')); panel.appendChild(foot);
    root.appendChild(panel); root.appendChild(btn); document.body.appendChild(root);
    function toggle(open) { panel.hidden = !open; btn.setAttribute('aria-expanded', String(open)); }
    btn.addEventListener('click', function () { toggle(panel.hidden); });
    close.addEventListener('click', function () { toggle(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') toggle(false); });
  }
  if (document.readyState === 'complete') build(); else window.addEventListener('load', function () { setTimeout(build, 400); });
})();
