# Prompts for Google Antigravity

How to use: open the project folder in Antigravity, start a **new chat** for each task, paste **Prompt 0** first (once per chat), then the task prompt.
Always finish a task with: **"Run `npm test` and show me the result."** (every test must pass).

**Your installed skills and slash commands, and where to use them**

| Use this | When |
|---|---|
| `/plan` | **Before** any prompt that touches more than one file (deploy, database, new feature). Let it list the steps, then say "go". |
| `/grill-me` | When you are not sure what you want (for example "what should the hero video show?"). It asks you questions first. |
| `/learn` | After a task: "explain what you just did so I can learn it". |
| `/ralph-loop` | For "keep going until it passes" jobs: fixing failing tests, clearing every Lighthouse warning. |
| `agency-*` agents | Pick the one that fits: a **security** agent for prompt A8, a **devops / deployment** agent for A1-A3, an **SEO** agent for B6. |
| `design-taste-frontend`, `minimalist-ui` | Look and feel of pages (B4). Keep it a professional business site. |
| `brandkit` | Logo, colours, favicon, share image (also upload them in Admin → Settings). |
| `imagegen-frontend-web` | Make product / hero pictures. Save them in `public/assets/images` and paste the path in the admin. |

**Files you should tell Antigravity NOT to edit unless you ask:** `src/security.js`, `src/auth.js`, `src/supabase.js`, `src/mailer.js`, `src/media.js`, `src/db.js`, `server.js`, `api/index.js`, `vercel.json`, everything in `tests/`, and `.env` (never paste its contents into a chat).
Content, text and pictures are edited in the **admin panel**, not in code.

---

## Prompt 0 - teach the assistant this project (paste first)

```
You are a senior full-stack engineer working on "Sri Suriya Polymers", a business website + admin CMS
for a PVC pipe manufacturer in Madurai, India. Read README.md and docs/INTEGRATIONS.md first, then
src/schema.js, src/settings_schema.js and src/security.js.

Project rules you must follow:
1. Stack: Node 22, Express 4, SQLite (better-sqlite3) with an optional Supabase copy (src/supabase.js) or
   Turso, server-rendered HTML, vanilla JS. Do NOT add a front-end framework.
2. Security: the Content-Security-Policy forbids inline <script>, <style> blocks and onclick= handlers.
   Put JavaScript in public/js and styles in public/css. Render text only through the `html` template tag
   (it auto-escapes). Never weaken src/security.js, auth, CSRF, rate limits or upload checks.
3. Content is defined in src/schema.js. Adding a field there automatically creates the database column,
   the admin form, the Tamil (ta__) field and the validation - use that instead of hand-written forms.
4. Every visitor-facing text needs English and Tamil (ta__ field or src/i18n.js).
5. It is a business site: professional, fast, accessible. 3D and effects stay minimal and must respect
   prefers-reduced-motion. Never invent facts, prices, certificates or customer reviews.
6. Secrets (SUPABASE_SERVICE_KEY, EmailJS private key, APP_SECRET, Drive key) must never appear in code,
   logs, pages, tests or chat. They live in environment variables or in the admin settings (encrypted).
7. Visitor tracking must stay consent-based (cookie notice, no covert tracking, no raw IP storage).
8. After every change run `npm test`; all tests must pass. Add a test for new behaviour in tests/.
Explain what you changed in simple words (I am a beginner), and list the files you touched.
```

---

## A. Connect everything (do these in order)

### A1. GitHub
```
/plan
Help me put this project on GitHub as a PRIVATE repository. Check .gitignore so that .env, data/ and
node_modules/ are never committed, and tell me the exact git commands for Windows. After the push, show me
how to confirm that no .env file is in the repository.
```

### A2. Supabase (text database)
```
/plan
Read docs/INTEGRATIONS.md step 2, docs/supabase/schema.sql and src/supabase.js. Walk me through creating the
Supabase project, running schema.sql, and putting SUPABASE_URL and SUPABASE_SERVICE_KEY into my .env.
Do NOT change src/supabase.js. Then run `npm run doctor`, start the site and tell me whether the console
shows "[supabase] connected". If not, read Admin > Integrations > Test connection message and explain it.
```

### A3. Vercel
```
/plan
(use a devops / deployment agency-* agent)
Run `node scripts/vercel-check.js`. Then give me a checklist for deploying this repository on Vercel:
framework preset "Other", every environment variable (APP_SECRET, SUPABASE_URL, SUPABASE_SERVICE_KEY,
ADMIN_EMAIL, ADMIN_PASSWORD, SITE_URL, ALLOWED_HOSTS), how to add my domain, and how to verify /healthz,
/admin and /sitemap.xml. Do not edit vercel.json or api/index.js.
```

### A4. EmailJS (enquiry e-mails)
```
Read docs/EMAILJS.md. Guide me screen by screen through EmailJS (service, template with the variables listed
there, keys). Then tell me which fields to fill in Admin > Settings > Forms, Email & Spam and how to use
"Send test e-mail". If the test fails, explain the message (for example 403 may mean the account setting
"Allow EmailJS API for non-browser applications" must be switched on). Do NOT put any key into code.
```

### A5. Google Drive for pictures
```
Read docs/GOOGLE_DRIVE.md. Help me (1) create a Drive folder shared as "Anyone with the link: Viewer",
(2) deploy docs/drive/Code.gs as an Apps Script web app, (3) fill Admin > Settings > Media & Storage.
Then explain the setting "Where should new uploads be stored?" (Automatic / Always Drive / Always local files).
```

### A6. Home page background video
```
/grill-me
I want a background video on the home page. Ask me what it should show, how long it should be, and the
mood. Then tell me how to export it (MP4, H.264, under 10 MB, no sound, 1280x720), where to put it
(public/assets/videos/hero.mp4) and which admin settings to change (Content Options > Hero background
video, Appearance > Dark layer over the hero). Also tell me how to add a poster picture.
```

### A7. Google Search Console and Business Profile
```
Read docs/INTEGRATIONS.md step 7. Give me a beginner checklist to verify the site in Google Search Console,
submit /sitemap.xml, and claim a Google Business Profile for the Kappalur, Madurai factory. Then open
Admin > SEO Centre and explain each red or amber item and what I must do for it.
```

### A8. Security check before launch
```
/ralph-loop
(use a security agency-* agent)
Act as an application-security reviewer for this repository. Check headers, cookies, CSRF, admin roles,
uploads, SSRF in src/drive.js and src/supabase.js, rate limits, and that no secret is in the code or in
git history. Report each finding with severity, file, a fix and a test. Fix critical and high findings
without weakening any existing protection. Finish with `npm test` and `npm audit --omit=dev`.
```

### A9. Final launch rehearsal
```
/plan
Rehearse the launch: run npm test, npm run doctor, node scripts/vercel-check.js; open Admin > Integrations and
list every item that is not green; send a test enquiry; change a text in the admin and confirm it is in
Supabase; run Lighthouse (mobile) on /, /products, /contact and /pvc-pipes-madurai. Give me a final
go / no-go list in simple words.
```

---

## B. Everyday jobs

## B1. Replace placeholders with real business data

```
Open the Admin Dashboard setup checklist logic (src/settings_schema.js entries with ph:true) and list every
placeholder in the project. I will give you the real data below. Update the seed data in src/seed.js and
the defaults in src/settings_schema.js for a FRESH install, and tell me what I must change by hand in
the admin panel for the already-running site.

Real data:
- Business name: ...
- Phone numbers: ...
- WhatsApp: ...
- Address + Google Maps link: ...
- Opening hours: ...
- GST number (optional): ...
- Year started: ...
- Product list with sizes: ...
```

## B2. Add real photos

```
I put product photos in the folder ./photos (file names = product names). Write a small Node script
scripts/import-photos.js that resizes them to 1200px wide WebP using sharp (add it as a devDependency),
copies them into public/assets/uploads, and attaches each to the right product's `image` field in the database.
Do not delete my originals. Explain how to run it.
```

## B3. Add a new field or a new content type

```
Add a "warranty" text field (English + Tamil) to Products and show it on the product page under the
specification list, only when it is filled. Use src/schema.js so the admin form appears automatically.
Add a test.
```

```
Add a new editable content type "Dealers" (name, town, district, phone, map link, active, order).
Show it as a searchable table on a new public page /dealers (English + Tamil), add it to the sitemap, the
navigation menu setting and the admin sidebar. Follow the existing pattern of the "Team" model.
```

## B4. Look & design changes

```
Create a new built-in theme called "Madurai Blue" using the logo colours (primary #..., accent #...).
Add it in src/themes.js next to the other business themes, make sure text/background contrast passes
WCAG AA, and show me screenshots of the home page and product page in it.
```

```
Review the home page at 390px, 768px and 1440px widths. Fix any overflow, cramped spacing or
inconsistent buttons. Keep the existing design language. Show before/after screenshots.
```

## B5. Festival themes

```
Update the festival calendar in src/themes.js for the next 12 months with the correct dates for Pongal,
Tamil New Year, Diwali, Christmas, New Year, Independence Day and Republic Day. Show the sources you used
for each date and mark any that are uncertain with "(verify date)".
```

## B6. SEO

```
Do a technical SEO audit of the live pages: titles and meta descriptions (length, uniqueness), headings,
canonical + hreflang, structured data (validate the JSON-LD), image alt text, internal links, sitemap,
robots.txt and Core Web Vitals risks. Fix what is safe to fix in code and give me a prioritised list of
the rest. Do not keyword-stuff.
```

```
Write unique SEO titles, descriptions and a 150-word intro for each local page (/pvc-pipes-in-<place>)
for these towns: ... Use natural wording, mention real local uses (agriculture, borewells), no invented
claims. Provide English and Tamil.
```

## B7. Security review

```
Act as an application-security reviewer. Review src/ and public/js for: injection, XSS, CSRF, broken
access control (admin roles), session handling, file-upload risks, SSRF, open redirects, header and
cookie flags, secrets handling, rate-limit gaps and dependency vulnerabilities (npm run audit).
For each finding give severity, the exact file and line, a fix, and a test. Fix the critical and high
ones now. Do not reduce any existing protection.
```

## B8. Performance

```
Measure the home page with Lighthouse (mobile). Find the biggest causes of slow loading
(images, fonts, JavaScript, 3D bundle) and fix them without removing features. The 3D scene must stay
lazy-loaded and must fall back gracefully on weak phones. Report before/after scores.
```

## B9. New business features (examples – pick one at a time)

```
Add a "Download catalogue" button on the home page and product pages that uses the catalogue PDF set in
Admin > Settings, and counts downloads in the cookie-less analytics.
```

```
Add a product filter on /products (category, size range, pressure class) that works without page reload
but also works with JavaScript disabled (normal links). Keep URLs shareable.
```

```
Send me a WhatsApp-ready summary: on the enquiry detail page in the admin panel add a "Reply on WhatsApp"
button that opens wa.me with a pre-filled polite reply that includes the enquiry reference number.
```

```
Add an "Enquiries" weekly email digest sent every Monday 8:00 IST to the public email in settings
(use the existing mailer; if SMTP is not configured, skip silently).
```

## B10. Tamil review

```
List every Tamil string in src/i18n.js, src/seed.js and src/themes.js in a table (English | current
Tamil). Improve any that read unnaturally for a Tamil business website in Madurai. Keep technical words
(PVC, ISI) as commonly written. Mark anything you are unsure about so a native speaker can check.
```

## B11. Fix a failing check
```
/ralph-loop
Run `npm test`. For every failing test find the root cause, fix the code (not the test, unless the test is
wrong - then explain why), and repeat until all tests pass. Show me the final output.
```

## B12. Debugging template
```
Something is wrong: <describe what you see, which page, what you expected>.
Steps to reproduce: ...
Look at the server log and the browser console, find the root cause (not just the symptom), fix it,
add a test that fails before the fix and passes after, and explain the cause in simple words.
```

## B13. Move to your own "IN NET" database later (in 2-3 months)
```
/plan
(use a database agency-* agent)
I will replace Supabase / SQLite with my own database called IN NET. Read src/db.js, src/supabase.js,
src/crud.js and docs/INTEGRATIONS.md. Do not code yet: propose a migration plan with (1) what the new
database must provide, (2) how to export everything with Admin > Backup & restore and from the Supabase
snapshot (JSON), (3) which files change, (4) how to test it, (5) how to roll back. Ask me questions
(/grill-me) about the new database first.
```

## B14. Learn what was built
```
/learn
Explain in beginner words how a visitor's enquiry travels: browser form -> /api/enquiry -> database ->
Supabase copy -> EmailJS -> my Gmail. Show the exact files and functions.
```
