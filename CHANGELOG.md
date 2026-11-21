# Changelog

Newest first. **Launcher** = `suriya.bat`. When you apply an update with `suriya.bat` (option "Apply an update"), your database, `.env` and the pictures in `public/assets/uploads|images|videos|brand` are never overwritten.

## Website 2.1.0 / Launcher 1.1.0 – 2026-11-20

**Do the files `content` and `themes` change?** The text content is not changed by the update (your admin edits stay). `src/themes.js` **did** change (helper-text colours are now always readable). Nothing to redo by hand.

### Home page
- The pipe picture is **removed** from the home page. The default hero is clean text with the two buttons.
- **Background video or picture**: Settings → Content Options (*Hero background video*, *Hero background picture / video poster*), strength of the dark layer in Settings → Appearance. Leave both empty for the text hero. (Old layout with the 3D pipes: Appearance → *Hero layout* → split.)
- The **theme-changer icon is hidden for visitors**. Themes are managed in Admin → Themes only (Settings → Appearance has the switch if you ever want visitors to choose).
- A one-time migration applies these defaults to existing sites; later changes you make in the admin are kept.

### Database
- **Supabase** copy of all text data (`src/supabase.js`, `docs/supabase/schema.sql`): restored on start, saved after every change, admin Integrations page with Test / Save / Load buttons. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`.
- Pictures stay on Google Drive / local files; only their links are stored.
- **Where new uploads go** is now a setting: Automatic / Always Drive / Always local files (+ per-upload override).

### E-mail
- **EmailJS** sending from the server (enquiry → EmailJS → your Gmail), 1 request/second queue, Private Key support, **Send test e-mail** button, SMTP kept as fallback. Awaited on Vercel so the function is not frozen early. The enquiry is always saved first.

### Admin
- New **System → Integrations** page: what is connected and what is still to do.
- Dashboard warning on Vercel now mentions Supabase *or* Turso.

### SEO / accessibility / speed (Google Lighthouse, mobile, local)
- SEO **100** on Home, a keyword page, Products, Contact, Tamil home (was 92 on Home): descriptive link text on blog cards, footer headings in order, underlined cookie link, readable helper text on all 23 themes, darker WhatsApp button. Accessibility 96–100, Best Practices 100, Performance 88–99.

### Docs and tools
- New: `docs/INTEGRATIONS.md`, `docs/EMAILJS.md`; rewritten `README.md`; `ANTIGRAVITY_PROMPTS.md` now has connect-everything prompts that use your skills.
- `scripts/doctor.js`, `scripts/vercel-check.js`, `.env.example` know about Supabase.

### Launcher (suriya.bat 1.1.0)
- Updates also protect `public\assets\images`, `videos` and `brand` (and the same folders inside the ZIP), and the backup now includes them.
- The stop message says plainly that whatever is using the port is stopped.
- **Untested on Windows** (written and statically checked on Linux).

### Tests
- New tests: EmailJS (fake server), Supabase mirror (fake PostgREST: restore, two-way sync, outage safety, serverless mode, admin page), upload-storage modes, hero variants, hidden theme icon, theme contrast.

## Website 2.0.0 / Launcher 1.0.0 – 2026-11-19
- First full release: public site, admin CMS, 14 business + 9 festival themes, Tamil/English, SEO Centre with 7 keyword pages, consent-based visitor statistics, login history, Google Drive links and uploads, Vercel/Turso support, `suriya.bat`.
