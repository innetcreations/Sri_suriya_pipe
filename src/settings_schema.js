'use strict';
// Every site-wide setting. Adding a line here automatically adds it to Admin → Settings.
// type: text | textarea | number | bool | select | url | image | color | secret | email | tel
// ph:true  = value is a PLACEHOLDER the owner should replace (shown in the Setup Checklist on the dashboard).
const s = (key, group, type, label, def = '', o = {}) => ({ key, group, type, label, def, ...o });

const GROUPS = [
  ['general', 'Business & Branding', 'building'],
  ['contact', 'Contact & Location', 'phone'],
  ['social', 'Social & Marketplaces', 'share'],
  ['seo', 'SEO & Analytics', 'search'],
  ['media', 'Media & Storage', 'image'],
  ['privacy', 'Cookies & Privacy', 'shield'],
  ['appearance', 'Appearance & Effects', 'palette'],
  ['content', 'Content Options', 'file'],
  ['forms', 'Forms, Email & Spam', 'mail'],
  ['chat', 'Chat Assistant', 'chat'],
  ['lang', 'Languages', 'globe'],
  ['security', 'Security & Access', 'shield'],
  ['maintenance', 'Maintenance & Custom Code', 'tool'],
];

const SETTINGS = [
  // ---- general
  s('site_name', 'general', 'text', 'Legal / full business name', 'Sri Suriya Polymers', { help: 'Used in titles, schema.org data and the footer.' }),
  s('brand_short', 'general', 'text', 'Brand name (header)', 'SRI SURIYA PIPES'),
  s('tagline', 'general', 'text', 'Tagline', "Tamil Nadu's trusted PVC pipe manufacturer & dealer"),
  s('established', 'general', 'number', 'Established year', '2010'),
  s('proprietor', 'general', 'text', 'Proprietor / owner', 'K. Sudhakar'),
  s('business_type', 'general', 'text', 'Business type', 'Sole Proprietorship'),
  s('logo', 'general', 'image', 'Logo (light backgrounds)', '', { ph: true, help: 'PNG/WebP/JPG. Leave empty to use the built-in pipe mark + brand name.' }),
  s('logo_dark', 'general', 'image', 'Logo (dark backgrounds)', '', { help: 'Optional. Used on dark themes and the footer.' }),
  s('favicon', 'general', 'image', 'Browser-tab / address-bar icon (favicon)', '', { ph: true, help: 'Square PNG, at least 192×192. Shown in the browser tab, bookmarks and Google results.' }),
  s('pwa_icon', 'general', 'image', 'App icon (512×512, for "Add to home screen")', '', { help: 'Optional. Square PNG, 512×512. Falls back to the favicon.' }),
  s('admin_logo', 'general', 'image', 'Admin panel logo', '', { help: 'Shown at the top of this admin panel and on the sign-in page.' }),
  s('og_image', 'general', 'image', 'Default share image (1200×630)', '', { ph: true, help: 'Shown when pages are shared on WhatsApp / Facebook / LinkedIn.' }),
  s('footer_credit', 'general', 'text', 'Footer credit line (optional)', '', { help: 'e.g. “Website by …”. Leave empty to hide.' }),
  s('footer_credit_url', 'general', 'url', 'Footer credit link', ''),

  // ---- contact
  s('phone1', 'contact', 'tel', 'Primary mobile', '+91 99941 66671'),
  s('phone2', 'contact', 'tel', 'Secondary mobile', '+91 97871 66671'),
  s('office_phone', 'contact', 'tel', 'Office landline', '0452 2489895'),
  s('whatsapp', 'contact', 'text', 'WhatsApp number (digits only, with country code)', '919994166671'),
  s('email', 'contact', 'email', 'Public email', '', { ph: true, help: 'Shown on the site and used in schema.org. Leave empty to hide.' }),
  s('address1', 'contact', 'text', 'Address line 1', 'D-42, SIDCO Industrial Estate'),
  s('address2', 'contact', 'text', 'Address line 2', 'Near SBI Bank'),
  s('city', 'contact', 'text', 'City / locality', 'Kappalur, Madurai'),
  s('pincode', 'contact', 'text', 'PIN code', '625008'),
  s('state', 'contact', 'text', 'State', 'Tamil Nadu'),
  s('lat', 'contact', 'number', 'Latitude', '9.857244'),
  s('lng', 'contact', 'number', 'Longitude', '78.015822'),
  s('hours', 'contact', 'text', 'Opening hours (display text)', 'Mon–Sat: 9:00 AM – 6:00 PM', { ph: true }),
  s('hours_schema', 'contact', 'text', 'Opening hours for Google (schema)', 'Mo-Sa 09:00-18:00', { help: 'Format: Mo-Sa 09:00-18:00' }),
  s('map_embed', 'contact', 'url', 'Google Maps embed URL', 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d6140.017555888764!2d78.01582189968607!3d9.857243990097867!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3b00d1c5dd778e2f%3A0x53b60ec1924326e9!2sSri%20Surya%20Polymers!5e0!3m2!1sen!2sin!4v1773320190830!5m2!1sen!2sin', { help: 'Google Maps → Share → Embed a map → copy the src="…" URL.' }),
  s('map_link', 'contact', 'url', 'Google Maps place link', 'https://www.google.com/maps/search/?api=1&query=Sri+Surya+Polymers+Kappalur+Madurai'),

  // ---- social
  s('facebook', 'social', 'url', 'Facebook page', ''),
  s('instagram', 'social', 'url', 'Instagram', ''),
  s('youtube', 'social', 'url', 'YouTube channel', ''),
  s('linkedin', 'social', 'url', 'LinkedIn', ''),
  s('x_twitter', 'social', 'url', 'X (Twitter)', ''),
  s('indiamart', 'social', 'url', 'IndiaMART listing', ''),
  s('justdial', 'social', 'url', 'Justdial listing', ''),

  // ---- seo
  s('seo_suffix', 'seo', 'text', 'Title suffix', ' | Sri Suriya Polymers'),
  s('seo_description', 'seo', 'textarea', 'Default meta description', 'Sri Suriya Polymers is a trusted manufacturer and dealer of agricultural, borewell and electrical PVC pipes, fittings and water tanks in Madurai, Tamil Nadu. Delivery across Tamil Nadu.', { help: '150–160 characters is ideal.' }),
  s('seo_keywords', 'seo', 'textarea', 'Default keywords', 'PVC pipes Madurai, agricultural PVC pipes, borewell casing pipes, electrical conduit pipes, PVC fittings, water tanks Tamil Nadu'),
  s('google_verification', 'seo', 'text', 'Google Search Console verification code', '', { ph: true, help: 'Only the content="…" value of the meta tag.' }),
  s('bing_verification', 'seo', 'text', 'Bing Webmaster verification code', ''),
  s('ga4_id', 'seo', 'text', 'Google Analytics 4 ID', '', { help: 'Format G-XXXXXXXXXX. Built-in privacy-friendly analytics works without this.' }),
  s('gtm_id', 'seo', 'text', 'Google Tag Manager ID', '', { help: 'Format GTM-XXXXXXX.' }),
  s('clarity_id', 'seo', 'text', 'Microsoft Clarity project ID (optional)', '', { help: 'Free heat-maps and session recordings. Only add it if your cookie banner is switched on.' }),
  s('seo_target_keywords', 'seo', 'textarea', 'Target search phrases (one per line)', 'best pvc pipe manufacturer\ntamil nadu best pvc pipe company\nmadurai best company\nbest manufacturing company\nmadurai pvc pipes\nbest quality pvc products\npvc pipe manufacturer in india', { help: 'Used by Admin → SEO Centre to check that every phrase has its own landing page.' }),
  s('same_as', 'seo', 'textarea', 'Other official profiles (one URL per line)', '', { help: 'Google Business Profile, IndiaMART, Justdial, LinkedIn… helps Google connect them to your brand.' }),
  s('google_business_url', 'seo', 'url', 'Google Business Profile link', '', { ph: true, help: 'The single most important thing for “near me” and “Madurai” searches. Create it free at business.google.com.' }),
  s('robots_extra', 'seo', 'textarea', 'Extra robots.txt lines', ''),
  s('noindex_site', 'seo', 'bool', 'Hide whole site from search engines (staging only)', '0'),

  // ---- media & storage
  s('upload_target', 'media', 'select', 'Where should new uploads be stored?', 'auto', { options: [['auto', 'Automatic: Google Drive if connected, otherwise this website\'s files'], ['drive', 'Always my Google Drive folder (online)'], ['local', 'Always this website\'s files (assets folder)']], help: 'You can still change it for a single upload with the drop-down in the Media library. Only the web address (link) of each picture is saved in the database, so switching later never breaks old pictures. On Vercel the site cannot store files, so Automatic uses Drive there.' }),
  s('drive_folder_url', 'media', 'url', 'My Google Drive media folder (link)', '', { ph: true, help: 'Shared as “Anyone with the link: Viewer”. The Media library shows an Open button for it.' }),
  s('drive_script_url', 'media', 'url', 'Drive upload: Apps Script web-app URL', '', { help: 'Optional. Looks like https://script.google.com/macros/s/…/exec — see docs/GOOGLE_DRIVE.md (5-minute setup).' }),
  s('drive_admin_key', 'media', 'secret', 'Drive upload: secret key', '', { help: 'The same key you put in the Apps Script. Stored encrypted; never shown again.' }),

  // ---- privacy & cookies
  s('analytics_on', 'privacy', 'bool', 'Count visitors (privacy-friendly visitor statistics)', '1', { help: 'Shows page views, devices, countries and live visitors in Admin → Visitors. No IP addresses are stored.' }),
  s('cookie_banner', 'privacy', 'bool', 'Show cookie notice', '1', { help: 'Recommended (India DPDP Act / GDPR). Visitors choose Accept or Essential only. Optional cookies (returning-visitor id, Google Analytics, Clarity) are used only after Accept.' }),
  s('cookie_text', 'privacy', 'text', 'Cookie notice text', 'We use essential cookies to run this site. With your consent we also use cookies to understand how the site is used and to improve it.'),
  s('cookie_policy_url', 'privacy', 'url', 'Cookie / privacy policy link', '/cookie-policy'),

  // ---- appearance
  s('active_theme', 'appearance', 'text', 'Default theme', 'professional', { custom: 'theme' }),
  s('theme_mode', 'appearance', 'select', 'Theme mode', 'events', { options: [['fixed', 'Always use the default theme'], ['events', 'Switch automatically for festivals / global events']] }),
  s('allow_visitor_theme', 'appearance', 'bool', 'Show the theme picker icon to visitors (off = only you can change themes, in Admin)', '0'),
  s('fx_3d', 'appearance', 'bool', '3D hero pipe & pipe configurator', '1'),
  s('fx_particles', 'appearance', 'bool', 'Particle effects', '1'),
  s('fx_sound', 'appearance', 'bool', 'Sound effects (visitor can toggle)', '1'),
  s('sound_default_on', 'appearance', 'bool', 'Sound ON by default for new visitors', '0', { help: 'Browsers only allow audio after a click; keeping this off is recommended for a business site.' }),
  s('sound_volume', 'appearance', 'number', 'Sound volume (0–1)', '0.45'),
  s('fx_cursor', 'appearance', 'bool', 'Glow cursor effect', '0'),
  s('fx_loader', 'appearance', 'bool', 'Pipe-filling intro loader (once per session)', '1'),
  s('fx_transitions', 'appearance', 'bool', 'Smooth page transitions', '1'),
  s('fx_quality', 'appearance', 'select', 'Effects quality', 'auto', { options: [['auto', 'Auto (recommended)'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] }),
  s('fx_intensity', 'appearance', 'number', 'Effects intensity (0.3 – 2)', '1'),
  s('hero_style', 'appearance', 'select', 'Hero layout (top of the home page)', 'center', { options: [['center', 'Clean text hero - add a background video or picture (recommended)'], ['split', 'Text left · 3D pipes right']] }),
  s('hero_overlay', 'appearance', 'select', 'Dark layer over the hero video / picture (keeps the text readable)', 'soft', { options: [['none', 'None'], ['soft', 'Soft'], ['strong', 'Strong']] }),

  // ---- content
  s('hero_video', 'content', 'url', 'Hero background video (MP4/WebM)', '', { ph: true, media: 'file', help: 'Best: an MP4 under 10 MB in your assets folder (public/assets/videos/hero.mp4 → /assets/videos/hero.mp4) or uploaded in Media. A Google Drive link works for small files only - Drive does not allow big videos to play inside other websites. Leave empty for a clean hero.' }),
  s('hero_poster', 'content', 'image', 'Hero background picture / video poster', '', { ph: true, help: 'Used as the background when no video is set (hero layout "Clean text hero"), and as the picture shown while the video loads.' }),
  s('catalog_pdf', 'content', 'url', 'Product catalogue PDF', '', { ph: true, media: 'file', help: 'Upload a PDF in Media and paste its URL; a download button appears automatically.' }),
  s('pipe_length_m', 'content', 'number', 'Standard pipe length (metres) for the calculator', '6'),
  s('wastage_pct', 'content', 'number', 'Default wastage allowance (%) for the calculator', '5'),
  s('payment_note', 'content', 'text', 'Payment note', 'We accept Cash, Cheque, DD and Online Bank Transfers.'),
  s('delivery_note', 'content', 'text', 'Delivery note', 'Delivery available across Tamil Nadu.'),

  // ---- forms
  s('notify_email', 'forms', 'email', 'Send new enquiries to (your Gmail / e-mail address)', '', { ph: true, help: 'The address that receives every enquiry. Works with EmailJS (below) or SMTP. Enquiries are always saved in Admin → Enquiries as well.' }),
  s('emailjs_service_id', 'forms', 'text', 'EmailJS - Service ID', '', { help: 'EmailJS dashboard → Email Services → your Gmail service → Service ID. Full guide: docs/EMAILJS.md' }),
  s('emailjs_template_id', 'forms', 'text', 'EmailJS - Template ID', '', { help: 'Email Templates → your template → Template ID (set the template\'s “To Email” field to {{to_email}}).' }),
  s('emailjs_public_key', 'forms', 'text', 'EmailJS - Public Key', '', { help: 'Account → General → Public Key.' }),
  s('emailjs_private_key', 'forms', 'secret', 'EmailJS - Private Key (optional but recommended)', '', { help: 'Account → General → Private Key. Kept on the server only.' }),
  s('smtp_host', 'forms', 'text', 'SMTP host', ''),
  s('smtp_port', 'forms', 'number', 'SMTP port', '587'),
  s('smtp_user', 'forms', 'text', 'SMTP username', ''),
  s('smtp_pass', 'forms', 'secret', 'SMTP password', ''),
  s('smtp_from', 'forms', 'text', 'From address', ''),
  s('turnstile_site', 'forms', 'text', 'Cloudflare Turnstile site key (optional)', '', { help: 'Free CAPTCHA alternative. Leave empty to rely on honeypot + rate limits.' }),
  s('turnstile_secret', 'forms', 'secret', 'Cloudflare Turnstile secret key', ''),

  // ---- chat
  s('chat_enabled', 'chat', 'bool', 'Enable chat assistant', '1'),
  s('chat_name', 'chat', 'text', 'Assistant name', 'Surya Assistant'),
  s('chat_greeting', 'chat', 'text', 'Greeting', 'Hello! How can I help you with PVC pipes today?'),
  s('chat_fallback', 'chat', 'text', 'Fallback reply', "I'm not sure about that. Please call us or send an enquiry and our team will help you."),

  // ---- languages
  s('enable_ta', 'lang', 'bool', 'Enable Tamil (தமிழ்) version', '1'),

  // ---- security
  s('session_hours', 'security', 'number', 'Admin session length (hours)', '12'),
  s('session_idle_min', 'security', 'number', 'Admin idle timeout (minutes)', '120'),
  s('require_2fa', 'security', 'bool', 'Require 2-factor authentication for all admins', '0', { help: 'Each admin must enrol an authenticator app on first login after this is enabled.' }),
  s('admin_ip_allow', 'security', 'text', 'Restrict admin to these IPs (comma separated)', '', { help: 'DANGER: if you enter the wrong IP you will lock yourself out. Leave empty unless you have a fixed IP. Recover by editing the setting in data/app.db or the ADMIN_IP_ALLOW env var.' }),

  // ---- maintenance & custom
  s('maintenance_mode', 'maintenance', 'bool', 'Maintenance mode (public site shows a notice)', '0'),
  s('maintenance_message', 'maintenance', 'textarea', 'Maintenance message', 'We are upgrading our website. Please call us for orders.'),
  s('custom_css', 'maintenance', 'textarea', 'Global custom CSS', '', { code: true, help: 'Applied on every page after the theme. Do not paste anything you do not trust.' }),
];

const BY_KEY = Object.fromEntries(SETTINGS.map((x) => [x.key, x]));
module.exports = { SETTINGS, GROUPS, BY_KEY };
