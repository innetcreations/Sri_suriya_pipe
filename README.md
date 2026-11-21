# Sri Suriya Polymers – Business Web Application

A complete website **plus** admin panel for **SRI SURIYA PIPE(S)** (PVC pipe manufacturer & dealer, Kappalur, Madurai).

* **Public website** – Home (text hero, optional background video), About, Products + categories, Size Chart, Applications, Gallery, News, FAQ, Pipe Calculator, 3D Pipe Configurator, Quote Basket, Enquiry/Contact form, service-area pages, **7 keyword landing pages** for Google (e.g. “PVC pipes Madurai”), Privacy, Terms, Cookie policy. English + Tamil.
* **Admin panel** (`/admin`) – edit *everything*: products, pages, home sections, FAQs, gallery, menus, SEO, redirects, themes, festival calendar, users, backups, media library, **visitor statistics**, **login & devices**, **SEO Centre**, **Integrations**.
* **Look & feel** – 14 business themes + 9 festival themes that switch automatically on the right dates. **Only the admin changes themes** (the visitor theme icon is off by default; switch it on in Settings → Appearance if you ever want it). Subtle particles and sounds (sound off until the visitor turns it on).
* **Connected services** – **Supabase** (copy of all text data), **EmailJS** (enquiries to your Gmail), **Google Drive** (pictures/videos by link or direct upload), **Vercel + GitHub** (hosting), optional **Turso**, GA4 / Tag Manager / Clarity.
* **Security & speed** – strict Content-Security-Policy, hashed passwords, 2-factor login, rate limits, bot/scanner blocking, CSRF protection, page caching, multi-process mode, automated tests.

> **Start here:** [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) – the step-by-step guide to connect GitHub → Supabase → Vercel → EmailJS → Google Drive → your domain, and what is still left to do.
> Windows? Double-click **`suriya.bat`**. It runs, updates and checks everything with numbered menus.
> Using Google Antigravity? Copy-paste prompts are in [`ANTIGRAVITY_PROMPTS.md`](ANTIGRAVITY_PROMPTS.md).

---

## 1. Run it on your computer (5 minutes)

You need **Node.js 22 or newer** (https://nodejs.org → “LTS”). Check with `node -v`.

**Windows, easiest:** double-click `suriya.bat` → press **1** (first-time setup) → press **2** (start). Pick **O** in the menu to open the site. *(The launcher was written without a Windows machine to test on; if a menu item fails, send me the message it prints.)*

**Any system, by hand:**

```bash
cd sri-suriya-app
npm install              # 1–2 minutes
cp .env.example .env     # Windows: copy .env.example .env
npm start
```

Open **http://localhost:3000** (website) and **http://localhost:3000/admin** (admin panel).

On the **first start** the terminal prints the admin e-mail and password **once**. Copy them. You are asked to change the password at sign-in. (Prefer your own? Put `ADMIN_EMAIL` and `ADMIN_PASSWORD`, at least 12 characters, in `.env` before the first start.) Forgot it? `npm run reset-admin`.

| Command | What it does |
|---|---|
| `npm start` | run the site |
| `npm run dev` | run and restart when you edit code |
| `npm test` | all automated tests (about 1.5 minutes) |
| `npm run doctor` | plain-language health check of your setup |
| `npm run start:cluster` | several workers (live server with 2+ CPUs) |
| `npm run audit` | check libraries for known security problems |
| `node scripts/vercel-check.js` | “am I ready for Vercel?” |

---

## 2. First 30 minutes in the admin

The **Dashboard → Setup checklist** lists everything still showing placeholder text. Also open **System → Integrations** for the list of services to connect.

1. **Settings → Business & Branding** – logo, favicon, share image, **admin logo**.
2. **Settings → Contact & Location** – phone, WhatsApp, address, map, hours.
3. **Settings → Forms, Email & Spam** – your Gmail + the 4 EmailJS values → **Send test e-mail** (guide: [`docs/EMAILJS.md`](docs/EMAILJS.md)).
4. **Settings → Media & Storage** – where new uploads go (Automatic / Google Drive / this website’s files) and the Drive details ([`docs/GOOGLE_DRIVE.md`](docs/GOOGLE_DRIVE.md)).
5. **Settings → Content Options** – **home page background video or picture** (leave empty for the clean text hero) and **Settings → Appearance** for the dark layer strength and hero layout.
6. **Products / Categories** – real photos instead of the grey placeholders.
7. **Settings → SEO & Analytics** – Search Console code, Business Profile link, GA4 etc. Then open **SEO Centre**.
8. **My account → Two-factor authentication** – switch it on.

Good to know

* Every text field has a **தமிழ் (Tamil)** tab. The shipped Tamil is a first draft – **have a Tamil speaker review it**.
* There are **no fake reviews**. Statistics, certificates and years in the sample content are placeholders – replace them with real facts.
* Festival dates change yearly; verify them each January.

Roles: `viewer` (read) · `editor` (content) · `admin` (content + settings) · `superadmin` (everything, users, backups, Supabase buttons).

---

## 3. Pictures and videos: Google Drive or local files

Only the **web address (link) of each picture is saved in the database**. The picture itself lives in one of two places, and **you choose** in *Settings → Media & Storage → “Where should new uploads be stored?”*:

| Mode | Behaviour |
|---|---|
| **Automatic** (default) | Google Drive if connected, otherwise this website’s own files (`public/assets/uploads`). On Vercel (no disk) it uses Drive. |
| **Always Google Drive** | Uploads go to your Drive folder through your Apps Script. |
| **Always this website’s files** | Uploads are saved in the project’s assets folder. |

You can override it for a single upload in the Media library, or just **paste any public Drive link** into a picture field. Files you copy by hand into `public/assets/images`, `videos` or `brand` are listed under **Media library → Assets folder**.

---

## 4. Supabase, EmailJS, Vercel – the short version

* **Supabase** keeps a copy of all text data so Vercel / free hosts never lose your changes: run `docs/supabase/schema.sql` once, then set `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. Details, limits and security notes: [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) step 2.
  *Not copied: visitor statistics. On Vercel they restart with the server; use Turso or a host with a disk if you need long-lasting statistics.*
* **EmailJS** sends enquiries to your Gmail: [`docs/EMAILJS.md`](docs/EMAILJS.md).
* **Vercel** runs the site from your GitHub repository: [`docs/INTEGRATIONS.md`](docs/INTEGRATIONS.md) step 3.

> **What has and has not been tested.** The automated tests run the real code against *simulated* Supabase, EmailJS and Google Apps Script servers. The **real** Supabase, EmailJS, Vercel, Turso and Google accounts, the Windows launcher, and Docker have **not** been tested – they are yours to connect, and every step in the guides ends with a “How to check” line.

---

## 5. Visitor statistics and privacy

* A **cookie notice** appears on the first visit. Only after **Accept** are device type, OS, browser, country/city, pages, **time on each page** and new/returning recorded for you. Without consent only anonymous daily counters are kept (no IP address, no raw user-agent).
* See it all in **Admin → Visitors** (charts, recent visits, CSV) and **Admin → Login & devices** (every admin sign-in: time, device, browser, country; sign out other sessions).
* The site deliberately does **not** track visitors secretly. That would break the Indian DPDP Act 2023 and Google’s terms.

---

## 6. SEO

* Built in: titles/descriptions per page, canonical + hreflang (English/Tamil), Open Graph, JSON-LD (Organization, LocalBusiness, Product, FAQ, Breadcrumb), sitemap, robots.txt, 7 keyword landing pages, internal links, fast mobile pages, redirects manager.
* **SEO Centre** (admin): site checks, target-phrase checks, content audit, quick links to Google tools, and an on-page **inspector** for signed-in admins.
* Add any SEO plug-in or script you like: Search Console, GA4, Tag Manager, Clarity IDs have settings; browser extensions (SEOquake, Lighthouse) work on the live site.
* **Lab result** (Google Lighthouse, mobile, local server): **SEO 100** on Home, a keyword page, Products, Contact and the Tamil home; Best Practices 100; Accessibility 96–100; Performance 88–99. It is a *technical* score, **not** a Google ranking, and nobody can honestly promise “No. 1 on Google”. Rankings come from a Google Business Profile, reviews, backlinks and fresh content (see `docs/INTEGRATIONS.md` step 7).

---

## 7. Backups – do this!

Everything lives in `data/` (database) and the pictures folder. **Admin → Backup & restore** downloads a database snapshot and the content JSON. `suriya.bat` also makes a backup before every update. With Supabase connected you also have an online copy of the text data (not of your pictures).

---

## 8. Other ways to host

Vercel is the recommended path (see above). A host with a **permanent disk** works with local files only: Render (`render.yaml`), Railway/Fly.io (`Dockerfile`, mount a volume, `DATA_DIR=/data/db`, `UPLOAD_DIR=/data/uploads`), or a VPS:

```bash
npm ci --omit=dev
cp .env.example .env && nano .env      # NODE_ENV=production, SITE_URL, ALLOWED_HOSTS, TRUST_PROXY=1, ADMIN_*
sudo npm i -g pm2 && pm2 start cluster.js --name suriya && pm2 save && pm2 startup
```
Put Nginx in front with `proxy_pass http://127.0.0.1:3000;` and `sudo certbot --nginx -d your-domain`.
“Webspace”-style PHP hosting cannot run this app (it needs Node.js 22).

### Production checklist
- [ ] `NODE_ENV=production`, `SITE_URL=https://…`, `ALLOWED_HOSTS` = your domain(s), `TRUST_PROXY=1` behind a proxy
- [ ] `APP_SECRET` set (long random text, never changed) – **required on Vercel**
- [ ] Strong admin password + 2FA; consider a less guessable `ADMIN_PATH`
- [ ] A durable database: permanent disk, **Supabase** or **Turso**
- [ ] **Admin → Integrations**: everything you need is ✓
- [ ] Test enquiry arrives in Admin → Enquiries **and** in your Gmail
- [ ] `sitemap.xml` submitted in Search Console; “Hide whole site from search engines” is OFF
- [ ] Real photos, real phone numbers, Tamil reviewed
- [ ] Backup downloaded

If many real visitors share one public IP (school, office, mobile network), raise `RATE_LIMIT_MULTIPLIER` (1–50) in `.env`.

---

## 9. How it is built (for when you edit)

```
server.js              starts the app (also used by api/index.js on Vercel)
src/schema.js          ALL editable content types. Add a field here -> database column, admin form,
                       Tamil tab and validation appear automatically
src/settings_schema.js every setting shown under Admin -> Settings
src/themes.js          built-in themes + festival calendar (helper text is kept WCAG-readable)
src/views/             page templates (auto-escaped HTML, no inline scripts -> CSP-safe)
src/routes/            public.js, api.js, admin.js, admin2.js, admin3.js (visitors, devices, SEO, integrations)
src/supabase.js        Supabase copy of the text data      src/mailer.js   EmailJS + SMTP
src/media.js, drive.js uploads, Google Drive links          src/analytics.js  consent-based statistics
src/security.js        headers, rate limits, bot blocking   src/auth.js    passwords, sessions, 2FA
public/css, public/js  website + admin styles and behaviour
docs/                  INTEGRATIONS.md, EMAILJS.md, GOOGLE_DRIVE.md, supabase/schema.sql, drive/Code.gs
tests/                 automated tests (npm test)
suriya.bat             Windows control panel (see CHANGELOG.md for its version)
```

Rules that keep it secure – keep them when you (or an AI assistant) change code:
* No inline `<script>`, `<style>` blocks or `onclick=` – the CSP blocks them. Put code in `public/js`.
* Output text only through the `html` template tag (it escapes automatically).
* Never put a secret (Supabase secret key, EmailJS private key, `APP_SECRET`) in code, pages or GitHub.
* Run `npm test` after every change.

Changes by version: [`CHANGELOG.md`](CHANGELOG.md).
