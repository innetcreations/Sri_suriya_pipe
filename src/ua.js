'use strict';
// Small, dependency-free helpers that describe a visitor's device. Used by the visitor statistics and the admin login history.
// The raw User-Agent text is never stored, only these short labels.

function parseUA(ua) {
  ua = String(ua || '');
  const device = /ipad|tablet|kindle|silk|playbook/i.test(ua) || (/android/i.test(ua) && !/mobile/i.test(ua)) ? 'tablet'
    : /mobi|iphone|ipod|android|windows phone/i.test(ua) ? 'mobile' : 'desktop';
  let os = 'Other';
  if (/windows nt 10|windows nt 11/i.test(ua)) os = 'Windows 10/11'; else if (/windows/i.test(ua)) os = 'Windows';
  else if (/android/i.test(ua)) os = 'Android'; else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/mac os x|macintosh/i.test(ua)) os = 'macOS'; else if (/cros/i.test(ua)) os = 'ChromeOS'; else if (/linux|x11/i.test(ua)) os = 'Linux';
  let browser = 'Other';
  if (/edg(e|a|ios)?\//i.test(ua)) browser = 'Edge'; else if (/opr\/|opera/i.test(ua)) browser = 'Opera'; else if (/samsungbrowser/i.test(ua)) browser = 'Samsung Internet';
  else if (/firefox|fxios/i.test(ua)) browser = 'Firefox'; else if (/chrome|crios|chromium/i.test(ua)) browser = 'Chrome'; else if (/safari/i.test(ua)) browser = 'Safari';
  else if (/msie|trident/i.test(ua)) browser = 'Internet Explorer';
  return { device, os, browser };
}

// Country / city come from the hosting provider's headers (Vercel, Cloudflare, CloudFront). Without such a host they are simply empty.
function geo(req) {
  const cc = String(req.get('x-vercel-ip-country') || req.get('cf-ipcountry') || req.get('cloudfront-viewer-country') || req.get('x-country-code') || '').toUpperCase();
  const country = /^[A-Z]{2}$/.test(cc) && cc !== 'XX' && cc !== 'T1' ? cc : '';
  let city = req.get('x-vercel-ip-city') || req.get('cf-ipcity') || '';
  try { city = decodeURIComponent(city); } catch { /* keep raw */ }
  city = String(city).replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 40);
  return { country, city };
}
const REGION_NAMES = (() => { try { return new Intl.DisplayNames(['en'], { type: 'region' }); } catch { return null; } })();
const countryName = (cc) => { if (!cc) return 'Unknown'; try { return (REGION_NAMES && REGION_NAMES.of(cc)) || cc; } catch { return cc; } };

module.exports = { parseUA, geo, countryName };
