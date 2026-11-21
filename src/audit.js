'use strict';
const db = require('./db');
const { nowISO, clean } = require('./util');

const ins = db.prepare('INSERT INTO audit_log(ts,user_id,user_email,action,entity,entity_id,detail,ip) VALUES(?,?,?,?,?,?,?,?)');
function log(req, action, entity = '', entityId = '', detail = '') {
  try {
    const u = req && req.user;
    ins.run(nowISO(), u ? u.id : null, u ? u.email : null, clean(action, 60), clean(entity, 60), String(entityId || '').slice(0, 40), clean(detail, 500), req ? req.ip : null);
  } catch (e) { console.error('[audit] failed', e.message); }
}
// Prune audit entries older than 180 days (called from the maintenance job).
function prune(days = 180) { db.prepare('DELETE FROM audit_log WHERE ts < ?').run(new Date(Date.now() - days * 864e5).toISOString()); }
module.exports = { log, prune };
