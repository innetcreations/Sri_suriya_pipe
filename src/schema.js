'use strict';
// ─────────────────────────────────────────────────────────────────────────────
//  CONTENT MODEL REGISTRY
//  One definition here gives you: the database table, validation, the Admin list + edit forms,
//  Tamil translation inputs (tr:1), and CSV/JSON export. To add a field: add one line and restart.
//  Field types: text textarea html number bool select slug image images url email color date datetime
//               tags (comma list) kv ("Key: Value" lines) rel (id of another model) json
// ─────────────────────────────────────────────────────────────────────────────
const db = require('./db');

const f = (k, t, o = {}) => ({ k, t, ...o });
const SEO = [
  f('seo_title', 'text', { group: 'SEO', max: 80, tr: 1, help: 'Google title. ≈ 50–60 characters. Leave empty to use the name/title.' }),
  f('seo_desc', 'textarea', { group: 'SEO', max: 200, rows: 2, tr: 1, help: '≈ 150–160 characters shown under the title in Google.' }),
  f('og_image', 'image', { group: 'SEO', help: 'Share image (1200×630). Leave empty to use the main image.' }),
];
const themeOptions = () => db.prepare('SELECT slug,name FROM themes ORDER BY name').all().map((r) => [r.slug, r.name]);

const SECTION_TYPES = [
  ['hero', 'Hero (top banner)'], ['features', 'Feature cards'], ['stats', 'Numbers / stats strip'], ['categories', 'Product categories'],
  ['featured', 'Featured products'], ['about', 'About snapshot'], ['process', 'How it works (steps)'], ['applications', 'Applications'],
  ['configurator', '3D pipe configurator'], ['sizes', 'Size chart teaser'], ['testimonials', 'Testimonials'], ['gallery', 'Gallery'],
  ['areas', 'Service areas'], ['posts', 'Latest news'], ['faq', 'FAQ'], ['video', 'Video / media'], ['cta', 'Call-to-action band'],
  ['marquee', 'Trust badges ribbon'], ['certificates', 'Certificates'],
];

const MODELS = {
  categories: {
    label: 'Product Categories', singular: 'Category', group: 'Catalogue', icon: 'layers', title: 'name', sortable: true, slug: 'slug',
    fields: [
      f('name', 'text', { req: 1, tr: 1, list: 1, max: 100 }), f('slug', 'slug', { from: 'name', list: 1 }),
      f('summary', 'textarea', { tr: 1, max: 400, rows: 3 }), f('image', 'image', { list: 1 }),
      f('icon', 'text', { max: 30, help: 'Emoji or icon key (drop, bolt, leaf, tank, wrench, pipe).' }), ...SEO],
    search: ['name', 'summary'], public: 'category',
  },
  products: {
    label: 'Products', singular: 'Product', group: 'Catalogue', icon: 'box', title: 'name', sortable: true, slug: 'slug',
    fields: [
      f('name', 'text', { req: 1, tr: 1, list: 1, max: 140 }), f('slug', 'slug', { from: 'name' }),
      f('category_id', 'rel', { rel: 'categories', list: 1, req: 1, label: 'Category' }), f('image', 'image', { list: 1 }),
      f('badge', 'text', { tr: 1, max: 30, help: 'Small ribbon, e.g. “New”, “Best seller”.' }),
      f('summary', 'textarea', { tr: 1, max: 500, rows: 3 }), f('body', 'html', { tr: 1, help: 'Full description (rich text).' }),
      f('gallery', 'images', { help: 'One image URL per line.' }),
      f('sizes', 'tags', { help: 'Comma separated, e.g. 1/2", 3/4", 1"' }), f('colors', 'tags', { help: 'Comma separated, e.g. Blue, White, Grey' }),
      f('uses', 'tags', { tr: 1, help: 'Typical uses, comma separated.' }),
      f('specs', 'kv', { help: 'One per line:  Key: Value   (e.g. Pressure rating: PN 6)' }),
      f('featured', 'bool', { list: 1 }), ...SEO],
    search: ['name', 'summary'], public: 'product',
  },
  sizes: {
    label: 'Size Chart Rows', singular: 'Size row', group: 'Catalogue', icon: 'ruler', title: 'name', sortable: true,
    fields: [f('grp', 'text', { req: 1, tr: 1, list: 1, max: 100, help: 'Group heading, e.g. “Agriculture & High Pressure”.' }), f('name', 'text', { req: 1, tr: 1, list: 1, max: 100 }),
      f('sizes_text', 'text', { list: 1, max: 200 }), f('colors_text', 'text', { max: 200, tr: 1 }), f('uses', 'textarea', { tr: 1, max: 400, rows: 2 })],
    search: ['name', 'grp'],
  },
  applications: {
    label: 'Applications', singular: 'Application', group: 'Catalogue', icon: 'leaf', title: 'title', sortable: true, slug: 'slug',
    fields: [f('title', 'text', { req: 1, tr: 1, list: 1, max: 120 }), f('slug', 'slug', { from: 'title' }), f('summary', 'textarea', { tr: 1, max: 400, rows: 3 }),
      f('icon', 'text', { max: 30 }), f('image', 'image', { list: 1 }), f('body', 'html', { tr: 1 })],
    search: ['title', 'summary'],
  },

  sections: {
    label: 'Home Page Sections', singular: 'Section', group: 'Website', icon: 'layout', title: 'title', sortable: true,
    help: 'Drag (↑ ↓) to re-order the home page. Switch sections on/off. Each section type uses its own content list (Products, Testimonials…).',
    fields: [
      f('page', 'select', { options: [['home', 'Home page']], def: 'home', list: 1 }),
      f('type', 'select', { options: SECTION_TYPES, req: 1, list: 1 }),
      f('title', 'text', { tr: 1, list: 1, max: 160 }), f('subtitle', 'text', { tr: 1, max: 400 }),
      f('body', 'textarea', { tr: 1, max: 3000, rows: 4 }), f('image', 'image'),
      f('btn_label', 'text', { tr: 1, max: 60 }), f('btn_url', 'url'), f('btn2_label', 'text', { tr: 1, max: 60 }), f('btn2_url', 'url'),
      f('bg', 'select', { options: [['default', 'Default'], ['alt', 'Soft tint'], ['dark', 'Dark'], ['brand', 'Brand colour']], def: 'default' }),
      f('extra', 'json', { help: 'Advanced options (JSON), e.g. {"limit":6}.' })],
  },
  features: {
    label: 'Feature Cards', singular: 'Feature', group: 'Website', icon: 'star', title: 'title', sortable: true,
    fields: [f('title', 'text', { req: 1, tr: 1, list: 1, max: 100 }), f('text', 'textarea', { tr: 1, max: 300, rows: 2 }), f('icon', 'text', { max: 30, help: 'drop, shield, ruler, truck, bolt, leaf, tank, star, check, factory, flask, users' })],
  },
  stats: {
    label: 'Stats / Numbers', singular: 'Stat', group: 'Website', icon: 'chart', title: 'label', sortable: true,
    fields: [f('label', 'text', { req: 1, tr: 1, list: 1, max: 80 }), f('value', 'number', { list: 1 }), f('suffix', 'text', { max: 10, list: 1 }), f('icon', 'text', { max: 30 })],
  },
  process_steps: {
    label: 'How-it-works Steps', singular: 'Step', group: 'Website', icon: 'steps', title: 'title', sortable: true,
    fields: [f('title', 'text', { req: 1, tr: 1, list: 1, max: 100 }), f('text', 'textarea', { tr: 1, max: 300, rows: 2 }), f('icon', 'text', { max: 30 })],
  },
  testimonials: {
    label: 'Testimonials', singular: 'Testimonial', group: 'Website', icon: 'quote', title: 'name', sortable: true,
    fields: [f('name', 'text', { req: 1, list: 1, max: 80 }), f('role', 'text', { tr: 1, max: 80, list: 1 }), f('location', 'text', { max: 80 }),
      f('text', 'textarea', { req: 1, tr: 1, max: 600, rows: 4 }), f('rating', 'number', { min: 1, max: 5, def: 5, list: 1 }), f('avatar', 'image')],
  },
  faqs: {
    label: 'FAQs', singular: 'FAQ', group: 'Website', icon: 'help', title: 'question', sortable: true,
    help: 'These also power the chat assistant. Add “keywords” (comma separated) to help it match visitor questions.',
    fields: [f('question', 'text', { req: 1, tr: 1, list: 1, max: 250 }), f('answer', 'html', { req: 1, tr: 1 }), f('category', 'text', { max: 60, list: 1 }), f('keywords', 'tags', { help: 'Words customers might type.' })],
    search: ['question', 'answer'],
  },
  gallery: {
    label: 'Gallery', singular: 'Photo', group: 'Website', icon: 'image', title: 'title', sortable: true,
    fields: [f('title', 'text', { req: 1, tr: 1, list: 1, max: 120 }), f('image', 'image', { req: 1, list: 1 }),
      f('category', 'select', { options: [['Factory', 'Factory'], ['Products', 'Products'], ['Farm & Field', 'Farm & Field'], ['Delivery', 'Delivery'], ['Other', 'Other']], def: 'Products', list: 1 }), f('caption', 'text', { tr: 1, max: 200 })],
  },
  team: {
    label: 'Team', singular: 'Team member', group: 'Website', icon: 'users', title: 'name', sortable: true,
    fields: [f('name', 'text', { req: 1, list: 1, max: 80 }), f('role', 'text', { tr: 1, list: 1, max: 80 }), f('photo', 'image', { list: 1 }), f('bio', 'textarea', { tr: 1, max: 500, rows: 3 })],
  },
  certificates: {
    label: 'Certificates & Approvals', singular: 'Certificate', group: 'Website', icon: 'badge', title: 'title', sortable: true,
    fields: [f('title', 'text', { req: 1, tr: 1, list: 1, max: 120 }), f('issuer', 'text', { max: 120, list: 1 }), f('number', 'text', { max: 60 }), f('image', 'image'), f('valid_till', 'date')],
  },
  nav_items: {
    label: 'Navigation Menu', singular: 'Menu item', group: 'Website', icon: 'menu', title: 'label', sortable: true,
    fields: [f('label', 'text', { req: 1, tr: 1, list: 1, max: 60 }), f('url', 'url', { req: 1, list: 1, help: 'Use /products or a full https:// link.' }),
      f('location', 'select', { options: [['header', 'Header'], ['footer', 'Footer'], ['both', 'Header + Footer']], def: 'both', list: 1 }), f('new_tab', 'bool')],
  },
  announcements: {
    label: 'Announcement Bar', singular: 'Announcement', group: 'Website', icon: 'megaphone', title: 'text', sortable: true,
    fields: [f('text', 'text', { req: 1, tr: 1, list: 1, max: 220 }), f('link', 'url'), f('link_label', 'text', { tr: 1, max: 40 }),
      f('start_at', 'datetime', { help: 'Optional. Leave empty to start immediately.' }), f('end_at', 'datetime', { help: 'Optional.' }), f('dismissible', 'bool', { def: 1 })],
  },

  posts: {
    label: 'News & Articles', singular: 'Article', group: 'Pages & SEO', icon: 'news', title: 'title', slug: 'slug', public: 'blog',
    fields: [f('title', 'text', { req: 1, tr: 1, list: 1, max: 160 }), f('slug', 'slug', { from: 'title' }),
      f('status', 'select', { options: [['published', 'Published'], ['draft', 'Draft']], def: 'published', list: 1 }), f('published_at', 'datetime', { list: 1 }),
      f('cover', 'image', { list: 1 }), f('excerpt', 'textarea', { tr: 1, max: 400, rows: 3 }), f('body', 'html', { tr: 1 }),
      f('author', 'text', { max: 80 }), f('tags', 'tags'), ...SEO],
    search: ['title', 'excerpt'], order: 'published_at DESC, id DESC',
  },
  pages: {
    label: 'Custom Pages', singular: 'Page', group: 'Pages & SEO', icon: 'file', title: 'title', slug: 'slug', public: 'page',
    help: 'Create any extra page (Privacy, Terms, Dealership…). It is served at /your-slug.',
    fields: [f('title', 'text', { req: 1, tr: 1, list: 1, max: 160 }), f('slug', 'slug', { from: 'title', req: 1, list: 1 }), f('body', 'html', { tr: 1 }),
      f('in_footer', 'bool', { def: 1, list: 1 }), f('noindex', 'bool'), ...SEO],
    search: ['title', 'body'],
  },
  seo_pages: {
    label: 'Keyword Landing Pages', singular: 'Landing page', group: 'Pages & SEO', icon: 'search', title: 'title', slug: 'slug', sortable: true, public: 'landing',
    help: 'One page for each phrase people type into Google (e.g. “PVC pipe manufacturer in Madurai”). The page is served at /your-slug, added to the sitemap and linked from the footer. Write for people first: answer the question honestly, add real facts, then add the phrase naturally. In the text you can use {{city}}, {{state}}, {{site_name}}, {{phone}} and {{established}} – they are filled from Settings.',
    fields: [f('title', 'text', { req: 1, tr: 1, list: 1, max: 160, help: 'The main heading (H1) of the page.' }), f('slug', 'slug', { from: 'title', req: 1, list: 1 }),
      f('keyword', 'text', { list: 1, max: 120, help: 'The exact phrase this page is meant to rank for, e.g. “pvc pipe manufacturer in india”. Used by Admin → SEO Centre.' }),
      f('subtitle', 'textarea', { tr: 1, rows: 2, max: 300 }), f('intro', 'html', { tr: 1, help: 'First paragraph(s): answer the search question directly.' }), f('body', 'html', { tr: 1 }),
      f('faq', 'kv', { help: 'Questions people ask, one per line:  Question: Answer   (shown on the page and sent to Google as FAQ rich results).' }),
      f('image', 'image'), f('in_footer', 'bool', { def: 1, list: 1 }), f('noindex', 'bool'), ...SEO],
    search: ['title', 'keyword', 'body'],
  },
  areas: {
    label: 'Service Areas (local SEO)', singular: 'Area', group: 'Pages & SEO', icon: 'pin', title: 'name', slug: 'slug', sortable: true, public: 'area',
    help: 'Each area gets its own page: /pvc-pipes-in-<slug>. Edit the text so every page has genuinely useful, unique content.',
    fields: [f('name', 'text', { req: 1, tr: 1, list: 1, max: 100 }), f('slug', 'slug', { from: 'name', list: 1 }), f('intro', 'html', { tr: 1 }), f('image', 'image'), ...SEO],
    search: ['name'],
  },
  redirects: {
    label: 'Redirects (301/302)', singular: 'Redirect', group: 'Pages & SEO', icon: 'redirect', title: 'from_path',
    fields: [f('from_path', 'text', { req: 1, list: 1, max: 300, help: 'Old path, e.g. /old-page' }), f('to_path', 'url', { req: 1, list: 1, help: 'New path or full URL.' }),
      f('code', 'select', { options: [['301', '301 Permanent'], ['302', '302 Temporary']], def: '301', list: 1 }), f('hits', 'number', { readonly: 1, list: 1 })],
  },
  events: {
    label: 'Festival / Event Themes', singular: 'Event', group: 'Appearance', icon: 'calendar', title: 'name',
    help: 'The site theme switches automatically between start and end date. Use MM-DD (e.g. 10-28) to repeat every year, or YYYY-MM-DD for a one-off date (movable festivals such as Diwali — verify the date each year).',
    fields: [f('name', 'text', { req: 1, list: 1, max: 80 }), f('theme_slug', 'select', { options: themeOptions, req: 1, list: 1 }),
      f('start_date', 'text', { req: 1, list: 1, max: 10, pattern: '^(\\d{4}-)?\\d{2}-\\d{2}$' }), f('end_date', 'text', { req: 1, list: 1, max: 10, pattern: '^(\\d{4}-)?\\d{2}-\\d{2}$' }),
      f('priority', 'number', { def: 0, list: 1 }), f('greeting', 'text', { tr: 1, max: 200, help: 'Banner text shown during the event, e.g. “Happy Diwali from Sri Suriya Polymers!”' })],
  },
};

const GROUP_ORDER = ['Catalogue', 'Website', 'Pages & SEO', 'Appearance'];
const modelList = () => Object.entries(MODELS).map(([key, m]) => ({ key, ...m }));
module.exports = { MODELS, GROUP_ORDER, modelList, SECTION_TYPES };
