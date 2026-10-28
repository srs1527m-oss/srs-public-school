// SRS Practical Register on Cloudflare: one Worker, D1 (database) and R2 (private photos).
// Same API as the PHP version (api.php): GET for reads, POST for the rest, JSON in and out.
import { SEED } from './seed.js';

class ApiError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

/* ---------- small helpers ---------- */
const enc = new TextEncoder();
const now = () => new Date().toISOString();
const istToday = (plusMs = 0) => new Date(Date.now() + 5.5 * 3600e3 + plusMs).toISOString().slice(0, 10);
const str = (v, max) => (typeof v === 'string' ? Array.from(v.replace(/\s+/g, ' ').trim()).slice(0, max).join('') : '');
const sec = v => str(typeof v === 'string' || typeof v === 'number' ? String(v) : '', 12).toUpperCase();
const int = v => ((Number.isInteger(v) && v >= 0 && v <= 9999) || (typeof v === 'string' && /^\d{1,4}$/.test(v))) ? Number(v) : null;
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const randHex = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sha256Hex(s) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))); }
function safeEq(a, b) {
  a = enc.encode(String(a)); b = enc.encode(String(b));
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a[i] || 0) ^ (b[i] || 0);
  return d === 0;
}

const CLASSES = {
  '6': ['science'], '7': ['science'], '8': ['science'],
  '9': ['science'], '10': ['science'], '11': ['physics', 'chemistry', 'biology'], '12': ['physics', 'chemistry', 'biology'],
  u9: ['science'], u10: ['science'], u11: ['physics', 'chemistry', 'biology'], u12: ['physics', 'chemistry', 'biology'],
};
const cleanSecs = arr => {
  const out = [];
  for (const s of Array.isArray(arr) ? arr : []) { const x = sec(s); if (x && !out.includes(x)) out.push(x); }
  return out.slice(0, 20);
};
function cleanAssign(arr) {
  const out = new Map();
  for (const a of Array.isArray(arr) ? arr : []) {
    if (!isObj(a)) continue;
    const cls = typeof a.cls === 'string' ? a.cls : '', subj = typeof a.subj === 'string' ? a.subj : '';
    if (!Object.hasOwn(CLASSES, cls) || !CLASSES[cls].includes(subj)) continue;
    const key = cls + '|' + subj, secs = cleanSecs(a.secs);
    if (out.has(key)) out.get(key).secs = [...new Set([...out.get(key).secs, ...secs])];
    else out.set(key, { cls, subj, secs });
  }
  return [...out.values()].slice(0, 40);
}
const parseAssign = s => { try { return cleanAssign(JSON.parse(s)); } catch (_) { return []; } };
function tempPassword() {
  // No look-alike characters, so it can be read out or written on paper.
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789'; let s = '';
  for (let i = 0; i < 10; i++) {
    let b; do { b = crypto.getRandomValues(new Uint8Array(1))[0]; } while (b >= 248);   // 248 = 31 * 8, no modulo bias
    s += abc[b % 31]; if (i === 4) s += '-';
  }
  return s;
}
const userPublic = (r, full) => {
  const o = { id: r.id, name: r.name, role: r.role, assign: parseAssign(r.assign) };
  if (full) { o.username = r.username; o.active = !!r.active; o.mustChange = !!r.must_change; }
  return o;
};
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
function seedList() {
  const out = [];
  for (const t of SEED) {
    const name = str(t.name, 60), username = str(t.username, 40).toLowerCase();
    if (name && USERNAME_RE.test(username)) out.push({ name, username, assign: cleanAssign(t.assign) });
  }
  return out;
}

/* ---------- passwords ----------
   Free-plan Workers get only ~10 ms of CPU per request, so the slow hash is kept light (5,000 rounds of PBKDF2-SHA256)
   and made strong another way: the password is first run through HMAC-SHA256 with a server-side secret (the setup key).
   A copy of the database alone is then useless for guessing passwords. Wrong guesses online are limited to 8 per 15 minutes.
   On a paid plan, raise ITER (the count is stored with each hash, so old hashes keep working). */
const ITER = 5000;
let PEPPER = '';   // set from the REGISTER_SETUP_KEY secret on every request
async function derive(pw, salt, iter) {
  const hk = await crypto.subtle.importKey('raw', enc.encode(PEPPER), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const pre = new Uint8Array(await crypto.subtle.sign('HMAC', hk, enc.encode(pw)));
  const key = await crypto.subtle.importKey('raw', pre, 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
async function hashPw(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(pw, salt, ITER))}`;
}
async function verifyPw(pw, stored) {
  const p = String(stored).split('$');
  if (p.length !== 4 || p[0] !== 'pbkdf2') return false;
  const got = await derive(pw, unb64(p[2]), Number(p[1]));
  return safeEq(b64(got), p[3]);
}
const DUMMY_HASH = `pbkdf2$${ITER}$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=`;

/* ---------- sessions (rows in D1; the cookie holds a random token, only its hash is stored) ---------- */
const SESSION_DAYS = 14;
const cookieOf = (req, name) => {
  for (const part of (req.headers.get('Cookie') || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return '';
};
function setCookie(c, token, maxAge) {
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
  c.cookie = `prsess=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure}`;
}
async function loadSession(c) {
  if (c.session !== undefined) return c.session;
  c.session = null;
  const tok = cookieOf(c.req, 'prsess');
  if (/^[0-9a-f]{64}$/.test(tok)) {
    const h = await sha256Hex(tok);
    const row = await c.env.DB.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires_at > ?').bind(h, Math.floor(Date.now() / 1000)).first();
    if (row) c.session = row;
  }
  return c.session;
}
// Always returns a session (anonymous if needed), because even the sign-in form needs a CSRF token.
async function ensureSession(c) {
  const s = await loadSession(c);
  if (s) return s;
  return newSession(c, null, 0);
}
async function newSession(c, userId, sv) {
  const tok = randHex(32), t = Math.floor(Date.now() / 1000);
  const row = { token_hash: await sha256Hex(tok), user_id: userId, sv, csrf: randHex(16), created_at: t, expires_at: t + SESSION_DAYS * 86400 };
  await c.env.DB.prepare('INSERT INTO sessions (token_hash, user_id, sv, csrf, created_at, expires_at) VALUES (?,?,?,?,?,?)')
    .bind(row.token_hash, row.user_id, row.sv, row.csrf, row.created_at, row.expires_at).run();
  if (Math.random() < 0.05) c.ctx.waitUntil(c.env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(t).run());
  setCookie(c, tok, SESSION_DAYS * 86400);
  c.session = row;
  c.user = undefined;
  return row;
}
async function checkCsrf(c) {
  const s = await loadSession(c), sent = c.req.headers.get('X-CSRF') || '';
  if (!s || !sent || !safeEq(sent, s.csrf)) throw new ApiError('csrf', 'The page is out of date. Reload it and try again.', 403);
}
// The signed-in user row, or null. A deactivated account or a reset password ends its sessions at once.
async function getUser(c) {
  if (c.user !== undefined) return c.user;
  c.user = null;
  const s = await loadSession(c);
  if (s && s.user_id) {
    const row = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(s.user_id).first();
    if (row && row.active && row.sess_ver === s.sv) c.user = row;
    else await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(s.token_hash).run();
  }
  return c.user;
}
async function needPost(c) {
  if (c.req.method !== 'POST') throw new ApiError('method', 'Use POST for this action.', 405);
  await checkCsrf(c);
}
async function needUser(c) {
  const u = await getUser(c);
  if (!u) throw new ApiError('auth', 'Sign in again.', 401);
  return u;
}
async function needReady(c) {
  const u = await needUser(c);
  if (u.must_change) throw new ApiError('must_change', 'Set your own password first.', 403);
  return u;
}
async function needAdmin(c) {
  const u = await needReady(c);
  if (u.role !== 'admin') throw new ApiError('forbidden', 'Only the school admin can do this.', 403);
  return u;
}

/* ---------- photos (R2) ---------- */
const PHOTO_ID = /^[0-9a-f]{32}$/;
const photoKey = id => `photos/${id}.jpg`;
async function deletePhotos(c, ids) {
  for (const id of ids) {
    if (!PHOTO_ID.test(id)) continue;
    await c.env.DB.prepare('DELETE FROM photos WHERE id = ?').bind(id).run();
    await c.env.PHOTOS.delete(photoKey(id));
  }
}
// Photos uploaded for an entry that was never saved are removed after two days.
async function sweepPhotos(c) {
  const { results } = await c.env.DB.prepare('SELECT id FROM photos WHERE entry_id IS NULL AND created_at < ?').bind(new Date(Date.now() - 2 * 86400e3).toISOString()).all();
  await deletePhotos(c, results.map(r => r.id));
}
// Width and height of a JPEG from its start-of-frame marker, or null if the bytes are not a JPEG.
function jpegSize(b) {
  if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8 || b[2] !== 0xFF) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xFF) { i++; continue; }
    const m = b[i + 1];
    if (m === 0xFF) { i++; continue; }
    if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    if (m === 0xDA || len < 2) return null;
    i += 2 + len;
  }
  return null;
}

/* ---------- responses ---------- */
const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
function reply(c, body, status = 200) {
  const h = new Headers(jsonHeaders);
  if (c.cookie) h.append('Set-Cookie', c.cookie);
  return new Response(JSON.stringify(body), { status, headers: h });
}
const ok = (c, data = {}) => reply(c, { ok: true, ...data });

async function entryPhotos(c, ids) {
  const by = {};
  if (!ids.length) return by;
  const { results } = await c.env.DB.prepare(`SELECT id, entry_id, lat, lng, taken, src FROM photos WHERE entry_id IN (${ids.map(() => '?').join(',')}) ORDER BY created_at, id`).bind(...ids).all();
  for (const p of results) (by[p.entry_id] ||= []).push({ id: p.id, lat: p.lat, lng: p.lng, t: p.taken, src: p.src });
  return by;
}
async function findTeacher(c, id) {
  const row = await c.env.DB.prepare("SELECT * FROM users WHERE id = ? AND role = 'teacher'").bind(Number(id) || 0).first();
  if (!row) throw new ApiError('not_found', 'This teacher ID no longer exists.', 404);
  return row;
}
async function adminExists(env) { return !!(await env.DB.prepare("SELECT 1 AS x FROM users WHERE role = 'admin' LIMIT 1").first()); }
async function readBody(req) { const j = await req.json().catch(() => null); return isObj(j) ? j : {}; }

/* ---------- API ---------- */
async function api(c) {
  const { env, req } = c, DB = env.DB;
  const a = new URL(req.url).searchParams.get('a') || '';

  if (a === 'me') {
    if (!(await adminExists(env))) return ok(c, { installed: false });
    const s = await ensureSession(c), u = await getUser(c);
    return ok(c, { installed: true, csrf: s.csrf, user: u ? userPublic(u, true) : null });
  }

  switch (a) {
    case 'login': {
      await needPost(c);
      const b = await readBody(req);
      const username = str(b.username, 40).toLowerCase(), password = typeof b.password === 'string' ? b.password : '';
      const ip = (req.headers.get('CF-Connecting-IP') || '').slice(0, 60), key = username + '|' + ip, t = Math.floor(Date.now() / 1000);
      await DB.prepare('DELETE FROM login_attempts WHERE at < ?').bind(t - 86400).run();
      const n = await DB.prepare('SELECT COUNT(*) AS n FROM login_attempts WHERE ukey = ? AND at > ?').bind(key, t - 900).first();
      if (n.n >= 8) throw new ApiError('throttled', 'Too many wrong tries. Wait 15 minutes and try again.', 429);
      const row = await DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
      // Verify against a dummy hash when the ID is unknown, so both cases take the same time.
      const okPw = await verifyPw(password, row ? row.pass_hash : DUMMY_HASH);
      if (!row || !okPw || !row.active) {
        await DB.prepare('INSERT INTO login_attempts (ukey, at) VALUES (?, ?)').bind(key, t).run();
        throw new ApiError('bad_login', 'The ID or password is not correct.', 401);
      }
      await DB.prepare('DELETE FROM login_attempts WHERE ukey = ?').bind(key).run();
      const old = await loadSession(c);
      if (old) await DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(old.token_hash).run();
      const s = await newSession(c, row.id, row.sess_ver);   // a fresh session id at every sign-in
      return ok(c, { user: userPublic(row, true), csrf: s.csrf });
    }
    case 'logout': {
      await needPost(c);
      const s = await loadSession(c);
      if (s) await DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(s.token_hash).run();
      setCookie(c, '', 0);
      return ok(c);
    }
    case 'password': {
      await needPost(c);
      const u = await needUser(c), b = await readBody(req);
      const cur = typeof b.current === 'string' ? b.current : '', next = typeof b.next === 'string' ? b.next : '';
      if (!(await verifyPw(cur, u.pass_hash))) throw new ApiError('bad_current', 'The current password is not correct.');
      if (next.length < 8 || next.length > 100) throw new ApiError('weak', 'The new password needs at least 8 characters.');
      if (cur === next) throw new ApiError('same', 'Choose a password different from the current one.');
      if (next.toLowerCase() === u.username) throw new ApiError('weak', 'The password cannot be the same as your ID.');
      // Raising sess_ver signs out every other device of this account.
      const sv = u.sess_ver + 1, s = await loadSession(c);
      await DB.batch([
        DB.prepare('UPDATE users SET pass_hash = ?, must_change = 0, sess_ver = ? WHERE id = ?').bind(await hashPw(next), sv, u.id),
        DB.prepare('UPDATE sessions SET sv = ? WHERE token_hash = ?').bind(sv, s.token_hash),
        DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').bind(u.id, s.token_hash),
      ]);
      return ok(c);
    }

    /* ---------- reading ---------- */
    case 'state': {
      const u = await needReady(c), admin = u.role === 'admin';
      const sRow = await DB.prepare("SELECT v FROM settings WHERE k = 'sections'").first();
      let sections = {}; try { const j = JSON.parse(sRow ? sRow.v : '{}'); if (isObj(j)) sections = j; } catch (_) {}
      let teachers, rows;
      if (admin) {
        teachers = (await DB.prepare("SELECT * FROM users WHERE role = 'teacher' ORDER BY active DESC, name COLLATE NOCASE").all()).results.map(r => userPublic(r, true));
        rows = (await DB.prepare('SELECT * FROM entries ORDER BY date DESC, id DESC').all()).results;
      } else {
        // A teacher gets their own profile and their own entries, nothing else.
        teachers = [userPublic(u, true)];
        rows = (await DB.prepare('SELECT * FROM entries WHERE user_id = ? ORDER BY date DESC, id DESC').bind(u.id).all()).results;
      }
      const photos = await entryPhotos(c, rows.map(r => r.id));
      const entries = rows.map(r => ({ id: r.id, uid: r.user_id, teacher: r.teacher, date: r.date, cls: r.cls, sec: r.sec, subj: r.subj, pid: r.pid, title: r.title,
        present: r.present, total: r.total, files: r.files, note: r.note, at: r.created_at, photos: photos[r.id] || [] }));
      return ok(c, { sections, teachers, entries });
    }

    /* ---------- entries ---------- */
    case 'entry.save': {
      await needPost(c);
      const u = await needReady(c), admin = u.role === 'admin', b = await readBody(req);
      const date = typeof b.date === 'string' ? b.date : '';
      const dOk = /^\d{4}-\d{2}-\d{2}$/.test(date) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
      if (!dOk) throw new ApiError('invalid', 'Choose the date of the practical.');
      if (date > istToday(86400e3)) throw new ApiError('invalid', 'The date cannot be in the future.');
      const pid = typeof b.pid === 'string' ? b.pid : '', title = str(b.title, 160);
      const present = int(b.present), total = int(b.total), files = int(b.files ?? 0);
      if (total === null || total < 1 || total > 200) throw new ApiError('invalid', 'Enter the number of students in the section.');
      if (present === null || present > total) throw new ApiError('invalid', 'Students present cannot be more than students in the section.');
      if (files === null || files > total) throw new ApiError('invalid', 'Record files checked cannot be more than students in the section.');
      const note = str(b.note, 300);
      const checkPid = (cls, subj) => {
        if (pid === 'other') { if (!title) throw new ApiError('invalid', 'Describe what was done in the lab.'); return; }
        if (!/^[A-Za-z0-9.]{3,40}$/.test(pid) || !pid.startsWith(cls + '.' + subj + '.')) throw new ApiError('invalid', 'Choose the practical that was done.');
      };

      if (b.id) {
        // Changing a saved entry: only its owner or the admin, and never its class, section, subject or teacher.
        const e = await DB.prepare('SELECT * FROM entries WHERE id = ?').bind(Number(b.id) || 0).first();
        if (!e || (!admin && e.user_id !== u.id)) throw new ApiError('not_found', 'This entry no longer exists.', 404);
        checkPid(e.cls, e.subj);
        await DB.prepare('UPDATE entries SET date = ?, pid = ?, title = ?, present = ?, total = ?, files = ?, note = ?, updated_at = ? WHERE id = ?')
          .bind(date, pid, pid === 'other' ? title : '', present, total, files, note, now(), e.id).run();
        return ok(c, { id: e.id });
      }

      const cls = typeof b.cls === 'string' ? b.cls : '', subj = typeof b.subj === 'string' ? b.subj : '';
      if (!Object.hasOwn(CLASSES, cls) || !CLASSES[cls].includes(subj)) throw new ApiError('invalid', 'Choose the board, class and subject.');
      const sc = sec(b.sec);
      if (!sc) throw new ApiError('invalid', 'Enter the section, for example A.');
      checkPid(cls, subj);
      // The admin may log on behalf of a teacher; a teacher always logs as themselves and only for assigned classes.
      let owner = u;
      if (admin && b.uid && Number(b.uid) !== u.id) {
        owner = await findTeacher(c, b.uid);
        if (!owner.active) throw new ApiError('invalid', 'This teacher ID is deactivated.');
      }
      if (!admin) {
        const assign = parseAssign(u.assign);
        if (assign.length) {
          const hit = assign.find(x => x.cls === cls && x.subj === subj);
          if (!hit) throw new ApiError('not_assigned', 'This class and subject are not assigned to you. Ask the school admin.', 403);
          if (hit.secs.length && !hit.secs.includes(sc)) throw new ApiError('not_assigned', `Section ${sc} is not assigned to you for this class. Ask the school admin.`, 403);
        }
      }
      const ids = [];
      for (const p of Array.isArray(b.photos) ? b.photos : []) if (typeof p === 'string' && PHOTO_ID.test(p) && !ids.includes(p)) ids.push(p);
      if (ids.length > 4) throw new ApiError('invalid', 'An entry can carry up to 4 photos.');
      for (const p of ids) {
        // Only photos this same account uploaded and has not used yet.
        const r = await DB.prepare('SELECT 1 AS x FROM photos WHERE id = ? AND user_id = ? AND entry_id IS NULL').bind(p, u.id).first();
        if (!r) throw new ApiError('invalid', 'A photo did not upload fully. Remove the photos and add them again.');
      }
      const res = await DB.batch([
        DB.prepare('INSERT INTO entries (user_id, teacher, date, cls, sec, subj, pid, title, present, total, files, note, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)')
          .bind(owner.id, owner.name, date, cls, sc, subj, pid, pid === 'other' ? title : '', present, total, files, note, now()),
        ...ids.map(p => DB.prepare('UPDATE photos SET entry_id = last_insert_rowid(), user_id = ? WHERE id = ? AND user_id = ? AND entry_id IS NULL').bind(owner.id, p, u.id)),
      ]);
      return ok(c, { id: res[0].meta.last_row_id });
    }
    case 'entry.delete': {
      await needPost(c);
      const u = await needReady(c), b = await readBody(req);
      const e = await DB.prepare('SELECT * FROM entries WHERE id = ?').bind(Number(b.id) || 0).first();
      if (!e || (u.role !== 'admin' && e.user_id !== u.id)) throw new ApiError('not_found', 'This entry no longer exists.', 404);
      const { results } = await DB.prepare('SELECT id FROM photos WHERE entry_id = ?').bind(e.id).all();
      await deletePhotos(c, results.map(r => r.id));
      await DB.prepare('DELETE FROM entries WHERE id = ?').bind(e.id).run();
      return ok(c);
    }

    /* ---------- photos ---------- */
    case 'photo.upload': {
      await needPost(c);
      const u = await needReady(c);
      let form; try { form = await req.formData(); } catch (_) { form = null; }
      const f = form && form.get('file');
      if (!f || typeof f === 'string') throw new ApiError('upload', 'The photo did not reach the server. Try again.');
      if (f.size > 4 * 1024 * 1024) throw new ApiError('too_large', 'The photo is too large.');
      // The page always sends a JPEG it re-drew itself; anything else is refused (the bytes are checked, not the name).
      const bytes = new Uint8Array(await f.arrayBuffer()), dim = jpegSize(bytes);
      if (!dim || dim.w > 5000 || dim.h > 5000 || !dim.w || !dim.h) throw new ApiError('unsupported', 'Only JPG photos can be saved.');
      // Keep at most 12 unsaved photos per account.
      const old = await DB.prepare('SELECT id FROM photos WHERE user_id = ? AND entry_id IS NULL ORDER BY created_at DESC').bind(u.id).all();
      await deletePhotos(c, old.results.slice(11).map(r => r.id));
      if (Math.random() < 0.05) await sweepPhotos(c);
      const id = randHex(16);
      await env.PHOTOS.put(photoKey(id), bytes, { httpMetadata: { contentType: 'image/jpeg' } });
      let lat = form.get('lat') === null || form.get('lat') === '' ? NaN : Number(form.get('lat'));
      let lng = form.get('lng') === null || form.get('lng') === '' ? NaN : Number(form.get('lng'));
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) { lat = null; lng = null; }
      const t = form.get('t'), taken = typeof t === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(t) ? t : null;
      const sr = form.get('src'), src = (sr === 'photo' || sr === 'device') && lat !== null ? sr : '';
      await DB.prepare('INSERT INTO photos (id, entry_id, user_id, lat, lng, taken, src, created_at) VALUES (?, NULL, ?, ?, ?, ?, ?, ?)').bind(id, u.id, lat, lng, taken, src, now()).run();
      return ok(c, { id });
    }
    case 'photo.discard': {
      await needPost(c);
      const u = await needReady(c), b = await readBody(req), id = typeof b.id === 'string' ? b.id : '';
      const r = await DB.prepare('SELECT 1 AS x FROM photos WHERE id = ? AND user_id = ? AND entry_id IS NULL').bind(id, u.id).first();
      if (r) await deletePhotos(c, [id]);
      return ok(c);
    }

    /* ---------- admin: sections and teacher IDs ---------- */
    case 'sections.save': {
      await needPost(c); await needAdmin(c);
      const b = await readBody(req), clean = {};
      for (const cls of Object.keys(CLASSES)) clean[cls] = cleanSecs(isObj(b.sections) ? b.sections[cls] : []);
      await DB.prepare("INSERT OR REPLACE INTO settings (k, v) VALUES ('sections', ?)").bind(JSON.stringify(clean)).run();
      return ok(c);
    }
    case 'user.create': {
      await needPost(c); await needAdmin(c);
      const b = await readBody(req), name = str(b.name, 60), username = str(b.username, 40).toLowerCase();
      if (!name) throw new ApiError('invalid', "Enter the teacher's name.");
      if (!USERNAME_RE.test(username)) throw new ApiError('invalid', 'The ID needs 3 to 30 characters: small letters, digits, dot, dash or underscore.');
      if (await DB.prepare('SELECT 1 AS x FROM users WHERE username = ?').bind(username).first()) throw new ApiError('taken', 'This ID is already in use. Choose another.');
      const temp = tempPassword();
      const r = await DB.prepare("INSERT INTO users (username, name, role, pass_hash, must_change, active, assign, created_at) VALUES (?, ?, 'teacher', ?, 1, 1, ?, ?)")
        .bind(username, name, await hashPw(temp), JSON.stringify(cleanAssign(b.assign)), now()).run();
      return ok(c, { user: userPublic(await findTeacher(c, r.meta.last_row_id), true), tempPassword: temp });
    }
    // Teachers on the school's list who have no ID yet.
    case 'seed.list': {
      await needAdmin(c);
      const have = new Set((await DB.prepare('SELECT username FROM users').all()).results.map(r => r.username));
      return ok(c, { teachers: seedList().filter(t => !have.has(t.username)).map(t => ({ name: t.name, username: t.username })) });
    }
    // Create an ID with a temporary password for each of them. The passwords go back to the admin once and are not kept.
    case 'seed.create': {
      await needPost(c); await needAdmin(c);
      const made = [];
      // Two per request keeps each request inside the free plan's CPU limit; the page asks again until none are left.
      for (const t of seedList()) {
        if (made.length >= 2) break;
        if (await DB.prepare('SELECT 1 AS x FROM users WHERE username = ?').bind(t.username).first()) continue;
        const temp = tempPassword();
        await DB.prepare("INSERT INTO users (username, name, role, pass_hash, must_change, active, assign, created_at) VALUES (?, ?, 'teacher', ?, 1, 1, ?, ?)")
          .bind(t.username, t.name, await hashPw(temp), JSON.stringify(t.assign), now()).run();
        made.push({ name: t.name, username: t.username, tempPassword: temp });
      }
      return ok(c, { created: made });
    }
    case 'user.update': {
      await needPost(c); await needAdmin(c);
      const b = await readBody(req), t = await findTeacher(c, b.id);
      const name = str(b.name ?? t.name, 60);
      if (!name) throw new ApiError('invalid', "Enter the teacher's name.");
      const active = 'active' in b ? (b.active ? 1 : 0) : t.active;
      const assign = 'assign' in b ? JSON.stringify(cleanAssign(b.assign)) : t.assign;
      // Deactivating signs the teacher out everywhere.
      const sv = t.sess_ver + (active ? 0 : 1);
      await DB.batch([
        DB.prepare('UPDATE users SET name = ?, active = ?, assign = ?, sess_ver = ? WHERE id = ?').bind(name, active, assign, sv, t.id),
        ...(active ? [] : [DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(t.id)]),
      ]);
      return ok(c, { user: userPublic(await findTeacher(c, t.id), true) });
    }
    case 'user.resetpw': {
      await needPost(c); await needAdmin(c);
      const b = await readBody(req), t = await findTeacher(c, b.id), temp = tempPassword();
      await DB.batch([
        DB.prepare('UPDATE users SET pass_hash = ?, must_change = 1, sess_ver = sess_ver + 1 WHERE id = ?').bind(await hashPw(temp), t.id),
        DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(t.id),
        DB.prepare("DELETE FROM login_attempts WHERE ukey LIKE ? ESCAPE '\\'").bind(t.username.replace(/[\\%_]/g, '\\$&') + '|%'),
      ]);
      return ok(c, { username: t.username, tempPassword: temp });
    }
    default:
      throw new ApiError('unknown', 'Unknown action.', 404);
  }
}

/* ---------- photo route: private, owner or admin only ---------- */
async function photo(c) {
  const u = await getUser(c);
  const id = new URL(c.req.url).searchParams.get('id') || '';
  const notFound = () => new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  if (!u || u.must_change) return new Response('Sign in again.', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (!PHOTO_ID.test(id)) return notFound();
  const row = await c.env.DB.prepare('SELECT user_id FROM photos WHERE id = ?').bind(id).first();
  if (!row || (u.role !== 'admin' && row.user_id !== u.id)) return notFound();
  const obj = await c.env.PHOTOS.get(photoKey(id));
  if (!obj) return notFound();
  return new Response(obj.body, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff' } });
}

/* ---------- first-run setup and admin password reset, guarded by the REGISTER_SETUP_KEY secret ---------- */
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
function setupPage({ installed, msg = '', bad = false, done = false, name = '', username = '', noKey = false }) {
  const body = noKey
    ? `<div class="notice bad"><strong>The setup code is not set on this deployment.</strong></div><p class="lede">Add a secret named REGISTER_SETUP_KEY (at least 12 characters) to the Worker, then reload this page.</p>`
    : done
      ? `<div class="notice">${esc(msg)}</div><p><a class="btn" href="/">Open the register</a></p>`
      : `<p class="lede">${installed ? 'Use this only if the admin password is lost. You need the setup code you saved as REGISTER_SETUP_KEY.' : 'This is done once. You create the admin ID here; teacher IDs are created later from inside the register.'}</p>
    ${msg ? `<div class="notice${bad ? ' bad' : ''}">${esc(msg)}</div>` : ''}
    <form method="post" action="/setup" autocomplete="off" class="auth-form">
      <div class="field"><label for="key">Setup code</label><input type="password" id="key" name="key" required maxlength="100" autocomplete="off"><span class="hint">The value of the REGISTER_SETUP_KEY secret.</span></div>
      ${installed ? '' : `<div class="field"><label for="name">Your name</label><input type="text" id="name" name="name" required maxlength="60" value="${esc(name)}"></div>`}
      <div class="field"><label for="username">Admin ID</label><input type="text" id="username" name="username" required maxlength="30" value="${esc(username)}" autocapitalize="none" autocomplete="off">${installed ? '' : '<span class="hint">Small letters and digits, for example srs.admin</span>'}</div>
      <div class="field"><label for="password">${installed ? 'New password' : 'Password'}</label><input type="password" id="password" name="password" required minlength="8" maxlength="100" autocomplete="new-password"><span class="hint">At least 8 characters. Do not reuse a password from another site.</span></div>
      <div class="field"><label for="password2">Repeat the password</label><input type="password" id="password2" name="password2" required minlength="8" maxlength="100" autocomplete="new-password"></div>
      <button class="btn" type="submit">${installed ? 'Change admin password' : 'Create admin and finish setup'}</button>
    </form>
    ${installed ? '<p><a href="/">Back to sign in</a></p>' : ''}`;
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Set up the Practical Register</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700&family=IBM+Plex+Mono:wght@400;500&family=Public+Sans:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="/assets/app.css"></head><body><div class="auth"><div class="auth-card" style="max-width:520px">
<p class="eyebrow">SRS Public School · Science labs</p><h1>${installed && !done ? 'Reset the admin password' : 'Set up the register'}</h1>${body}</div></div></body></html>`;
  return new Response(html, { status: bad ? 400 : 200, headers: {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'none'; form-action 'self'; frame-ancestors 'none'",
  } });
}
async function setup(c) {
  const { env, req } = c, installed = await adminExists(env), secret = env.REGISTER_SETUP_KEY;
  if (typeof secret !== 'string' || secret.length < 12) return setupPage({ installed, noKey: true });
  if (req.method !== 'POST') return setupPage({ installed });
  const form = await req.formData().catch(() => null);
  const get = k => { const v = form && form.get(k); return typeof v === 'string' ? v : ''; };
  const name = str(get('name'), 60), username = str(get('username'), 40).toLowerCase(), pw = get('password'), pw2 = get('password2');
  const fail = msg => setupPage({ installed, msg, bad: true, name, username });
  if (!safeEq(get('key').trim(), secret)) { await sleep(2000); return fail('The setup code is not correct.'); }
  if (!USERNAME_RE.test(username)) return fail('The admin ID needs 3 to 30 characters: small letters, digits, dot, dash or underscore.');
  if (pw.length < 8 || pw.length > 100) return fail('The password needs at least 8 characters.');
  if (pw !== pw2) return fail('The two passwords do not match.');
  if (pw.toLowerCase() === username) return fail('The password cannot be the same as the ID.');
  if (!installed) {
    if (!name) return fail('Enter your name.');
    await env.DB.prepare("INSERT INTO users (username, name, role, pass_hash, must_change, active, created_at) VALUES (?, ?, 'admin', ?, 0, 1, ?)").bind(username, name, await hashPw(pw), now()).run();
    return setupPage({ installed: true, done: true, msg: 'The register is ready. Sign in with the admin ID and password you just set.' });
  }
  // Already installed: this form resets the password of an existing admin ID.
  const id = await env.DB.prepare("SELECT id FROM users WHERE username = ? AND role = 'admin'").bind(username).first();
  if (!id) { await sleep(1000); return fail('There is no admin with this ID.'); }
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?, must_change = 0, active = 1, sess_ver = sess_ver + 1 WHERE id = ?').bind(await hashPw(pw), id.id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(id.id),
    env.DB.prepare('DELETE FROM login_attempts'),
  ]);
  return setupPage({ installed: true, done: true, msg: 'The admin password is changed. Sign in with the new password.' });
}

export default {
  async fetch(req, env, ctx) {
    PEPPER = typeof env.REGISTER_SETUP_KEY === 'string' ? env.REGISTER_SETUP_KEY : '';
    const url = new URL(req.url), c = { req, env, ctx, cookie: '' };
    try {
      if (url.pathname === '/api') {
        if (PEPPER.length < 12) throw new ApiError('config', 'The register is not configured: the REGISTER_SETUP_KEY secret is missing.', 503);
        return await api(c);
      }
      if (url.pathname === '/photo') return await photo(c);
      if (url.pathname === '/setup') return await setup(c);
      return await env.ASSETS.fetch(req);
    } catch (e) {
      if (e instanceof ApiError) return reply(c, { ok: false, code: e.code, message: e.message }, e.status);
      console.error('practical-register:', e && e.stack || e);
      return reply(c, { ok: false, code: 'server', message: 'The server had a problem. Try again in a minute.' }, 500);
    }
  },
};
