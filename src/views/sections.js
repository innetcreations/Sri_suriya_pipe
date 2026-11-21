'use strict';
const { html, raw, esc, icon, img, ph } = require('../render');
const crud = require('../crud');
const db = require('../db');
const K = require('./components');
const D = require('../drive');
const { parseJSON } = require('../util');

const CFG_SIZES = [['0.5', '1/2"'], ['0.75', '3/4"'], ['1', '1"'], ['1.5', '1.5"'], ['2', '2"'], ['2.5', '2.5"'], ['3', '3"'], ['4', '4"'], ['5', '5"'], ['6', '6"'], ['8', '8"'], ['10', '10"'], ['12', '12"']];
const CFG_COLORS = [['#1e88e5', 'Blue'], ['#f4f4f4', 'White'], ['#9e9e9e', 'Grey'], ['#f5f0e1', 'Ivory'], ['#1565c0', 'Royal Blue']];

// Decorative static pipes (also the no-WebGL fallback for the 3D hero)
const pipeArt = () => raw(`<svg class="pipe-art" viewBox="0 0 520 420" role="img" aria-label="PVC pipes"><defs>
<linearGradient id="pa1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".5"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>
<filter id="pa2" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="14" stdDeviation="12" flood-color="#000" flood-opacity=".22"/></filter></defs>
<g filter="url(#pa2)"><g transform="rotate(-14 260 210)">
<rect x="30" y="70" width="440" height="84" rx="14" fill="var(--primary)"/><rect x="30" y="70" width="440" height="84" rx="14" fill="url(#pa1)"/><ellipse cx="470" cy="112" rx="14" ry="42" fill="var(--secondary)" opacity=".9"/><ellipse cx="470" cy="112" rx="9" ry="33" fill="var(--bg-alt)"/>
<rect x="50" y="168" width="440" height="66" rx="12" fill="#f4f4f4"/><rect x="50" y="168" width="440" height="66" rx="12" fill="url(#pa1)"/><ellipse cx="490" cy="201" rx="12" ry="33" fill="#cfd6e0"/><ellipse cx="490" cy="201" rx="7" ry="25" fill="var(--bg-alt)"/>
<rect x="20" y="248" width="440" height="52" rx="10" fill="var(--accent)"/><rect x="20" y="248" width="440" height="52" rx="10" fill="url(#pa1)"/><ellipse cx="460" cy="274" rx="10" ry="26" fill="var(--secondary)" opacity=".85"/><ellipse cx="460" cy="274" rx="6" ry="19" fill="var(--bg-alt)"/>
<rect x="60" y="314" width="400" height="40" rx="8" fill="#9e9e9e"/><rect x="60" y="314" width="400" height="40" rx="8" fill="url(#pa1)"/><ellipse cx="460" cy="334" rx="8" ry="20" fill="#616161"/><ellipse cx="460" cy="334" rx="5" ry="14" fill="var(--bg-alt)"/></g></g></svg>`);

const wrap = (sec, inner, extra = '') => html`<section class="section${sec.bg && sec.bg !== 'default' ? ' section--' + sec.bg : ''}" id="s-${sec.type}-${sec.id}" data-section="${sec.type}"${extra}><div class="container">${inner}</div></section>`;
const secBtn = (ctx, sec) => sec.btn_label && sec.btn_url ? html`<p class="center" style="margin-top:2rem" data-reveal><a class="btn btn-outline" href="${ctx.u(sec.btn_url)}">${ctx.tr(sec, 'btn_label')} ${icon('arrow', 16)}</a></p>` : '';
const head = (ctx, sec) => K.sectionHead(sec.type === 'cta' ? '' : '', ctx.tr(sec, 'title'), ctx.tr(sec, 'subtitle'));
const extra = (sec) => (sec.extra && typeof sec.extra === 'object' ? sec.extra : {});

const R = {
  hero(ctx, sec) {
    // Default: a clean text hero with NO pipe picture. The owner can add a background video or picture in Admin -> Settings -> Content.
    // "Text left / 3D pipes right" is still available (Admin -> Settings -> Appearance -> Hero layout).
    const S = ctx.S; const split = S.hero_style === 'split';
    const videoUrl = !split && S.hero_video ? (D.driveId(S.hero_video) ? D.normalize(S.hero_video, 'file') : S.hero_video) : '';
    const bgImage = !split && !videoUrl && S.hero_poster ? S.hero_poster : '';
    const overlay = ['none', 'soft', 'strong'].includes(S.hero_overlay) ? S.hero_overlay : 'soft';
    const cls = `hero${split ? '' : ' hero--center'}${videoUrl || bgImage ? ` hero--video hero--ov-${overlay}` : ''}`;
    const poster = S.hero_poster;
    const bg = videoUrl ? html`<video class="hero-video" src="${videoUrl}" poster="${poster}" autoplay muted loop playsinline preload="metadata" aria-hidden="true"></video>`
      : bgImage ? img(bgImage, '', { w: 1600, h: 900, cls: 'hero-video', lazy: false, priority: true }) : '';
    return html`<section class="${cls}" data-section="hero">${bg}
    <div class="container hero-grid"><div>
      <span class="eyebrow" data-reveal>${ctx.t('since')} ${S.established} · ${S.city}</span>
      <h1 data-reveal data-delay="60">${ctx.tr(sec, 'title')}</h1><p class="lead" data-reveal data-delay="120">${ctx.tr(sec, 'subtitle')}</p>
      <div class="hero-cta" data-reveal data-delay="180">${sec.btn_label ? html`<a class="btn btn-lg" href="${ctx.u(sec.btn_url || '/quote')}" data-magnetic>${ctx.tr(sec, 'btn_label')} ${icon('arrow', 18)}</a>` : ''}${sec.btn2_label ? html`<a class="btn btn-lg btn-outline" href="${ctx.u(sec.btn2_url || '/products')}">${ctx.tr(sec, 'btn2_label')}</a>` : ''}</div>
      <div class="hero-phone" data-reveal data-delay="220">${icon('phone', 18)}<span>${ctx.t('call_now')}: <a href="${ctx.phoneHref(S.phone1)}">${S.phone1}</a></span></div>
      <div class="hero-trust" data-reveal data-delay="260"><span>${icon('check', 16)} ${ctx.t('delivery')}: ${S.state}</span><span>${icon('check', 16)} 1/2" – 12"</span><span>${icon('check', 16)} ${S.payment_note ? ctx.t('pay_methods') + ': Cash · Cheque · DD · Online' : ''}</span></div>
    </div>
    ${split ? html`<div class="hero-art" data-reveal="zoom" data-delay="120"><div class="hero-3d" data-scene="hero" aria-hidden="true"><div class="hero-3d__fallback">${poster ? img(poster, '', { w: 800, h: 600, cls: 'art-img', lazy: false, priority: true }) : pipeArt()}</div></div></div>` : ''}</div></section>`;
  },
  features(ctx, sec) {
    const rows = crud.active('features'); if (!rows.length) return '';
    return wrap(sec, html`${head(ctx, sec)}<div class="grid grid-4" data-reveal-stagger>${rows.map((f) => html`<div class="card feature" data-tilt data-tilt-max="4"><div class="ico">${icon(f.icon || 'star', 26)}</div><h3>${ctx.tr(f, 'title')}</h3><p>${ctx.tr(f, 'text')}</p></div>`)}</div>`);
  },
  stats(ctx, sec) {
    const rows = crud.active('stats'); if (!rows.length) return '';
    return wrap(sec, html`<div class="stats">${rows.map((s) => html`<div class="stat" data-reveal><b data-counter="${s.value || 0}" data-suffix="${s.suffix || ''}">${s.value || 0}${s.suffix || ''}</b><span>${ctx.tr(s, 'label')}</span></div>`)}</div>`);
  },
  categories(ctx, sec) {
    const rows = crud.active('categories', { limit: extra(sec).limit || 8 }); if (!rows.length) return '';
    const counts = Object.fromEntries(db.prepare('SELECT category_id id, COUNT(*) n FROM products WHERE active=1 GROUP BY category_id').all().map((r) => [r.id, r.n]));
    return wrap(sec, html`${head(ctx, sec)}<div class="grid grid-4">${rows.map((c) => K.categoryCard(ctx, c, counts[c.id] || 0))}</div>${secBtn(ctx, sec)}`);
  },
  featured(ctx, sec) {
    const rows = crud.active('products', { where: 'featured=1', limit: extra(sec).limit || 6 }); if (!rows.length) return '';
    const cats = Object.fromEntries(crud.active('categories').map((c) => [c.id, c]));
    return wrap(sec, html`${head(ctx, sec)}<div class="grid grid-3">${rows.map((p) => K.productCard(ctx, p, cats[p.category_id]))}</div>${secBtn(ctx, sec)}`);
  },
  about(ctx, sec) {
    const lines = String(ctx.tr(sec, 'body') || '').split('\n'); const paras = lines.filter((l) => l.trim() && !/^\s*-\s/.test(l)); const bullets = lines.filter((l) => /^\s*-\s/.test(l)).map((l) => l.replace(/^\s*-\s*/, ''));
    return wrap(sec, html`<div class="split"><div data-reveal="left"><span class="eyebrow">${ctx.tr(sec, 'subtitle')}</span><h2>${ctx.tr(sec, 'title')}</h2>${paras.map((p) => html`<p class="lead">${p}</p>`)}${bullets.length ? html`<ul class="checks">${bullets.map((b) => html`<li>${icon('check', 18)}<span>${b}</span></li>`)}</ul>` : ''}${sec.btn_label ? html`<a class="btn" href="${ctx.u(sec.btn_url || '/about')}">${ctx.tr(sec, 'btn_label')} ${icon('arrow', 16)}</a>` : ''}</div>
    <div data-reveal="right">${img(sec.image, ctx.tr(sec, 'title'), { w: 760, h: 600, cls: 'about-img', label: 'Factory / team photo', sizes: '(max-width:900px) 100vw, 560px' })}</div></div>`);
  },
  process(ctx, sec) {
    const rows = crud.active('process_steps'); if (!rows.length) return '';
    return wrap(sec, html`${head(ctx, sec)}<ol class="steps" data-reveal-stagger>${rows.map((s) => html`<li><h3>${ctx.tr(s, 'title')}</h3><p>${ctx.tr(s, 'text')}</p></li>`)}</ol>`);
  },
  applications(ctx, sec) {
    const rows = crud.active('applications'); if (!rows.length) return '';
    return wrap(sec, html`${head(ctx, sec)}<div class="grid grid-3" data-reveal-stagger>${rows.map((a) => html`<a class="card feature" href="${ctx.u('/applications#' + a.slug)}"><div class="ico">${icon(a.icon || 'leaf', 26)}</div><h3>${ctx.tr(a, 'title')}</h3><p>${ctx.tr(a, 'summary')}</p></a>`)}</div>${secBtn(ctx, sec)}`);
  },
  configurator(ctx, sec) {
    return wrap(sec, html`${head(ctx, sec)}${R._cfg(ctx)}`);
  },
  _cfg(ctx) {
    return html`<div class="cfg" data-configurator><div class="cfg-3d" data-scene="configurator" data-fallback="${ctx.t('cfg_hint')}" role="img" aria-label="${ctx.t('configurator_title')}"></div>
    <div class="cfg-panel panel"><fieldset><legend>${ctx.t('cfg_size')}</legend><div class="opt-row">${CFG_SIZES.map(([v, l], i) => html`<label class="opt"><input type="radio" name="cfg-size" data-cfg="size" value="${v}"${v === '2' ? ' checked' : ''}><span>${l}</span></label>`)}</div></fieldset>
    <fieldset><legend>${ctx.t('cfg_color')}</legend><div class="opt-row">${CFG_COLORS.map(([c, n], i) => html`<label class="opt"><input type="radio" name="cfg-color" data-cfg="color" value="${c}"${i === 0 ? ' checked' : ''}><span><i class="dot" style="--c:${c}"></i>${n}</span></label>`)}</div></fieldset>
    <fieldset><legend>${ctx.t('cfg_length')}</legend><div class="opt-row">${[3, 6].map((l) => html`<label class="opt"><input type="radio" name="cfg-length" data-cfg="length" value="${l}"${l === 3 ? ' checked' : ''}><span>${l} m</span></label>`)}</div></fieldset>
    <label class="opt-row" style="gap:.6rem;align-items:center;cursor:pointer"><input type="checkbox" data-cfg="section" style="width:auto;min-height:0"> <span>${ctx.t('cfg_section')}</span></label>
    <p class="form-note">${ctx.t('cfg_hint')}</p><button class="btn" type="button" data-add-cfg data-sound="add">${icon('plus', 16)} ${ctx.t('cfg_add')}</button></div></div>`;
  },
  sizes(ctx, sec) {
    const rows = crud.active('sizes'); if (!rows.length) return '';
    return wrap(sec, html`${head(ctx, sec)}${K.sizeTable(ctx, rows.slice(0, extra(sec).limit || 20))}${secBtn(ctx, sec)}`);
  },
  testimonials(ctx, sec) {
    const rows = crud.active('testimonials'); if (!rows.length) return '';
    return wrap(sec, html`${head(ctx, sec)}<div class="grid grid-3" data-reveal-stagger>${rows.map((t) => html`<figure class="card testi" style="margin:0"><div class="stars" aria-label="${t.rating} / 5">${K.stars(t.rating)}</div><blockquote>“${ctx.tr(t, 'text')}”</blockquote><footer><span class="avatar">${t.avatar ? img(t.avatar, t.name, { w: 44, h: 44 }) : t.name.slice(0, 1)}</span><span><b>${t.name}</b><br><span class="muted">${ctx.tr(t, 'role')}${t.location ? ' · ' + t.location : ''}</span></span></footer></figure>`)}</div>`);
  },
  gallery(ctx, sec) {
    const rows = crud.active('gallery', { limit: extra(sec).limit || 8 }); if (!rows.length) return '';
    return wrap(sec, html`${head(ctx, sec)}<div class="gallery" data-lightbox>${rows.map((g) => html`<figure data-reveal="zoom">${img(g.image, ctx.tr(g, 'title'), { w: 600, h: 450, label: ctx.tr(g, 'title') })}<figcaption>${ctx.tr(g, 'title')}</figcaption></figure>`)}</div>${secBtn(ctx, sec)}`);
  },
  areas(ctx, sec) {
    const rows = crud.active('areas'); if (!rows.length) return '';
    return wrap(sec, html`${head(ctx, sec)}<div class="chips" style="justify-content:center" data-reveal>${rows.map((a) => html`<a class="chip" href="${ctx.u('/pvc-pipes-in-' + a.slug)}">${icon('pin', 14)}&nbsp;${ctx.tr(a, 'name')}</a>`)}</div>${secBtn(ctx, sec)}`);
  },
  posts(ctx, sec) {
    const rows = crud.active('posts', { where: "status='published'", limit: 3, order: 'published_at DESC, id DESC' }); if (!rows.length) return '';
    return wrap(sec, html`${head(ctx, sec)}<div class="grid grid-3">${rows.map((p) => K.postCard(ctx, p))}</div>`);
  },
  faq(ctx, sec) {
    const rows = crud.active('faqs', { limit: extra(sec).limit || 6 }); if (!rows.length) return '';
    return wrap(sec, html`${head(ctx, sec)}${K.faqList(ctx, rows)}${secBtn(ctx, sec)}`);
  },
  video(ctx, sec) {
    const u = extra(sec).url || ''; if (!u) return '';
    const yt = u.match(/^[\w-]{11}$/) ? u : (u.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/) || [])[1];
    const dv = D.driveId(u) ? D.normalize(u, 'video') : '';   // a Google Drive link plays inside Drive's own player
    return wrap(sec, html`${head(ctx, sec)}<div class="prose" style="margin-inline:auto;max-width:56rem">${yt ? html`<iframe src="https://www.youtube-nocookie.com/embed/${yt}" title="${ctx.tr(sec, 'title')}" loading="lazy" allowfullscreen></iframe>` : dv ? html`<iframe src="${dv}" title="${ctx.tr(sec, 'title')}" loading="lazy" allow="autoplay" allowfullscreen></iframe>` : html`<video src="${u}" controls preload="none" style="width:100%;border-radius:var(--radius)"></video>`}</div>`);
  },
  cta(ctx, sec) {
    return wrap(sec, html`<div class="center" data-reveal><h2>${ctx.tr(sec, 'title')}</h2>${sec.subtitle ? html`<p class="lead" style="max-width:40rem;margin-inline:auto">${ctx.tr(sec, 'subtitle')}</p>` : ''}<div class="hero-cta" style="justify-content:center">${sec.btn_label ? html`<a class="btn btn-lg btn-light" href="${ctx.u(sec.btn_url || '/quote')}">${ctx.tr(sec, 'btn_label')}</a>` : ''}${sec.btn2_label ? html`<a class="btn btn-lg btn-outline" style="color:inherit;border-color:currentColor" href="${ctx.u(sec.btn2_url || '/contact')}">${ctx.tr(sec, 'btn2_label')}</a>` : ''}<a class="btn btn-lg btn-wa" href="${ctx.waLink('Hello, I would like a quotation.')}" target="_blank" rel="noopener noreferrer">${icon('whatsapp', 18)} WhatsApp</a></div></div>`);
  },
  marquee(ctx, sec) {
    const items = extra(sec).items || ['Delivery across Tamil Nadu', 'Sizes from 1/2" to 12"', 'Agriculture · Borewell · Electrical', `Since ${ctx.S.established}`];
    const row = items.concat(items);
    return html`<section class="section" style="padding:1.4rem 0" aria-label="Highlights"><div class="marquee"><div class="marquee__track">${row.map((t) => html`<span class="badge-row">${icon('check', 18)}${t}</span>`)}</div></div></section>`;
  },
  certificates(ctx, sec) {
    const rows = crud.active('certificates'); if (!rows.length) return '';
    return wrap(sec, html`${head(ctx, sec)}<div class="grid grid-4">${rows.map((c) => html`<div class="card feature center"><div class="ico" style="margin-inline:auto">${icon('badge', 26)}</div><h3>${ctx.tr(c, 'title')}</h3><p>${c.issuer || ''}${c.number ? ' · ' + c.number : ''}</p></div>`)}</div>`);
  },
};

function home(ctx) {
  const secs = crud.active('sections', { where: "page='home'" });
  return html`${secs.map((s) => { try { return (R[s.type] || (() => ''))(ctx, s); } catch (e) { console.error('[section]', s.type, e.message); return ''; } })}`;
}
module.exports = { home, R, pipeArt, CFG_SIZES, CFG_COLORS };
