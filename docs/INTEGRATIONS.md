# Integrations guide: what is connected, what is still to do, and how

This is the one page to follow when you take the website from "works on my computer" to "live on the internet without errors".
The same list is shown inside the admin: **Admin → System → Integrations** (○ = still to do, ✓ = connected).

> **Honest status.** Everything below has been written and tested **with simulated services** (a fake Supabase, a fake EmailJS, a fake Google Apps Script). The real Supabase, EmailJS, Vercel and Google accounts are yours, so they could **not** be tested from here. Each step ends with a "How to check" line. If a check fails, copy the message and use prompt B12 in `ANTIGRAVITY_PROMPTS.md`.

---

## The big picture (read this once)

| What | Where it lives | Why |
|---|---|---|
| **Text data** (pages, products, prices, settings, themes, users, enquiries) | A SQLite file **+ a copy in Supabase** | Vercel and free web hosts forget files, so Supabase keeps the copy and the site reloads it on start. |
| **Pictures & videos** | **Google Drive** (public links) or the project's `public/assets` folder | The database only stores the **web address (link)** of each picture, as text. |
| **E-mail for enquiries** | **EmailJS → your Gmail** | Your website sends the enquiry to EmailJS, EmailJS e-mails your Gmail. Keys stay on the server. |
| **Website code** | **GitHub → Vercel** | Every `git push` redeploys the site. |

Where new pictures are stored is your choice, any time: **Admin → Settings → Media & Storage → "Where should new uploads be stored?"**

* **Automatic** (default): Google Drive if it is connected, otherwise this website's own files.
* **Always Google Drive** / **Always this website's files**.
* You can also override it for one upload with the drop-down in the **Media library**.

Because only links are saved, you can switch later without breaking old pictures.

**In two or three months** (when you move to your own "IN NET" database): the data is portable. *Admin → Backup & restore* downloads everything, and the Supabase copy is plain JSON. Ask Antigravity with prompt B13 to plan the new database layer. Only `src/db.js` and `src/supabase.js` need to change.

---

## Order of work (do them in this order)

1. GitHub (put the code online)
2. Supabase (the text database)
3. Vercel (host the website)
4. EmailJS (enquiry e-mails)
5. Google Drive (pictures and videos)
6. Your domain name + https
7. Google Search Console + Google Business Profile (this is what really moves you up in Google)
8. Final checks

---

## 1. GitHub

1. Create a free account at https://github.com and a new **private** repository (for example `sri-suriya-app`).
2. In the project folder, in a terminal:
   ```bash
   git init
   git add .
   git commit -m "Sri Suriya website"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/sri-suriya-app.git
   git push -u origin main
   ```
3. The `.gitignore` already keeps `.env`, `data/` and `node_modules/` out of GitHub. **Never commit `.env`.**
4. Pictures you copy into `public/assets/images`, `videos` or `brand` **are** committed, so they go live with the site.

**How to check:** open the repository on github.com. You should **not** see a `.env` file.

---

## 2. Supabase (text database)

1. Sign up at https://supabase.com → **New project** (choose a region close to India, for example Mumbai if offered). Save the database password somewhere safe. The website does not use it.
2. Open **SQL Editor → New query**. Paste everything from `docs/supabase/schema.sql` → **Run**. This creates one table, `ssp_state`, with **Row Level Security ON and no public access**.
3. Open **Project Settings → API** (or **API Keys**). Copy:
   * **Project URL**, for example `https://abcdxyz.supabase.co` → this is `SUPABASE_URL`
   * the **secret** key (older projects call it **service_role**) → this is `SUPABASE_SERVICE_KEY`
   * ⚠️ **Not** the "publishable" / "anon" key. That one cannot save data.
4. **On your computer:** put both lines in the `.env` file, then restart the site.
5. **On Vercel:** add the same two lines under *Settings → Environment Variables* (step 3 below).

**How to check:** start the site and look at the console for `[supabase] connected`. Then open **Admin → Integrations → Test connection**. In Supabase **Table Editor → ssp_state** you should see one row, `main`.

**How it behaves**

* After every admin save and every new enquiry, the whole content is saved to that row. On a fresh Vercel start the site first loads that row, **before** it creates any default content.
* Admin pages check for newer data from other servers (at most every ~1.5 s). Public pages check every few seconds.
* **If two admins save within about a second on different servers, the later save wins.** For a small business with one or two editors this is fine.
* If Supabase is down, the site keeps working from its local copy. It tells you in **Admin → Integrations**, and it will **never overwrite** the real copy with default content.
* **Not copied:** visitor statistics (they change on every visit). On Vercel, statistics therefore restart whenever the server restarts. If you need long-lasting statistics, run the site on a host with a permanent disk, or use Turso (see below).
* **Security:** the Supabase copy contains your admin password *hashes* and encrypted secrets (they are encrypted with `APP_SECRET`). Keep the secret key private and keep Row Level Security ON.

**Using Turso instead (optional, more robust on Vercel):** if `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` are set, the site uses the Turso cloud database directly, with no copy step, and statistics also last. Only one of the two (Supabase or Turso) is needed.

---

## 3. Vercel

1. Sign up at https://vercel.com with your GitHub account → **Add New → Project** → import the repository.
2. **Framework preset: Other.** Leave the build command empty.
3. **Settings → Environment Variables** (for **Production**):

   | Name | Value |
   |---|---|
   | `APP_SECRET` | the value from your local `.env` (a long random text). **Must never change**, or saved secrets stop working. |
   | `SUPABASE_URL` | from step 2 |
   | `SUPABASE_SERVICE_KEY` | from step 2 (secret key) |
   | `ADMIN_EMAIL` | the e-mail you will sign in with (used on the first start only) |
   | `ADMIN_PASSWORD` | at least 12 characters (first start only; change it after signing in) |
   | `SITE_URL` | `https://your-domain.com`, once the domain is added |
   | `ALLOWED_HOSTS` | `your-domain.com,www.your-domain.com` |

4. **Deploy.** Open `https://your-project.vercel.app/admin` and sign in.
5. Run `node scripts/vercel-check.js` (or option 14 in `suriya.bat`) *before* deploying. It lists what is missing.

**Things that go wrong on Vercel, and the fix**

| Symptom | Cause | Fix |
|---|---|---|
| "The website is starting…" page | `APP_SECRET` missing | Add it in Environment Variables and redeploy. |
| Changes disappear after a while | no cloud database | Connect Supabase (or Turso). The dashboard shows a warning until you do. |
| Upload says "cannot store files" | Vercel's disk is read-only | Use Google Drive (step 5), or copy the picture into `public/assets/images` and push to GitHub. |
| Request too large | Vercel limits a request to about 4.5 MB | Upload big videos to Google Drive and paste the link. |
| Admin signs you out now and then | `APP_SECRET` changed between deploys | Keep it the same. |

---

## 4. EmailJS (enquiry e-mails)

Full step-by-step is in **`docs/EMAILJS.md`**. In short:

1. Create the account, add your Gmail as an **Email Service**, create a **Template**.
2. In the admin: **Settings → Forms, Email & Spam**. Fill **Send new enquiries to**, **Service ID**, **Template ID**, **Public Key**, **Private Key** → Save.
3. Press **Send test e-mail**.

**How to check:** the test e-mail arrives (look in Spam too). Then send a real enquiry from the website's contact form.

> ⚠️ Not confirmed: EmailJS may refuse calls that do not come from a browser unless you switch on **"Allow EmailJS API for non-browser applications"** in your EmailJS account (Account → Security). If **Send test e-mail** shows an error such as *403*, look for that switch.

---

## 5. Google Drive (pictures and videos)

Two ways. You can use both.

**A. Paste links (works immediately, nothing to install).** In Drive: right-click the file → **Share → Anyone with the link → Viewer → Copy link**. In the admin: **Media library → Add by link** (or paste the link into any picture field). The site converts it automatically.

**B. Upload straight from the admin into your Drive folder (5-minute setup).** Follow `docs/GOOGLE_DRIVE.md` (a small Google Apps Script that you deploy once). Then fill **Settings → Media & Storage** (script address + secret key).

Tips: keep each photo under about 300 KB (WebP or JPG). For the **home page background video**, put an MP4 under 10 MB in `public/assets/videos/hero.mp4`, commit it, and paste `/assets/videos/hero.mp4` in **Settings → Content Options → Hero background video**. Google Drive is not reliable for streaming large background videos.

---

## 6. Domain name and https

1. Buy a domain (for example `srisuriyapolymers.in`).
2. Vercel → your project → **Settings → Domains → Add**. Vercel shows the DNS records to create at your domain seller. https is automatic.
3. Set `SITE_URL=https://your-domain` and `ALLOWED_HOSTS` in Vercel, then redeploy.

**How to check:** `https://your-domain/sitemap.xml` opens and lists your pages with your domain.

---

## 7. Google Search Console and Google Business Profile

These matter more for "pvc pipes madurai" searches than any code can.

1. https://search.google.com/search-console → add your site → choose **HTML tag** verification → paste the code into **Admin → Settings → SEO & Analytics → Google verification** → Verify → **Sitemaps → submit `sitemap.xml`**.
2. https://business.google.com → create your free profile for the factory (Kappalur, Madurai). Verify it. Paste its link in the same SEO settings.
3. List the business on IndiaMART, Justdial, LinkedIn, Facebook, YouTube and paste the links under "Other profiles".
4. Optional extras (only load after the visitor accepts cookies): Google Analytics 4, Tag Manager, Microsoft Clarity → IDs go in the same settings page.
5. Add other SEO plug-ins any time: browser extensions (SEOquake, Lighthouse in Chrome DevTools, "Detailed SEO"), Google tools, or paste any script ID into the settings above. The built-in **SEO Centre** (admin) shows your site checks, the 7 keyword pages, and a content audit. Pressing the **SEO inspector** button as a signed-in admin shows the checks on any page.

**What the SEO score means.** In our lab test with Google Lighthouse the SEO score is **100 on the home page, a keyword page, Products, Contact and the Tamil home**. Lighthouse checks the technical basics (titles, descriptions, links, mobile view, structured data). It is **not** a Google ranking. Nobody can honestly promise "No. 1 on Google". Ranking for "best PVC pipe manufacturer" comes from real reviews, a Business Profile, backlinks and fresh content. The site gives you the technical base and tells you what is missing.

---

## 8. Final checks before you announce the site

- [ ] Admin password changed, **2-factor login ON** (My account)
- [ ] Dashboard → Setup checklist has no placeholders left
- [ ] **Integrations** page: every line you care about shows ✓
- [ ] Send a test enquiry. It appears in **Admin → Enquiries** and arrives by e-mail
- [ ] Change one text in the admin → reload the public page → change is visible (and in Supabase after a few seconds)
- [ ] `https://your-domain/robots.txt` and `/sitemap.xml` open
- [ ] "Hide whole site from search engines" is **OFF**
- [ ] Real phone numbers, address, photos; Tamil text reviewed by a Tamil speaker
- [ ] A fresh backup downloaded (Admin → Backup & restore)

---

## Visitor information: what the site collects (and why not "secretly")

You asked for as much visitor information as possible, **without the visitor knowing**. The website does **not** do that, on purpose: hidden tracking breaks India's Digital Personal Data Protection Act, 2023 (notice and consent are required), Google Analytics' own terms, and it can get the site or the Google ad/analytics accounts blocked. It would also put your customers' trust at risk.

What it does instead is **transparent and still very useful**:

* A cookie notice on the first visit. Only after the visitor presses **Accept** does it record, **for the admin**: device type, operating system, browser, country/city (from the host's headers), pages viewed, **time spent per page**, new vs returning visitor.
* Without consent, only anonymous daily counters are kept (page views, unique visitors via a daily-changing hash, device kinds). No IP address or raw user-agent text is stored.
* **Admin → Visitors** shows all of this, with charts, recent visits and a CSV export.
* **Admin → Login & devices** shows every admin sign-in (time, device, browser, country) and lets you sign out other sessions. Public visitors have no accounts, so there is no "visitor login ID".
* Everything is described in the Cookie policy page that the site publishes (`/cookie-policy`).

---

## What is still to connect (summary)

| # | Item | Needed for | Where |
|---|---|---|---|
| 1 | GitHub repository | deploy | step 1 |
| 2 | Supabase project + 2 env vars | durable text data | step 2 |
| 3 | Vercel project + env vars | hosting | step 3 |
| 4 | EmailJS service, template, 4 values | enquiry e-mails | `docs/EMAILJS.md` |
| 5 | Google Drive folder (+ optional Apps Script) | pictures | `docs/GOOGLE_DRIVE.md` |
| 6 | Domain name | professional address | step 6 |
| 7 | Search Console + Business Profile | Google ranking | step 7 |
| 8 | Real content, photos, Tamil review | trust | Dashboard checklist |
| 9 | Hero background video (optional) | home page look | Settings → Content Options |

## "Webspace" / Hostinger style hosting

This app is a **Node.js 22** program. Ordinary PHP/"webspace" hosting cannot run it. Check that your plan supports **Node.js 22 web apps** (some Hostinger plans do; check the plan page), or use a small VPS, or Vercel. On a host with a permanent disk the site works with local files alone (no Supabase needed): upload the project, run `npm ci --omit=dev`, `npm start`, and uploads are stored in `public/assets/uploads` automatically (the "Automatic" storage mode picks local files when Drive is not connected).
