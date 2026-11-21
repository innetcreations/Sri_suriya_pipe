'use strict';
const { html, raw, esc, icon, img } = require('../render');
const crud = require('../crud');
const db = require('../db');
const K = require('./components');
const sections = require('./sections');
const { fmtDate } = require('../util');

const catMap = () => Object.fromEntries(crud.active('categories').map((c) => [c.id, c]));
const PER_PAGE = 12;

// ───────────────────────── enquiry form (used on /quote, /contact and the home CTA)
function enquiryForm(ctx, { type = 'quote', id = 'enquiry' } = {}) {
  const S = ctx.S; const prods = crud.active('products');
  return html`<form class="form" data-enquiry-form id="${id}" novalidate>
    <div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
    <input type="hidden" name="_ft" value=""><input type="hidden" name="lang" value="${ctx.lang}">
    <div data-basket-summary></div>
    <div class="form-row"><label class="field"><span class="lbl">${ctx.t('f_name')} <span class="req">*</span></span><input name="name" required maxlength="80" autocomplete="name"><span class="field-err" data-err="name"></span></label>
      <label class="field"><span class="lbl">${ctx.t('f_phone')} <span class="req">*</span></span><input name="phone" type="tel" inputmode="tel" required maxlength="20" autocomplete="tel" placeholder="+91 …"><span class="field-err" data-err="phone"></span></label></div>
    <div class="form-row"><label class="field">${ctx.t('f_email')}<input name="email" type="email" maxlength="120" autocomplete="email"><span class="field-err" data-err="email"></span></label>
      <label class="field">${ctx.t('f_type')}<select name="type">${[['quote', 'type_quote'], ['order', 'type_order'], ['dealer', 'type_dealer'], ['support', 'type_support']].map(([v, k]) => html`<option value="${v}"${v === type ? ' selected' : ''}>${ctx.t(k)}</option>`)}</select></label></div>
    <div class="form-row three"><label class="field">${ctx.t('f_product')}<select name="product"><option value="">${ctx.t('f_select')}</option>${prods.map((p) => html`<option value="${ctx.tr(p, 'name')}">${ctx.tr(p, 'name')}</option>`)}</select></label>
      <label class="field">${ctx.t('f_size')}<input name="size" maxlength="40" list="sizes-dl" placeholder='e.g. 4"'><datalist id="sizes-dl">${['1/2"', '3/4"', '1"', '1.5"', '2"', '2.5"', '3"', '4"', '5"', '6"', '7"', '8"', '10"', '12"'].map((s) => html`<option value="${s}">`)}</datalist></label>
      <label class="field">${ctx.t('f_color')}<input name="color" maxlength="40" list="colors-dl"><datalist id="colors-dl">${['Blue', 'White', 'Grey', 'Ivory', 'Royal Blue', 'Black'].map((s) => html`<option value="${s}">`)}</datalist></label></div>
    <div class="form-row"><label class="field">${ctx.t('f_qty')}<input name="qty" maxlength="40" placeholder="e.g. 200 pipes / 1000 m"></label><label class="field">${ctx.t('f_location')}<input name="location" maxlength="120" autocomplete="address-level2"></label></div>
    <label class="field">${ctx.t('f_message')}<textarea name="message" maxlength="1500"></textarea></label>
    ${S.turnstile_site ? html`<div class="cf-turnstile" data-sitekey="${S.turnstile_site}"></div>` : ''}
    <div><button class="btn btn-lg" type="submit" data-sound="none">${icon('arrow', 18)} <span data-label>${ctx.t('f_send')}</span></button></div>
    <p class="form-note">${S.payment_note}</p><div data-form-status role="status" aria-live="polite"></div></form>`;
}

const mapBlock = (ctx) => ctx.S.map_embed ? html`<div class="map-box"><button class="map-btn" type="button" data-load-map="${ctx.S.map_embed}">${icon('pin', 36)}<span>${ctx.t('load_map')}</span></button></div>` : '';

const pages = {
  home(ctx) {
    return { page: 'home', home: true, body: sections.home(ctx), desc: ctx.S.seo_description, canonical: '/' };
  },

  products(ctx, req) {
    const q = String(req.query.q || '').slice(0, 60); const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const cats = crud.active('categories'); const cm = catMap();
    const { rows, total } = crud.list('products', { q, page, per: PER_PAGE, onlyActive: true });
    const pagesN = Math.ceil(total / PER_PAGE);
    const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_products') }];
    return {
      page: 'products', title: ctx.t('our_products'), desc: ctx.S.seo_description, canonical: '/products', schema: [K.crumbSchema(ctx, items)], noindex: !!q || page > 1,
      body: html`${K.pageHead(ctx, { title: ctx.t('our_products'), sub: ctx.tr(ctx.S, 'tagline') || ctx.S.tagline, items })}
      <section class="section"><div class="container"><div class="filters"><div class="chips"><a class="chip is-active" href="${ctx.u('/products')}">${ctx.t('all')}</a>${cats.map((c) => html`<a class="chip" href="${ctx.u('/products/category/' + c.slug)}">${ctx.tr(c, 'name')}</a>`)}</div>
      <form action="${ctx.u('/products')}" method="get" role="search" style="min-width:240px"><input type="search" name="q" value="${q}" placeholder="${ctx.t('search_ph')}" aria-label="${ctx.t('search')}"></form></div>
      ${rows.length ? html`<h2 class="sr-only">${ctx.t('our_products')}</h2><div class="grid grid-3">${rows.map((p) => K.productCard(ctx, p, cm[p.category_id]))}</div>${K.pagination(ctx, '/products' + (q ? '?q=' + encodeURIComponent(q) : ''), page, pagesN)}` : html`<p class="empty">${ctx.t('no_results')}</p>`}</div></section>
      <section class="section section--alt"><div class="container">${K.sectionHead('', ctx.t('product_categories'))}<div class="grid grid-4">${cats.map((c) => K.categoryCard(ctx, c))}</div></div></section>`,
    };
  },

  category(ctx, req) {
    const cat = crud.bySlug('categories', req.params.slug); if (!cat) return null;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const { rows, total } = crud.list('products', { page, per: PER_PAGE, onlyActive: true, filters: { category_id: cat.id } });
    const name = ctx.tr(cat, 'name'); const cats = crud.active('categories');
    const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_products'), url: '/products' }, { label: name }];
    return {
      page: 'category', title: ctx.tr(cat, 'seo_title') || name, desc: ctx.tr(cat, 'seo_desc') || ctx.tr(cat, 'summary'), image: cat.og_image || cat.image, canonical: `/products/category/${cat.slug}`, schema: [K.crumbSchema(ctx, items)], noindex: page > 1,
      body: html`${K.pageHead(ctx, { title: name, sub: ctx.tr(cat, 'summary'), items })}<section class="section"><div class="container"><div class="filters"><div class="chips"><a class="chip" href="${ctx.u('/products')}">${ctx.t('all')}</a>${cats.map((c) => html`<a class="chip${c.id === cat.id ? ' is-active' : ''}" href="${ctx.u('/products/category/' + c.slug)}">${ctx.tr(c, 'name')}</a>`)}</div></div>
      ${rows.length ? html`<div class="grid grid-3">${rows.map((p) => K.productCard(ctx, p, cat))}</div>${K.pagination(ctx, `/products/category/${cat.slug}`, page, Math.ceil(total / PER_PAGE))}` : html`<p class="empty">${ctx.t('no_results')}</p>`}</div></section>`,
    };
  },

  product(ctx, req) {
    const p = crud.bySlug('products', req.params.slug); if (!p) return null;
    const cat = crud.get('categories', p.category_id); const name = ctx.tr(p, 'name');
    const related = crud.active('products', { where: 'category_id=? AND id<>?', args: [p.category_id, p.id], limit: 3 });
    const gal = [p.image, ...(p.gallery || [])].filter(Boolean);
    const sizes = (p.sizes || []); const colors = (p.colors || []); const uses = Array.isArray(ctx.tr(p, 'uses')) ? ctx.tr(p, 'uses') : (p.uses || []);
    const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_products'), url: '/products' }, ...(cat ? [{ label: ctx.tr(cat, 'name'), url: '/products/category/' + cat.slug }] : []), { label: name }];
    const schema = { '@context': 'https://schema.org', '@type': 'Product', name, description: ctx.tr(p, 'summary'), image: gal.filter((g) => /^\//.test(g)).map((g) => ctx.abs(g)), category: cat ? cat.name : undefined, brand: { '@type': 'Brand', name: ctx.S.site_name }, manufacturer: { '@type': 'Organization', name: ctx.S.site_name }, url: ctx.abs(ctx.u('/products/' + p.slug)) };
    return {
      page: 'product', title: ctx.tr(p, 'seo_title') || name, desc: ctx.tr(p, 'seo_desc') || ctx.tr(p, 'summary'), image: p.og_image || p.image, ogType: 'product', canonical: `/products/${p.slug}`, schema: [JSON.parse(JSON.stringify(schema)), K.crumbSchema(ctx, items)],
      body: html`${K.pageHead(ctx, { title: name, items, sub: ctx.tr(p, 'summary') })}<section class="section"><div class="container"><div class="product-hero">
        <div class="product-gallery" data-gallery><div class="main">${img(gal[0], name, { w: 900, h: 675, lazy: false, priority: true, label: name, cls: '' })}</div>${gal.length > 1 ? html`<div class="thumbs">${gal.map((g, i) => html`<button type="button" data-thumb="${g}"${i === 0 ? ' aria-current="true"' : ''} aria-label="Image ${i + 1}">${img(g, '', { w: 120, h: 120 })}</button>`)}</div>` : ''}</div>
        <div><p>${p.badge || ctx.tr(p, 'badge') ? html`<span class="badge">${ctx.tr(p, 'badge')}</span>` : ''}</p>
          ${sizes.length ? html`<h3>${ctx.t('sizes_available')}</h3><div class="chips" style="margin-bottom:1rem">${sizes.map((s) => html`<span class="chip">${s}</span>`)}</div>` : ''}
          ${colors.length ? html`<h3>${ctx.t('colours_available')}</h3><div class="chips" style="margin-bottom:1rem">${colors.map((s) => html`<span class="chip">${s}</span>`)}</div>` : ''}
          ${uses.length ? html`<h3>${ctx.t('typical_uses')}</h3><ul class="checks">${uses.map((u) => html`<li>${icon('check', 18)}<span>${u}</span></li>`)}</ul>` : ''}
          <div class="hero-cta"><button class="btn btn-lg" type="button" data-add-quote data-id="${p.id}" data-name="${name}" data-sound="add">${icon('plus', 18)} ${ctx.t('add_to_quote')}</button><a class="btn btn-lg btn-outline" href="${ctx.u('/quote')}?product=${encodeURIComponent(name)}">${ctx.t('get_quote')}</a><a class="btn btn-lg btn-wa" href="${ctx.waLink('Hello, I am interested in: ' + name)}" target="_blank" rel="noopener noreferrer">${icon('whatsapp', 18)}</a></div>
          <p class="muted">${ctx.t('price_on_request')}. ${ctx.S.delivery_note}</p></div></div>
        ${(p.specs || []).length || ctx.tr(p, 'body') ? html`<div class="layout-main" style="margin-top:3rem"><div class="prose">${raw(ctx.tr(p, 'body'))}</div>${(p.specs || []).length ? html`<aside class="panel sticky"><h3>${ctx.t('specifications')}</h3><dl class="spec-list">${p.specs.map((s) => html`<dt>${s.k}</dt><dd>${s.v}</dd>`)}</dl></aside>` : ''}</div>` : ''}</div></section>
      ${related.length ? html`<section class="section section--alt"><div class="container">${K.sectionHead('', ctx.t('related'))}<div class="grid grid-3">${related.map((r) => K.productCard(ctx, r, cat))}</div></div></section>` : ''}`,
    };
  },

  sizes(ctx) {
    const rows = crud.active('sizes'); const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_sizes') }];
    return { page: 'sizes', title: ctx.t('sizes_title'), desc: 'PVC pipe size chart: sizes, colours and applications for plumbing, electrical, agriculture, borewell and drainage pipes.', canonical: '/sizes', schema: [K.crumbSchema(ctx, items)],
      body: html`${K.pageHead(ctx, { title: ctx.t('sizes_title'), items, sub: ctx.t('calc_note') })}<section class="section"><div class="container">${rows.length ? K.sizeTable(ctx, rows) : html`<p class="empty">${ctx.t('no_results')}</p>`}<p class="center" style="margin-top:2rem"><a class="btn" href="${ctx.u('/quote')}">${ctx.t('get_quote')}</a> <a class="btn btn-outline" href="${ctx.u('/calculator')}">${ctx.t('nav_calculator')}</a>${ctx.S.catalog_pdf ? html` <a class="btn btn-ghost" href="${ctx.S.catalog_pdf}" download>${icon('download', 16)} ${ctx.t('download_catalog')}</a>` : ''}</p></div></section>` };
  },

  applications(ctx) {
    const rows = crud.active('applications'); const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_applications') }];
    return { page: 'applications', title: ctx.t('applications_title'), desc: 'Where Sri Suriya PVC pipes are used: agricultural irrigation, borewell water supply, farm water distribution, construction, plumbing and electrical wiring.', canonical: '/applications', schema: [K.crumbSchema(ctx, items)],
      body: html`${K.pageHead(ctx, { title: ctx.t('applications_title'), items })}<section class="section"><div class="container"><div class="grid grid-2">${rows.map((a) => html`<article class="card" id="${a.slug}" data-reveal><div class="card-media">${img(a.image, ctx.tr(a, 'title'), { w: 760, h: 520, label: ctx.tr(a, 'title') })}</div><div class="card-body"><h3>${icon(a.icon || 'leaf', 22)} ${ctx.tr(a, 'title')}</h3><p>${ctx.tr(a, 'summary')}</p>${a.body ? html`<div class="prose" style="margin-top:.8rem">${raw(ctx.tr(a, 'body'))}</div>` : ''}</div></article>`)}</div></div></section>` };
  },

  gallery(ctx) {
    const rows = crud.active('gallery'); const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))]; const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_gallery') }];
    return { page: 'gallery', title: ctx.t('gallery'), desc: 'Photos of our PVC pipe factory, products, agricultural installations and deliveries in Madurai, Tamil Nadu.', canonical: '/gallery', schema: [K.crumbSchema(ctx, items)],
      body: html`${K.pageHead(ctx, { title: ctx.t('gallery'), items })}<section class="section"><div class="container"><div class="chips" style="margin-bottom:1.6rem" data-gallery-filter><button class="chip is-active" type="button" data-cat="">${ctx.t('all')}</button>${cats.map((c) => html`<button class="chip" type="button" data-cat="${c}">${c}</button>`)}</div>
      <div class="gallery" data-lightbox>${rows.map((g) => html`<figure data-cat="${g.category}">${img(g.image, ctx.tr(g, 'title'), { w: 600, h: 450, label: ctx.tr(g, 'title') })}<figcaption>${ctx.tr(g, 'title')}</figcaption></figure>`)}</div></div></section>` };
  },

  blog(ctx, req) {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1); const per = 9;
    const { rows, total } = crud.list('posts', { page, per, onlyActive: true, filters: { status: 'published' } });
    const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_blog') }];
    return { page: 'blog', title: ctx.t('latest_news'), desc: 'Practical guides on choosing and using PVC pipes for irrigation, borewells, plumbing and electrical work.', canonical: '/blog', schema: [K.crumbSchema(ctx, items)], noindex: page > 1,
      body: html`${K.pageHead(ctx, { title: ctx.t('latest_news'), items })}<section class="section"><div class="container">${rows.length ? html`<h2 class="sr-only">${ctx.t('latest_news')}</h2><div class="grid grid-3">${rows.map((p) => K.postCard(ctx, p))}</div>${K.pagination(ctx, '/blog', page, Math.ceil(total / per))}` : html`<p class="empty">${ctx.t('no_results')}</p>`}</div></section>` };
  },

  post(ctx, req) {
    const p = crud.bySlug('posts', req.params.slug); if (!p || p.status !== 'published' || (p.published_at && p.published_at > new Date().toISOString().slice(0, 16))) return null;
    const title = ctx.tr(p, 'title'); const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_blog'), url: '/blog' }, { label: title }];
    const more = crud.active('posts', { where: "status='published' AND id<>?", args: [p.id], limit: 3, order: 'published_at DESC' });
    const words = String(ctx.tr(p, 'body')).replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    const schema = { '@context': 'https://schema.org', '@type': 'Article', headline: title, description: ctx.tr(p, 'excerpt'), image: p.cover && /^\//.test(p.cover) ? [ctx.abs(p.cover)] : undefined, datePublished: p.published_at || undefined, dateModified: p.updated_at || undefined, author: { '@type': 'Organization', name: p.author || ctx.S.site_name }, publisher: { '@type': 'Organization', name: ctx.S.site_name, logo: ctx.S.logo ? { '@type': 'ImageObject', url: ctx.abs(ctx.S.logo) } : undefined }, mainEntityOfPage: ctx.abs(ctx.u('/blog/' + p.slug)) };
    return { page: 'post', title: ctx.tr(p, 'seo_title') || title, desc: ctx.tr(p, 'seo_desc') || ctx.tr(p, 'excerpt'), image: p.og_image || p.cover, ogType: 'article', canonical: `/blog/${p.slug}`, schema: [JSON.parse(JSON.stringify(schema)), K.crumbSchema(ctx, items)],
      body: html`${K.pageHead(ctx, { title, items })}<section class="section"><div class="container"><article class="prose" style="margin-inline:auto"><div class="meta" style="margin-bottom:1.2rem"><time datetime="${p.published_at}">${ctx.t('published')}: ${fmtDate(p.published_at, ctx.lang)}</time><span>${Math.max(1, Math.round(words / 200))} ${ctx.t('min_read')}</span>${p.author ? html`<span>${ctx.t('by')} ${p.author}</span>` : ''}</div>${p.cover ? img(p.cover, title, { w: 1000, h: 560, lazy: false, priority: true }) : ''}${raw(ctx.tr(p, 'body'))}
        <div class="share" style="margin-top:2rem"><b>${ctx.t('share')}:</b><a class="btn btn-sm btn-wa" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${encodeURIComponent(title + ' ' + ctx.abs(ctx.u('/blog/' + p.slug)))}">WhatsApp</a><button class="btn btn-sm btn-ghost" type="button" data-copy="${ctx.abs(ctx.u('/blog/' + p.slug))}">${icon('copy', 14)} ${ctx.t('copy_link')}</button></div></article></div></section>
      ${more.length ? html`<section class="section section--alt"><div class="container">${K.sectionHead('', ctx.t('latest_news'))}<div class="grid grid-3">${more.map((m) => K.postCard(ctx, m))}</div></div></section>` : ''}` };
  },

  faq(ctx) {
    const rows = crud.active('faqs'); const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_faq') }];
    return { page: 'faq', title: ctx.t('faq_title'), desc: 'Answers about PVC pipe sizes, borewell casing, delivery across Tamil Nadu, quotations and payment.', canonical: '/faq', schema: [K.faqSchema(ctx, rows), K.crumbSchema(ctx, items)],
      body: html`${K.pageHead(ctx, { title: ctx.t('faq_title'), items })}<section class="section"><div class="container">${rows.length ? K.faqList(ctx, rows) : html`<p class="empty">${ctx.t('no_results')}</p>`}<p class="center" style="margin-top:2rem">${ctx.t('chat_open')} · <a href="${ctx.u('/contact')}">${ctx.t('nav_contact')}</a></p></div></section>` };
  },

  calculator(ctx) {
    const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_calculator') }];
    return { page: 'calculator', title: ctx.t('calc_title'), desc: 'Free PVC pipe quantity calculator: estimate how many pipes you need for your pipeline length, with a wastage allowance.', canonical: '/calculator', schema: [K.crumbSchema(ctx, items)],
      body: html`${K.pageHead(ctx, { title: ctx.t('calc_title'), items })}<section class="section"><div class="container"><div class="split" style="align-items:start"><form class="panel form" data-calculator onsubmit="return false">
        <label class="field">${ctx.t('calc_run')}<input type="number" name="run" min="1" max="1000000" step="any" value="100" inputmode="decimal"></label>
        <label class="field">${ctx.t('calc_len')}<input type="number" name="len" min="0.5" max="12" step="any" value="${ctx.S.pipe_length_m}" inputmode="decimal"></label>
        <label class="field">${ctx.t('calc_waste')}<input type="number" name="waste" min="0" max="50" step="any" value="${ctx.S.wastage_pct}" inputmode="decimal"></label></form>
        <div><div class="calc-result" data-calc-out aria-live="polite"><span>${ctx.t('calc_result')}</span><b>–</b><span>${ctx.t('calc_pipes')}</span></div><p class="form-note" style="margin-top:1rem">${ctx.t('calc_note')}</p><a class="btn btn-lg" href="${ctx.u('/quote')}" data-calc-quote>${ctx.t('get_quote')}</a></div></div></div></section>` };
  },

  quote(ctx, req) {
    const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('get_quote') }];
    return { page: 'quote', title: ctx.t('order_form_title'), desc: 'Request a quotation or place an order for PVC pipes, fittings and water tanks. We reply with a written quote.', canonical: '/quote', schema: [K.crumbSchema(ctx, items)],
      body: html`${K.pageHead(ctx, { title: ctx.t('order_form_title'), items, sub: ctx.S.payment_note + ' ' + ctx.S.delivery_note })}<section class="section"><div class="container"><div class="layout-main"><div class="panel">${enquiryForm(ctx, { type: 'quote' })}</div>
      <aside class="sticky"><div class="panel"><h3>${ctx.t('contact_us')}</h3><ul class="contact-list"><li><span class="ico">${icon('phone', 20)}</span><span><b>${ctx.t('phone')}</b><a href="${ctx.phoneHref(ctx.S.phone1)}">${ctx.S.phone1}</a><br><a href="${ctx.phoneHref(ctx.S.phone2)}">${ctx.S.phone2}</a></span></li><li><span class="ico">${icon('whatsapp', 20)}</span><span><b>WhatsApp</b><a href="${ctx.waLink()}" target="_blank" rel="noopener noreferrer">${ctx.S.phone1}</a></span></li><li><span class="ico">${icon('pin', 20)}</span><span><b>${ctx.t('address')}</b>${ctx.address().join(', ')}</span></li></ul></div></aside></div></div></section>` };
  },

  contact(ctx) {
    const S = ctx.S; const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_contact') }];
    return { page: 'contact', title: ctx.t('contact_title'), desc: `Contact ${S.site_name}, ${S.city}. Call ${S.phone1}, WhatsApp or send an enquiry for PVC pipes, fittings and water tanks.`, canonical: '/contact', schema: [K.crumbSchema(ctx, items)],
      body: html`${K.pageHead(ctx, { title: ctx.t('contact_title'), items })}<section class="section"><div class="container"><div class="split" style="align-items:start"><div>
        <ul class="contact-list"><li><span class="ico">${icon('pin', 20)}</span><span><b>${ctx.t('address')}</b>${S.site_name}<br>${ctx.address().join(', ')}</span></li>
        <li><span class="ico">${icon('user', 20)}</span><span><b>${ctx.t('proprietor')}</b>${S.proprietor}</span></li>
        <li><span class="ico">${icon('phone', 20)}</span><span><b>${ctx.t('phone')}</b><a href="${ctx.phoneHref(S.phone1)}">${S.phone1}</a><br><a href="${ctx.phoneHref(S.phone2)}">${S.phone2}</a><br>${S.office_phone ? html`<a href="${ctx.phoneHref(S.office_phone)}">${S.office_phone}</a> (Office)` : ''}</span></li>
        ${S.email ? html`<li><span class="ico">${icon('mail', 20)}</span><span><b>Email</b><a href="mailto:${S.email}">${S.email}</a></span></li>` : ''}${S.hours ? html`<li><span class="ico">${icon('clock', 20)}</span><span><b>${ctx.t('hours')}</b>${S.hours}</span></li>` : ''}</ul>
        <div class="hero-cta"><a class="btn btn-wa" href="${ctx.waLink()}" target="_blank" rel="noopener noreferrer">${icon('whatsapp', 18)} ${ctx.t('whatsapp_us')}</a>${S.map_link ? html`<a class="btn btn-outline" href="${S.map_link}" target="_blank" rel="noopener noreferrer">${icon('external', 16)} ${ctx.t('directions')}</a>` : ''}</div>${mapBlock(ctx)}</div>
        <div class="panel"><h2 style="font-size:1.4rem">${ctx.t('order_form_title')}</h2>${enquiryForm(ctx, { type: 'quote' })}</div></div></div></section>` };
  },

  areas(ctx) {
    const rows = crud.active('areas'); const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_areas') }];
    return { page: 'areas', title: ctx.t('service_areas'), desc: `${ctx.S.site_name} delivers PVC pipes across ${ctx.S.state} from Madurai.`, canonical: '/areas', schema: [K.crumbSchema(ctx, items)],
      body: html`${K.pageHead(ctx, { title: ctx.t('service_areas'), items, sub: ctx.t('areas_intro') })}<section class="section"><div class="container"><div class="grid grid-4">${rows.map((a) => html`<a class="card feature" href="${ctx.u('/pvc-pipes-in-' + a.slug)}" data-reveal><div class="ico">${icon('pin', 24)}</div><h3>${ctx.tr(a, 'name')}</h3><p>${ctx.t('products_in')} ${ctx.tr(a, 'name')}</p></a>`)}</div></div></section>` };
  },

  area(ctx, req) {
    const a = crud.bySlug('areas', req.params.slug); if (!a) return null;
    const name = ctx.tr(a, 'name'); const cats = crud.active('categories', { limit: 6 }); const near = crud.active('areas', { where: 'id<>?', args: [a.id], limit: 8 });
    const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('nav_areas'), url: '/areas' }, { label: name }];
    return { page: 'area', title: ctx.tr(a, 'seo_title') || `PVC Pipes in ${name}`, desc: ctx.tr(a, 'seo_desc') || `Agricultural, borewell, electrical and plumbing PVC pipes, fittings and water tanks delivered to ${name} by ${ctx.S.site_name}, Madurai.`, image: a.og_image || a.image, canonical: `/pvc-pipes-in-${a.slug}`, schema: [K.crumbSchema(ctx, items)],
      body: html`${K.pageHead(ctx, { title: `${ctx.t('products_in')} ${name}`, items })}<section class="section"><div class="container"><div class="layout-main"><div><div class="prose">${raw(ctx.tr(a, 'intro'))}</div><h2 style="margin-top:2rem">${ctx.t('product_categories')}</h2><div class="grid grid-3">${cats.map((c) => K.categoryCard(ctx, c))}</div></div>
      <aside class="sticky"><div class="panel"><h3>${ctx.t('get_quote')}</h3><p class="muted">${ctx.t('delivery')}: ${name}</p><a class="btn" style="width:100%" href="${ctx.u('/quote')}?location=${encodeURIComponent(name)}">${ctx.t('get_quote')}</a><p style="margin-top:1rem"><a href="${ctx.phoneHref(ctx.S.phone1)}">${icon('phone', 16)} ${ctx.S.phone1}</a></p></div><div class="panel" style="margin-top:1rem"><h3>${ctx.t('nearby_areas')}</h3><div class="chips">${near.map((n) => html`<a class="chip" href="${ctx.u('/pvc-pipes-in-' + n.slug)}">${ctx.tr(n, 'name')}</a>`)}</div></div></aside></div></div></section>` };
  },

  // Keyword landing page (Admin -> Keyword Landing Pages). Served at /<slug>; see pages.page() which falls back to this.
  landing(ctx, req) {
    const l = crud.bySlug('seo_pages', req.params.slug); if (!l) return null;
    const S = ctx.S;
    const tokens = { city: S.city, state: S.state, site_name: S.site_name, phone: S.phone1, established: S.established, brand: S.brand_short };
    const fill = (str, safe) => String(str || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k) => (k in tokens ? (safe ? esc(tokens[k]) : String(tokens[k] || '')) : m));
    const title = fill(ctx.tr(l, 'title'), false);
    const plain = (str) => fill(str, false).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const faqRows = (Array.isArray(l.faq) ? l.faq : []).filter((x) => x && x.k && x.v).map((x) => ({ question: fill(x.k, false), answer: esc(fill(x.v, false)), plain: fill(x.v, false) }));
    const cats = crud.active('categories', { limit: 6 }); const others = crud.active('seo_pages', { where: 'id<>? AND noindex=0', args: [l.id], limit: 8 });
    const areas = crud.active('areas', { limit: 8 });
    const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: title }];
    const intro = fill(ctx.tr(l, 'intro'), true); const body = fill(ctx.tr(l, 'body'), true);
    const desc = plain(ctx.tr(l, 'seo_desc')) || plain(ctx.tr(l, 'subtitle') || ctx.tr(l, 'intro')).slice(0, 160);
    const facts = [[ctx.t('established'), S.established], [ctx.t('address'), `${S.city}, ${S.state}`], [ctx.t('our_products'), `${cats.length}+ ${ctx.t('product_categories')}`], [ctx.t('delivery'), S.state]].filter((x) => x[1]);
    const schema = [K.crumbSchema(ctx, items), {
      '@context': 'https://schema.org', '@type': 'WebPage', name: title, description: desc, url: ctx.abs(`/${l.slug}`), inLanguage: ctx.lang === 'ta' ? 'ta-IN' : 'en-IN',
      about: { '@type': 'Organization', name: S.site_name }, isPartOf: { '@type': 'WebSite', name: S.site_name, url: ctx.abs('/') },
    }];
    if (faqRows.length) schema.push(K.faqSchema(ctx, faqRows.map((r) => ({ question: r.question, answer: r.plain }))));
    return { page: 'landing', title: fill(ctx.tr(l, 'seo_title'), false) || title, desc, image: l.og_image || l.image, canonical: `/${l.slug}`, noindex: !!l.noindex, schema,
      body: html`${K.pageHead(ctx, { title, items, sub: fill(ctx.tr(l, 'subtitle'), false) })}<section class="section"><div class="container"><div class="layout-main"><div>
        <div class="prose">${raw(intro)}</div>
        <div class="grid grid-4 facts" style="margin:1.5rem 0">${facts.map(([k, v]) => html`<div class="panel fact"><span class="muted">${k}</span><b>${v}</b></div>`)}</div>
        ${body ? html`<div class="prose">${raw(body)}</div>` : ''}
        <h2 style="margin-top:2rem">${ctx.t('product_categories')}</h2><div class="grid grid-3">${cats.map((c) => K.categoryCard(ctx, c))}</div>
        ${faqRows.length ? html`<h2 style="margin-top:2.2rem">${ctx.t('faq_title')}</h2>${K.faqList(ctx, faqRows)}` : ''}
        ${others.length ? html`<h2 style="margin-top:2.2rem">${ctx.t('popular_searches')}</h2><ul class="link-list">${others.map((o) => html`<li><a href="${ctx.u('/' + o.slug)}">${ctx.tr(o, 'title')}</a></li>`)}</ul>` : ''}
        ${areas.length ? html`<h2 style="margin-top:2.2rem">${ctx.t('service_areas')}</h2><ul class="link-list">${areas.map((a) => html`<li><a href="${ctx.u('/pvc-pipes-in-' + a.slug)}">${ctx.t('products_in')} ${ctx.tr(a, 'name')}</a></li>`)}</ul>` : ''}
      </div>
      <aside class="sticky"><div class="panel"><h3>${ctx.t('get_quote')}</h3><p class="muted">${S.site_name}</p><a class="btn" style="width:100%" href="${ctx.u('/quote')}">${ctx.t('get_quote')}</a>
        <p style="margin-top:1rem"><a href="${ctx.phoneHref(S.phone1)}">${icon('phone', 16)} ${S.phone1}</a></p>
        <p><a class="btn btn-wa" style="width:100%" href="${ctx.waLink()}" target="_blank" rel="noopener noreferrer">${icon('whatsapp', 18)} ${ctx.t('whatsapp_us')}</a></p></div></aside></div></div></section>` };
  },

  page(ctx, req) {
    const p = crud.bySlug('pages', req.params.slug); if (!p) return pages.landing(ctx, req);
    const title = ctx.tr(p, 'title'); const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: title }];
    return { page: 'page', title: ctx.tr(p, 'seo_title') || title, desc: ctx.tr(p, 'seo_desc') || String(ctx.tr(p, 'body')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160), image: p.og_image, canonical: `/${p.slug}`, noindex: !!p.noindex, schema: [K.crumbSchema(ctx, items)],
      body: html`${K.pageHead(ctx, { title, items })}<section class="section"><div class="container"><div class="prose" style="margin-inline:auto">${raw(ctx.tr(p, 'body'))}</div></div></section>${p.slug === 'about' ? html`<section class="section section--alt"><div class="container">${K.sectionHead('', ctx.t('meet_team'))}<div class="grid grid-4" style="justify-content:center">${crud.active('team').map((m) => html`<div class="card feature center"><div class="avatar" style="width:84px;height:84px;margin:0 auto 1rem;font-size:1.6rem">${m.photo ? img(m.photo, m.name, { w: 84, h: 84 }) : m.name.slice(0, 1)}</div><h3>${m.name}</h3><p>${ctx.tr(m, 'role')}</p></div>`)}</div></div></section>` : ''}` };
  },

  search(ctx, req) {
    const q = String(req.query.q || '').trim().slice(0, 80); const items = [{ label: ctx.t('nav_home'), url: '/' }, { label: ctx.t('search') }];
    const res = q.length < 2 ? { products: [], posts: [], faqs: [], pages: [] } : {
      products: crud.list('products', { q, per: 12, onlyActive: true }).rows, posts: crud.list('posts', { q, per: 6, onlyActive: true, filters: { status: 'published' } }).rows,
      faqs: crud.list('faqs', { q, per: 6, onlyActive: true }).rows, pages: crud.list('pages', { q, per: 6, onlyActive: true }).rows,
    };
    const none = !res.products.length && !res.posts.length && !res.faqs.length && !res.pages.length; const cm = catMap();
    return { page: 'search', title: `${ctx.t('search_results')}${q ? ': ' + q : ''}`, noindex: true, noAlternates: true, canonical: '/search', schema: [],
      body: html`${K.pageHead(ctx, { title: ctx.t('search_results'), items })}<section class="section"><div class="container"><form action="${ctx.u('/search')}" method="get" role="search" style="max-width:640px;margin-bottom:2rem"><input type="search" name="q" value="${q}" placeholder="${ctx.t('search_ph')}" autofocus maxlength="80"></form>
      ${q.length >= 2 && none ? html`<p class="empty">${ctx.t('no_results')}</p>` : ''}
      ${res.products.length ? html`<h2>${ctx.t('our_products')}</h2><div class="grid grid-3">${res.products.map((p) => K.productCard(ctx, p, cm[p.category_id]))}</div>` : ''}
      ${res.posts.length ? html`<h2 style="margin-top:2rem">${ctx.t('latest_news')}</h2><div class="grid grid-3">${res.posts.map((p) => K.postCard(ctx, p))}</div>` : ''}
      ${res.faqs.length ? html`<h2 style="margin-top:2rem">${ctx.t('faq_title')}</h2>${K.faqList(ctx, res.faqs)}` : ''}
      ${res.pages.length ? html`<h2 style="margin-top:2rem">${ctx.t('legal')}</h2><ul>${res.pages.map((p) => html`<li><a href="${ctx.u('/' + p.slug)}">${ctx.tr(p, 'title')}</a></li>`)}</ul>` : ''}</div></section>` };
  },

  notFound(ctx) {
    const pop = crud.active('categories', { limit: 4 });
    return { page: '404', title: ctx.t('page_not_found'), noindex: true, noAlternates: true, schema: [],
      body: html`<section class="notice-page"><div class="big">404</div><h1 style="font-size:2rem">${ctx.t('page_not_found')}</h1><p class="muted">${ctx.t('page_not_found_text')}</p><div class="hero-cta" style="justify-content:center"><a class="btn" href="${ctx.u('/')}">${ctx.t('back_home')}</a><a class="btn btn-outline" href="${ctx.u('/products')}">${ctx.t('nav_products')}</a></div><div class="chips" style="justify-content:center">${pop.map((c) => html`<a class="chip" href="${ctx.u('/products/category/' + c.slug)}">${ctx.tr(c, 'name')}</a>`)}</div></section>` };
  },

  maintenance(ctx) {
    return { page: 'maintenance', title: ctx.t('maintenance'), noindex: true, noAlternates: true, schema: [],
      body: html`<section class="notice-page"><div class="ico" style="font-size:3rem">🛠</div><h1 style="font-size:2rem">${ctx.t('maintenance')}</h1><p class="lead">${ctx.S.maintenance_message}</p><div class="hero-cta" style="justify-content:center"><a class="btn btn-lg" href="${ctx.phoneHref(ctx.S.phone1)}">${icon('phone', 18)} ${ctx.S.phone1}</a><a class="btn btn-lg btn-wa" href="${ctx.waLink()}" target="_blank" rel="noopener noreferrer">${icon('whatsapp', 18)} WhatsApp</a></div></section>` };
  },
};
module.exports = pages;
