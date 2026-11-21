'use strict';
// Version-stamped in-memory cache. Every content/settings/theme write bumps a version stored in the DB,
// so cached pages and queries from ALL worker processes are invalidated within ~1 second.
const db = require('./db');

let localV = 0;
let lastCheck = 0;
const getV = db.prepare("SELECT value FROM settings WHERE key='_v'");
const setV = db.prepare("INSERT INTO settings(key,value,updated_at) VALUES('_v',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at");

function version() {
  const now = Date.now();
  if (now - lastCheck > 1000) {
    lastCheck = now;
    const r = getV.get();
    const v = r ? parseInt(r.value, 10) || 0 : 0;
    if (v > localV) localV = v;
  }
  return localV;
}
function bump() {
  const r = getV.get();
  const v = Math.max(localV, r ? parseInt(r.value, 10) || 0 : 0) + 1;
  setV.run(String(v), new Date().toISOString());
  localV = v;
  lastCheck = Date.now();
}

const store = new Map();
const stats = { hits: 0, misses: 0 };
const MAX = 600;

function memo(key, ttlMs, fn) {
  const v = version();
  const e = store.get(key);
  if (e && e.v === v && e.exp > Date.now()) { stats.hits++; return e.val; }
  stats.misses++;
  const val = fn();
  if (store.size >= MAX) store.delete(store.keys().next().value);
  store.set(key, { v, exp: Date.now() + ttlMs, val });
  return val;
}
function get(key) {
  const e = store.get(key);
  if (e && e.v === version() && e.exp > Date.now()) { stats.hits++; return e.val; }
  stats.misses++;
  return undefined;
}
function put(key, val, ttlMs) {
  if (store.size >= MAX) store.delete(store.keys().next().value);
  store.set(key, { v: version(), exp: Date.now() + ttlMs, val });
}
function clear() { store.clear(); bump(); }

module.exports = { version, bump, memo, get, put, clear, stats, size: () => store.size };
