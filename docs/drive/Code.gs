/**
 * Sri Suriya - Google Drive upload helper (Google Apps Script web app)
 * ---------------------------------------------------------------------------
 * What it does: lets the website admin (Admin -> Media -> "Upload to Google Drive")
 * save a picture / video / PDF into ONE folder of YOUR Google Drive and get back its id.
 *
 * How it stays safe
 *  - The folder is fixed in Script properties (FOLDER_ID). Requests cannot choose another folder.
 *  - A secret ADMIN_KEY (also in Script properties) must be sent with every request.
 *  - Only pictures, MP4/WebM videos and PDFs are accepted, and the real file content is checked,
 *    not just the file name.
 *  - It can only CREATE files. It cannot list, read, change or delete anything.
 *
 * Setup: see docs/GOOGLE_DRIVE.md  (about 5 minutes, no coding).
 */

var MAX_BYTES = 30 * 1024 * 1024;   // 30 MB per file (Apps Script request limit is about 50 MB including encoding)
var ALLOWED = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'application/pdf': 'pdf'
};

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Opening the web-app address in a browser only shows that it is alive.
function doGet() {
  return json_({ ok: true, service: 'sri-suriya-drive', note: 'POST only' });
}

// Run this function ONCE in the Apps Script editor (press "Run" button) to grant Drive permissions.
function authorizeScript() {
  var props = PropertiesService.getScriptProperties();
  var folderId = props.getProperty('FOLDER_ID');
  if (!folderId) {
    Logger.log('Please set FOLDER_ID in Script properties first.');
    return;
  }
  var folder = DriveApp.getFolderById(folderId);
  Logger.log('SUCCESS! DriveApp is authorized. Folder name: ' + folder.getName());
}

function sameKey_(a, b) {            // constant-time comparison
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length || a.length === 0) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Checks the first bytes of the file against the declared type.
function magicOk_(bytes, mime) {
  function at(i) { return (bytes[i] + 256) % 256; }
  function ascii(s, off) { for (var i = 0; i < s.length; i++) if (at(off + i) !== s.charCodeAt(i)) return false; return true; }
  if (bytes.length < 12) return false;
  switch (mime) {
    case 'image/jpeg': return at(0) === 0xFF && at(1) === 0xD8 && at(2) === 0xFF;
    case 'image/png': return at(0) === 0x89 && ascii('PNG', 1);
    case 'image/gif': return ascii('GIF8', 0);
    case 'image/webp': return ascii('RIFF', 0) && ascii('WEBP', 8);
    case 'image/avif': return ascii('ftyp', 4);
    case 'video/mp4': return ascii('ftyp', 4);
    case 'video/webm': return at(0) === 0x1A && at(1) === 0x45 && at(2) === 0xDF && at(3) === 0xA3;
    case 'application/pdf': return ascii('%PDF', 0);
  }
  return false;
}

function cleanName_(name, ext) {
  var base = String(name || 'file').replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60);
  if (!base) base = 'file';
  return base + '-' + Utilities.formatDate(new Date(), 'Asia/Kolkata', 'yyMMdd-HHmmss') + '.' + ext;
}

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var KEY = props.getProperty('ADMIN_KEY');
    var FOLDER = props.getProperty('FOLDER_ID');
    if (!KEY || !FOLDER) return json_({ ok: false, error: 'Not set up: add ADMIN_KEY and FOLDER_ID in Project settings > Script properties.' });

    var body;
    try { body = JSON.parse(e && e.postData && e.postData.contents || '{}'); } catch (err) { return json_({ ok: false, error: 'Bad request.' }); }
    if (!sameKey_(body.key, KEY)) return json_({ ok: false, error: 'Wrong key.' });

    if (body.action === 'ping') return json_({ ok: true, pong: true });
    if (body.action !== 'upload') return json_({ ok: false, error: 'Unknown action.' });

    var mime = String(body.mime || '').toLowerCase();
    var ext = ALLOWED[mime];
    if (!ext) return json_({ ok: false, error: 'File type not allowed. Use JPG, PNG, WebP, GIF, AVIF, MP4, WebM or PDF.' });
    if (typeof body.data !== 'string' || !body.data) return json_({ ok: false, error: 'No file data.' });
    if (body.data.length > MAX_BYTES * 1.4) return json_({ ok: false, error: 'File too large (max 30 MB for Drive uploads).' });

    var bytes = Utilities.base64Decode(body.data);
    if (bytes.length > MAX_BYTES) return json_({ ok: false, error: 'File too large (max 30 MB for Drive uploads).' });
    if (!magicOk_(bytes, mime)) return json_({ ok: false, error: 'The file content does not match its type.' });

    var name = cleanName_(body.name, ext);
    var blob = Utilities.newBlob(bytes, mime, name);
    var file = DriveApp.getFolderById(FOLDER).createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);   // needed so the public website can show it
    return json_({ ok: true, id: file.getId(), name: file.getName() });
  } catch (err) {
    return json_({ ok: false, error: 'Upload failed: ' + String(err && err.message || err).slice(0, 160) });
  }
}
