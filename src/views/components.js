'use strict';
const { html, raw, esc, icon, img, ph } = require('../render');
const { fmtDate } = require('../util');

const crumbs = (ctx, items) => html`<nav class="crumbs" aria-label="${ctx.t('breadcrumb')}"><ol>${items.map((c, i) => html`<li>${c.url && i < items.length - 1 ? html`<a href="${ctx.u(c.url)}">${c.label}</a>` : html`<span aria-current="page">${c.label}</span>`}</li>`)}</ol></nav>`;
const crumbSchema = (ctx, items) => ({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.label, item: ctx.abs(ctx.u(c.url || ctx.path)) })) });

const pageHead = (ctx, { title, sub, items, tag = 'h1' }) => html`<section class="page-head"><div class="container">${items ? crumbs(ctx, items) : ''}<${raw(tag)} data-reveal>${title}</${raw(tag)}>${sub ? html`<p>${sub}</p>` : ''}</div></section>`;

const sectionHead = (eyebrow, title, sub, left = false) => html`<div class="section-head${left ? ' left' : ''}" data-reveal>${eyebrow ? html`<span class="eyebrow">${eyebrow}</span>` : ''}${title ? html`<h2>${title}</h2>` : ''}${sub ? html`<p class="lead">${sub}</p>` : ''}</div>`;

function productCard(ctx, p, cat) {
  const name = ctx.tr(p, 'name');
  const url = ctx.u(`/products/${p.slug}`);
  return html`<article class="card" data-reveal>
    <a class="card-media" href="${url}" tabindex="-1" aria-hidden="true">${img(p.image, name, { w: 640, h: 480, label: name })}${p.badge || ctx.tr(p, 'badge') ? html`<span class="badge">${ctx.tr(p, 'badge')}</span>` : ''}</a>
    <div class="card-body">${cat ? html`<span class="tag">${ctx.tr(cat, 'name')}</span>` : ''}<h3><a href="${url}" style="color:inherit">${name}</a></h3><p>${ctx.tr(p, 'summary')}</p></div>
    <div class="card-actions"><a class="btn btn-outline btn-sm" href="${url}">${ctx.t('view_details')}</a><button class="btn btn-sm" type="button" data-add-quote data-id="${p.id}" data-name="${name}" data-sound="add">${icon('plus', 16)} ${ctx.t('add_to_quote')}</button></div>
  </article>`;
}
function categoryCard(ctx, c, count) {
  const name = ctx.tr(c, 'name');
  return html`<a class="card" href="${ctx.u('/products/category/' + c.slug)}" data-reveal data-tilt data-tilt-max="5">
    <div class="card-media">${img(c.image, name, { w: 640, h: 480, label: name })}</div>
    <div class="card-body"><h3>${name}</h3><p>${ctx.tr(c, 'summary')}</p>${count != null ? html`<p style="margin-top:.6rem"><span class="badge">${count} ${count === 1 ? 'product' : 'products'}</span></p>` : ''}</div></a>`;
}
function postCard(ctx, p) {
  const title = ctx.tr(p, 'title'); const url = ctx.u(`/blog/${p.slug}`);
  return html`<article class="card post-card" data-reveal><a class="card-media" href="${url}" tabindex="-1" aria-hidden="true">${img(p.cover, title, { w: 640, h: 400, label: title })}</a>
    <div class="card-body"><div class="meta"><time datetime="${p.published_at}">${fmtDate(p.published_at, ctx.lang)}</time></div><h3><a href="${url}" style="color:inherit">${title}</a></h3><p>${ctx.tr(p, 'excerpt')}</p></div>
    <div class="card-actions"><a class="btn btn-ghost btn-sm" href="${url}">${ctx.t('read_more')} ${icon('arrow', 16)}</a></div></article>`;
}
const faqList = (ctx, rows) => html`<div class="faq">${rows.map((f) => html`<details><summary>${ctx.tr(f, 'question')}</summary><div class="ans">${raw(ctx.tr(f, 'answer'))}</div></details>`)}</div>`;
const faqSchema = (ctx, rows) => ({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: rows.map((f) => ({ '@type': 'Question', name: ctx.tr(f, 'question'), acceptedAnswer: { '@type': 'Answer', text: String(ctx.tr(f, 'answer')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() } })) });
const stars = (n) => '★★★★★☆☆☆☆☆'.slice(5 - Math.max(0, Math.min(5, Math.round(n || 5))), 10 - Math.max(0, Math.min(5, Math.round(n || 5))));

// Specification table split by group heading (size chart)
function sizeTable(ctx, rows) {
  let last = null;
  return html`<div class="table-wrap" data-reveal><table><thead><tr><th>${ctx.t('col_category')}</th><th>${ctx.t('col_sizes')}</th><th>${ctx.t('col_colors')}</th><th>${ctx.t('col_uses')}</th></tr></thead><tbody>
  ${rows.map((r) => { const g = ctx.tr(r, 'grp'); const head = g !== last ? html`<tr class="group-row"><td colspan="4">${g}</td></tr>` : ''; last = g; return html`${head}<tr><td><strong>${ctx.tr(r, 'name')}</strong></td><td>${r.sizes_text}</td><td>${ctx.tr(r, 'colors_text')}</td><td>${ctx.tr(r, 'uses')}</td></tr>`; })}
  </tbody></table></div>`;
}
const pagination = (ctx, base, page, pages) => pages <= 1 ? '' : html`<nav class="pagination" aria-label="Pagination">${page > 1 ? html`<a href="${ctx.u(base)}${base.includes('?') ? '&' : '?'}page=${page - 1}" rel="prev">‹ ${ctx.t('prev')}</a>` : ''}${Array.from({ length: pages }, (_, i) => i + 1).map((n) => n === page ? html`<span class="cur" aria-current="page">${n}</span>` : html`<a href="${ctx.u(base)}${base.includes('?') ? '&' : '?'}page=${n}">${n}</a>`)}${page < pages ? html`<a href="${ctx.u(base)}${base.includes('?') ? '&' : '?'}page=${page + 1}" rel="next">${ctx.t('next')} ›</a>` : ''}</nav>`;

module.exports = { crumbs, crumbSchema, pageHead, sectionHead, productCard, categoryCard, postCard, faqList, faqSchema, stars, sizeTable, pagination };
