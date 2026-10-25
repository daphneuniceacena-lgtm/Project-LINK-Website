/* ════════════════════════════════════════════════════════════════════
   PROJECT LINK — Cloudflare Worker Backend  (security-hardened)
   Lasallian Information and Knowledge System (HSSC Portal) S.Y 2026-2027

   Storage:
     - D1 database  (binding: DB)       users, posts, concerns, ...
     - R2 bucket    (binding: UPLOADS)  uploaded files

   Routes:
     GET  /?action=...          public, read-only actions
     POST /  {action:...}       everything else (login, writes, staff reads)
     GET  /file/:key            serves uploaded files from R2

   What changed vs. the first version (see SECURITY notes in the README):
     • Passwords are hashed (PBKDF2-SHA256, per-user salt). Old plaintext
       rows are upgraded automatically the first time that user logs in.
     • Login returns a random session token (stored hashed, expires in 8 h).
       The browser no longer sends the password with every request.
     • Login moved from GET (password in the URL) to POST.
     • CORS is limited to your own site instead of "*".
     • Public endpoints no longer leak student emails/numbers/evaluations.
     • Every write is validated (lengths, allowed values, URL shapes).
     • Uploads: type allow-list + magic-byte check + size cap, unguessable
       file names, and files are served with nosniff / sandbox headers.
     • Atomic rate limiter, safe error messages, no more open signup.
   ════════════════════════════════════════════════════════════════════ */

/* ── CORS: ONLY these sites may call the API from a browser ─────────
   Add your custom domain here if you attach one to the Pages project.
   (CORS is not authentication — it just stops *other websites* from
   reading API responses in a visitor's browser.)                      */
const ALLOWED_ORIGINS = [
  'https://project-link.pages.dev',
  'https://dlsudhssc.online',
  'http://localhost:8788',   // wrangler pages dev
  'http://127.0.0.1:8788',
  'http://localhost:5500',   // VS Code Live Server
  'http://127.0.0.1:5500',
];
// Cloudflare Pages preview deployments: https://<hash>.project-link.pages.dev
const ALLOWED_ORIGIN_PATTERNS = [/^https:\/\/[a-z0-9-]+\.project-link\.pages\.dev$/];

const SESSION_TTL_SEC = 8 * 60 * 60;          // staff sessions last 8 hours
const PBKDF2_ITERATIONS = 100000;             // Workers' WebCrypto maximum
const MAX_JSON_BYTES = 1_000_000;             // any non-upload request
const MAX_UPLOAD_JSON_BYTES = 28_000_000;     // uploadFile (base64 of ≤ 20 MB)
const DEFAULT_PASSWORDS = ['changeme123', 'admin123', 'council123', 'password', 'password123', '12345678'];

const SLOT_TIMES = ['7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'];
const CONCERN_CATEGORIES = ['Academic', 'Facilities', 'Student Welfare', 'Activities & Events', 'Administrative', 'Other'];
const URGENCY_LEVELS = ['Low', 'Medium', 'High'];

/* ────────────────────────────────────────────────────────────────────
   RESPONSE HELPERS
──────────────────────────────────────────────────────────────────── */
function isAllowedOrigin(origin) {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGIN_PATTERNS.some(re => re.test(origin));
}

function baseHeaders(request) {
  const h = new Headers({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Strict-Transport-Security': 'max-age=31536000',
    'Vary': 'Origin',
  });
  const origin = request.headers.get('Origin');
  if (isAllowedOrigin(origin)) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Content-Type');
    h.set('Access-Control-Max-Age', '86400');
  }
  return h;
}

function jsonResponse(request, obj, status) {
  // `status` on a result object is an internal hint (401 / 429 ...). It is
  // stripped before sending so response shapes stay the same for the frontend.
  let code = status || 200;
  if (obj && obj.status) { code = obj.status; obj = { ...obj }; delete obj.status; }
  const h = baseHeaders(request);
  h.set('Content-Type', 'application/json');
  h.set('Cache-Control', 'no-store');
  return new Response(JSON.stringify(obj), { status: code, headers: h });
}

const fail = (error, status, extra) => ({ ok: false, error, ...(status ? { status } : {}), ...(extra || {}) });

/* ────────────────────────────────────────────────────────────────────
   SMALL VALIDATION / CRYPTO HELPERS
──────────────────────────────────────────────────────────────────── */
// Trim, drop control characters, cap the length. Always returns a string.
function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

function isHttpUrl(u, max = 2048) {
  if (typeof u !== 'string' || !u || u.length > max) return false;
  try { const p = new URL(u).protocol; return p === 'https:' || p === 'http:'; } catch { return false; }
}

function randomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Date.now() + '-' + Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

function toB64(bytes) { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); }
function fromB64(str) { const bin = atob(str); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function toHex(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); }

async function sha256(str) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)));
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

async function makePasswordHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

// Returns { ok, upgrade }.  `upgrade` = stored value was legacy plaintext and
// the caller should re-save it hashed.
async function verifyPassword(stored, supplied) {
  stored = String(stored == null ? '' : stored);
  supplied = String(supplied == null ? '' : supplied);
  if (stored.startsWith('pbkdf2$')) {
    const [, iter, saltB64, hashB64] = stored.split('$');
    try {
      const calc = await pbkdf2(supplied, fromB64(saltB64), parseInt(iter, 10) || PBKDF2_ITERATIONS);
      return { ok: timingSafeEqual(calc, fromB64(hashB64)), upgrade: false };
    } catch { return { ok: false, upgrade: false }; }
  }
  // Legacy plaintext row (from the first deployment / manual SQL edits).
  const ok = timingSafeEqual(await sha256(stored), await sha256(supplied));
  return { ok, upgrade: ok };
}

// Burn roughly the same CPU time as a real check so "unknown user" and
// "wrong password" are indistinguishable by response time.
async function dummyPasswordWork(supplied) {
  await pbkdf2(String(supplied || ''), new Uint8Array(16), PBKDF2_ITERATIONS);
}

function passwordProblem(pw, username) {
  if (typeof pw !== 'string' || pw.length < 8) return 'Password must be at least 8 characters.';
  if (pw.length > 200) return 'Password is too long.';
  if (DEFAULT_PASSWORDS.includes(pw.toLowerCase())) return 'That password is too common. Please choose another.';
  if (username && pw.toLowerCase() === String(username).toLowerCase()) return 'Password cannot be the same as your username.';
  return null;
}

function formatDateMDY(value) {
  if (!value && value !== 0) return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{2}-\d{2}-\d{4})/);
    if (m) return m[1];
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}-${d.getFullYear()}`;
}

/* ────────────────────────────────────────────────────────────────────
   TABLES THAT ARE CREATED ON FIRST USE (so a missed schema.sql run
   can't break login)
──────────────────────────────────────────────────────────────────── */
let tablesReady = false;
async function ensureTables(env) {
  if (tablesReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS rate_limits (k TEXT PRIMARY KEY, count INTEGER NOT NULL, window_start INTEGER NOT NULL)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS post_likes (post_id TEXT NOT NULL, voter TEXT NOT NULL, created_at INTEGER DEFAULT (unixepoch()), PRIMARY KEY (post_id, voter))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(username)'),
  ]);
  // One-time column additions for databases created before archiving and
  // profile pictures existed. SQLite has no "ADD COLUMN IF NOT EXISTS", so a
  // "duplicate column" error simply means the column is already there.
  for (const sql of [
    'ALTER TABLE concerns ADD COLUMN archived INTEGER DEFAULT 0',
    'ALTER TABLE appointments ADD COLUMN archived INTEGER DEFAULT 0',
    "ALTER TABLE users ADD COLUMN avatar TEXT DEFAULT ''",
  ]) {
    try { await env.DB.prepare(sql).run(); }
    catch (e) { if (!/duplicate column/i.test(String(e && e.message))) console.warn('migration skipped:', sql, e && e.message); }
  }

  // Lasallian Insights events (managed by the Council). The four original
  // events are seeded only when the table is first created, so deleting one
  // later never brings it back.
  const hadEvents = await env.DB.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='events'").first();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS events (
       id TEXT PRIMARY KEY, label TEXT NOT NULL, description TEXT DEFAULT '', link TEXT DEFAULT '',
       qr TEXT DEFAULT '', archived INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0,
       created_at INTEGER DEFAULT (unixepoch()))`
  ).run();
  if (!hadEvents) {
    const seed = [
      ['greenify', 'GREENIFY! 2026', 'The official welcoming program for incoming Lasallians of De La Salle University–Dasmariñas. Held from June 24–26, 2026, this three-day celebration aims to introduce new students to the Lasallian community, culture, values, traditions, and campus life as they begin their academic journey.'],
      ['pasinaya', 'PASINAYA', ''],
      ['siyasat', 'SIYASAT', ''],
      ['pattaraday', 'PATTARADAY', ''],
    ];
    await env.DB.batch(seed.map(([id, label, desc], i) =>
      env.DB.prepare('INSERT OR IGNORE INTO events (id, label, description, sort_order) VALUES (?,?,?,?)').bind(id, label, desc, i)));
  }

  // Guidance counselors (managed by the SWC). Seeded once from the original
  // five, carrying over any photo/description the SWC already saved in the
  // old "team" table under type 'adviser'.
  const hadCounselors = await env.DB.prepare("SELECT 1 AS x FROM sqlite_master WHERE type='table' AND name='counselors'").first();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS counselors (
       id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT DEFAULT '', photo TEXT DEFAULT '',
       description TEXT DEFAULT '', sort_order INTEGER DEFAULT 0,
       updated_by TEXT DEFAULT '', created_at INTEGER DEFAULT (unixepoch()))`
  ).run();
  if (!hadCounselors) {
    const seed = [
      ['LE', 'Ms. Lizzette C. Elago, RGC, RPM', 'lcelago@hs.dlsud.edu.ph'],
      ['CG', 'Ms. Clarisse May E. Gubatan, MAED, CHRA', 'cegubatan@hs.dlsud.edu.ph'],
      ['MS', 'Ms. Mary Ann C. Salinas, RGC, RPM', 'mcsalinas@hs.dlsud.edu.ph'],
      ['JJ', 'Ms. Jhade Jen A. Jacinto, LPT', 'jajacinto@hs.dlsud.edu.ph'],
      ['AL', 'Ms. Analyn P. Lontoc, RPM', 'aplontoc@hs.dlsud.edu.ph'],
    ];
    let hasTeam = true;
    try { await env.DB.prepare('SELECT 1 FROM team LIMIT 1').first(); } catch { hasTeam = false; }
    await env.DB.batch(seed.map(([id, name, email], i) => hasTeam
      ? env.DB.prepare(
          `INSERT OR IGNORE INTO counselors (id, name, email, photo, description, sort_order)
           VALUES (?,?,?, COALESCE((SELECT photo FROM team WHERE type='adviser' AND key=?), ''),
                          COALESCE((SELECT description FROM team WHERE type='adviser' AND key=?), ''), ?)`
        ).bind(id, name, email, id, id, i)
      : env.DB.prepare('INSERT OR IGNORE INTO counselors (id, name, email, sort_order) VALUES (?,?,?,?)').bind(id, name, email, i)));
  }

  // Simple key/value store for editable page content ("About SWC").
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS site_content (
       k TEXT PRIMARY KEY, value TEXT DEFAULT '', updated_by TEXT DEFAULT '', updated_at TEXT)`
  ).run();

  // Dates / time slots the SWC has marked unavailable. time = '' means the whole day.
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS unavailable_slots (
       id TEXT PRIMARY KEY, date TEXT NOT NULL, time TEXT NOT NULL DEFAULT '',
       reason TEXT DEFAULT '', created_by TEXT DEFAULT '', created_at INTEGER DEFAULT (unixepoch()))`
  ).run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS uq_unavailable_date_time ON unavailable_slots(date, time)').run();

  // Hard guarantee against double-booking even under a race. Archived
  // appointments no longer hold a slot. If old data already contains
  // duplicates this fails harmlessly and the app-level check in
  // handleBookAppointment still applies.
  try {
    await env.DB.prepare('DROP INDEX IF EXISTS uq_active_slot').run();
    await env.DB.prepare(
      `CREATE UNIQUE INDEX IF NOT EXISTS uq_active_slot_v2 ON appointments(date, time) WHERE status IN ('Booked','Pending') AND archived = 0`
    ).run();
  } catch (e) { console.warn('uq_active_slot_v2 not created:', e && e.message); }
  tablesReady = true;
}

/* ────────────────────────────────────────────────────────────────────
   RATE LIMITING  (atomic fixed-window counter in D1)
──────────────────────────────────────────────────────────────────── */
async function rateLimit(env, request, bucket, limit, windowSec, extra, failClosed) {
  try {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = `${bucket}:${ip}${extra ? ':' + String(extra).toLowerCase().slice(0, 64) : ''}`;
    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare(
      `INSERT INTO rate_limits (k, count, window_start) VALUES (?1, 1, ?2)
       ON CONFLICT(k) DO UPDATE SET
         count = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END
       RETURNING count, window_start`
    ).bind(key, now, windowSec).first();
    if (row && row.count > limit) {
      const wait = Math.max(1, windowSec - (now - row.window_start));
      return fail(`Too many requests. Please try again in ${Math.ceil(wait / 60)} minute(s).`, 429);
    }
    return null;
  } catch (e) {
    console.error('rateLimit error', e && e.message);
    return failClosed ? fail('Service is busy. Please try again shortly.', 503) : null;
  }
}

/* ────────────────────────────────────────────────────────────────────
   SESSIONS + ROLE CHECKS
   The browser keeps the session token in memory and sends it as
   `authToken` in the POST body. Role is looked up from the users table on
   every request, so demoting/removing a user takes effect immediately.
──────────────────────────────────────────────────────────────────── */
async function createSession(env, username) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = toHex(await sha256(token));
  const now = Math.floor(Date.now() / 1000);
  await env.DB.prepare('INSERT INTO sessions (token_hash, username, created_at, expires_at) VALUES (?,?,?,?)')
    .bind(hash, username, now, now + SESSION_TTL_SEC).run();
  return token;
}

async function getSessionUser(b, env) {
  const token = b && typeof b.authToken === 'string' ? b.authToken : '';
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = toHex(await sha256(token));
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare(
    `SELECT u.username, u.role, u.name, u.avatar FROM sessions s
       JOIN users u ON lower(u.username) = lower(s.username)
      WHERE s.token_hash = ? AND s.expires_at > ?`
  ).bind(hash, now).first();
  if (!row) return null;
  const role = String(row.role).toLowerCase();
  if (role !== 'council' && role !== 'admin') return null;
  return { username: row.username, role, name: row.name || row.username, avatar: row.avatar || '', tokenHash: hash };
}

// -> { user } on success, { error } (a ready-to-return result) on failure.
async function authorize(b, env, roles) {
  const user = await getSessionUser(b, env);
  if (!user || !roles.includes(user.role)) {
    return { error: fail('unauthorized', 401, { message: 'Your session expired or your account is not allowed to do this.' }) };
  }
  return { user };
}

/* ────────────────────────────────────────────────────────────────────
   ENTRY POINT
──────────────────────────────────────────────────────────────────── */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      const h = baseHeaders(request);
      return new Response(null, { status: h.has('Access-Control-Allow-Origin') ? 204 : 403, headers: h });
    }

    try {
      if (url.pathname.startsWith('/file/')) {
        if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
        return await serveFile(url.pathname.slice('/file/'.length), env, request);
      }

      await ensureTables(env);

      let result;
      if (request.method === 'GET') {
        const action = url.searchParams.get('action');
        const params = Object.fromEntries(url.searchParams.entries());
        result = await handleGet(action, params, env, request);
      } else if (request.method === 'POST') {
        const raw = await request.text();
        if (raw.length > MAX_UPLOAD_JSON_BYTES) return jsonResponse(request, fail('Request too large.', 413));
        let body;
        try { body = raw ? JSON.parse(raw) : {}; } catch { return jsonResponse(request, fail('Invalid request.', 400)); }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return jsonResponse(request, fail('Invalid request.', 400));
        if (body.action !== 'uploadFile' && raw.length > MAX_JSON_BYTES) return jsonResponse(request, fail('Request too large.', 413));
        result = await handlePost(body.action, body, env, url, request);
      } else {
        result = fail('Unsupported method', 405);
      }
      return jsonResponse(request, result);
    } catch (err) {
      console.error('Unhandled error:', err && err.stack || err);
      return jsonResponse(request, fail('Something went wrong. Please try again.', 500));
    }
  },
};

/* ────────────────────────────────────────────────────────────────────
   ROUTERS
──────────────────────────────────────────────────────────────────── */
async function handleGet(action, params, env, request) {
  switch (action) {
    case 'getPosts':          return handleGetPosts(params, env);
    case 'getConcerns':       return handleGetConcerns({}, env);        // public view only
    case 'getEvals':          return { ok: true, evals: [] };           // staff use POST
    case 'getAppointments':   return handleGetAppointments({}, env);    // slots only (no personal data)
    case 'getCarouselSlides': return handleGetCarouselSlides(env);
    case 'getResources':      return handleGetResources(env);
    case 'getTeam':           return handleGetTeam(env);
    case 'getCounselors':     return handleGetCounselors(env);
    case 'getAbout':          return handleGetAbout(env);
    case 'getEvents':         return handleGetEvents({}, env);          // public view only (no archived)
    case 'login':             return fail('Login must use POST.', 405);
    default:                  return fail('Unknown action.', 400);
  }
}

async function handlePost(action, body, env, url, request) {
  switch (action) {
    case 'login':               return handleLogin(body, env, request);
    case 'logout':              return handleLogout(body, env);
    case 'changePassword':      return handleChangePassword(body, env, request);
    case 'updateProfile':       return handleUpdateProfile(body, env, request, url);
    case 'signup':              return fail('Self-signup is disabled.', 403);
    case 'addPost':             return handleAddPost(body, env);
    case 'deletePost':          return handleDeletePost(body, env);
    case 'toggleLike':          return handleToggleLike(body, env, request);
    case 'getConcerns':         return handleGetConcerns(body, env);      // staff view when token is valid
    case 'submitConcern':       return handleSubmitConcern(body, env, request, url);
    case 'reviewConcern':       return handleSetConcernStatus(body, env, 'Reviewed');
    case 'resolveConcern':      return handleSetConcernStatus(body, env, 'Resolved');
    case 'archiveConcern':      return handleArchiveRow(body, env, 'concerns', 1, ['council']);
    case 'restoreConcern':      return handleArchiveRow(body, env, 'concerns', 0, ['council']);
    case 'deleteConcern':       return handleDeleteConcern(body, env);
    case 'archiveAppointment':  return handleArchiveRow(body, env, 'appointments', 1, ['admin']);
    case 'restoreAppointment':  return handleArchiveRow(body, env, 'appointments', 0, ['admin']);
    case 'deleteAppointment':   return handleDeleteAppointment(body, env);
    case 'getEvents':           return handleGetEvents(body, env);        // council view (incl. archived) when token is valid
    case 'addEvent':            return handleSaveEvent(body, env, url, true);
    case 'updateEvent':         return handleSaveEvent(body, env, url, false);
    case 'archiveEvent':        return handleArchiveRow(body, env, 'events', 1, ['council']);
    case 'restoreEvent':        return handleArchiveRow(body, env, 'events', 0, ['council']);
    case 'deleteEvent':         return handleDeleteEvent(body, env);
    case 'getEvals':            return handleGetEvals(body, env);
    case 'getAppointments':     return handleGetAppointments(body, env);
    case 'bookAppointment':     return handleBookAppointment(body, env, request);
    case 'uploadFile':          return handleUploadFile(body, env, url, request);
    case 'addCarouselSlide':    return handleAddCarouselSlide(body, env);
    case 'clearCarouselSlides': return handleClearCarouselSlides(body, env);
    case 'addResource':         return handleAddResource(body, env);
    case 'deleteResource':      return handleDeleteResource(body, env);
    case 'saveTeamMember':      return handleSaveTeamMember(body, env);
    case 'getCounselors':       return handleGetCounselors(env);
    case 'saveCounselor':       return handleSaveCounselor(body, env, url);
    case 'deleteCounselor':     return handleDeleteCounselor(body, env);
    case 'getAbout':            return handleGetAbout(env);
    case 'saveAbout':           return handleSaveAbout(body, env);
    case 'addUnavailable':      return handleAddUnavailable(body, env);
    case 'removeUnavailable':   return handleRemoveUnavailable(body, env);
    case 'submitEval':          return handleSubmitEval(body, env, request);
    default:                    return fail('Unknown action.', 400);
  }
}

/* ────────────────────────────────────────────────────────────────────
   AUTH
──────────────────────────────────────────────────────────────────── */
async function handleLogin(b, env, request) {
  const username = clean(b.username, 64);
  const password = typeof b.password === 'string' ? b.password : '';
  if (!username || !password || password.length > 200) return fail('Invalid username or password.');

  // Two limits: per (IP + username) to stop guessing one account, and per IP
  // to stop one machine cycling through many usernames.
  const limited = await rateLimit(env, request, 'login', 8, 15 * 60, username, true)
    || await rateLimit(env, request, 'login-ip', 40, 15 * 60, '', true);
  if (limited) return limited;

  const row = await env.DB.prepare('SELECT username, password, role, name, initial, avatar FROM users WHERE lower(username) = lower(?)')
    .bind(username).first();
  if (!row) { await dummyPasswordWork(password); return fail('Invalid username or password.'); }

  const check = await verifyPassword(row.password, password);
  if (!check.ok) return fail('Invalid username or password.');

  const role = String(row.role).toLowerCase();
  if (role !== 'council' && role !== 'admin') return fail('Invalid username or password.');

  if (DEFAULT_PASSWORDS.includes(password.toLowerCase())) {
    return fail('This account still uses a default password. Set a new one first (see README → "Setting staff passwords").');
  }

  if (check.upgrade) {
    // First login since hashing was introduced: replace the plaintext with a hash.
    const hashed = await makePasswordHash(password);
    await env.DB.prepare('UPDATE users SET password = ? WHERE username = ?').bind(hashed, row.username).run();
  }

  const now = Math.floor(Date.now() / 1000);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 86400),
  ]);
  const token = await createSession(env, row.username);
  return {
    ok: true,
    token,
    expiresIn: SESSION_TTL_SEC,
    username: row.username,
    role,
    name: row.name,
    initial: row.initial || String(row.name || '').charAt(0),
    avatar: row.avatar || '',
  };
}

async function handleLogout(b, env) {
  const user = await getSessionUser(b, env);
  if (user) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.tokenHash).run();
  return { ok: true };
}

async function handleChangePassword(b, env, request) {
  const { user, error } = await authorize(b, env, ['council', 'admin']);
  if (error) return error;
  const limited = await rateLimit(env, request, 'chpw', 6, 15 * 60, user.username, true);
  if (limited) return limited;

  const row = await env.DB.prepare('SELECT password FROM users WHERE username = ?').bind(user.username).first();
  const check = row ? await verifyPassword(row.password, b.currentPassword) : { ok: false };
  if (!check.ok) return fail('Current password is incorrect.');
  const problem = passwordProblem(b.newPassword, user.username);
  if (problem) return fail(problem);

  const hashed = await makePasswordHash(b.newPassword);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password = ? WHERE username = ?').bind(hashed, user.username),
    // Sign out every other device that was using this account.
    env.DB.prepare('DELETE FROM sessions WHERE lower(username) = lower(?) AND token_hash != ?').bind(user.username, user.tokenHash),
  ]);
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────
   ANNOUNCEMENTS / POSTS
──────────────────────────────────────────────────────────────────── */
const VOTER_RE = /^[A-Za-z0-9_-]{8,64}$/;

async function handleGetPosts(params, env) {
  const { results } = await env.DB.prepare('SELECT * FROM posts ORDER BY created_at DESC, id DESC').all();
  const counts = {};
  (await env.DB.prepare('SELECT post_id, COUNT(*) AS c FROM post_likes GROUP BY post_id').all())
    .results.forEach(r => { counts[r.post_id] = Number(r.c); });
  const mine = new Set();
  const voter = params && params.voter;
  if (voter && VOTER_RE.test(String(voter))) {
    (await env.DB.prepare('SELECT post_id FROM post_likes WHERE voter = ?').bind(String(voter)).all())
      .results.forEach(r => mine.add(r.post_id));
  }
  const posts = results.map(p => {
    let mediaUrls = [];
    const raw = String(p.media_urls || '').trim();
    if (raw) {
      try { mediaUrls = JSON.parse(raw); } catch (e) { mediaUrls = raw.split(',').map(s => s.trim()).filter(Boolean); }
    }
    return {
      id: p.id, author: p.author, initial: p.initial, role: p.role, org: p.org,
      time: p.time, badge: p.badge, heading: p.heading, text: p.text,
      mediaUrls, videoUrl: p.video_url || '', imgLayout: p.img_layout || 'auto',
      avatarPic: p.avatar_pic || '',
      likes: (Number(p.likes) || 0) + (counts[p.id] || 0),
      likedByMe: mine.has(p.id),
    };
  });
  return { ok: true, posts };
}

// Like / unlike. Rate limited per device and (more loosely) per IP.
async function handleToggleLike(b, env, request) {
  const voter = String(b.voter || '');
  if (!VOTER_RE.test(voter)) return fail('Invalid voter ID.');
  const limited = await rateLimit(env, request, 'like', 30, 10 * 60, voter)
    || await rateLimit(env, request, 'like-ip', 1000, 10 * 60);
  if (limited) return limited;
  const postId = String(b.postId || '');
  const post = await env.DB.prepare('SELECT id, likes FROM posts WHERE id = ?').bind(postId).first();
  if (!post) return fail('Post not found.');
  const existing = await env.DB.prepare('SELECT 1 AS x FROM post_likes WHERE post_id = ? AND voter = ?').bind(postId, voter).first();
  let liked;
  if (existing) {
    await env.DB.prepare('DELETE FROM post_likes WHERE post_id = ? AND voter = ?').bind(postId, voter).run();
    liked = false;
  } else {
    await env.DB.prepare('INSERT OR IGNORE INTO post_likes (post_id, voter) VALUES (?,?)').bind(postId, voter).run();
    liked = true;
  }
  const c = await env.DB.prepare('SELECT COUNT(*) AS c FROM post_likes WHERE post_id = ?').bind(postId).first();
  return { ok: true, liked, likes: (Number(post.likes) || 0) + Number(c.c) };
}

async function handleAddPost(b, env) {
  const { user, error } = await authorize(b, env, ['council']);
  if (error) return error;

  let media = b.mediaUrls;
  if (typeof media === 'string') { try { media = JSON.parse(media); } catch { media = []; } }
  if (!Array.isArray(media)) media = [];
  media = media.filter(u => isHttpUrl(u)).slice(0, 20);

  const heading = clean(b.heading, 200);
  const text = clean(b.text, 5000);
  if (!heading && !text && !media.length && !b.videoUrl) return fail('Please write something or attach media.');

  const videoUrl = /^https:\/\/www\.youtube\.com\/embed\/[A-Za-z0-9_-]{11}$/.test(String(b.videoUrl || '')) ? b.videoUrl : '';
  const imgLayout = ['auto', '1', '2', '3'].includes(String(b.imgLayout)) ? String(b.imgLayout) : 'auto';
  // The author's picture always comes from their account, never from the request.
  const avatarPic = isHttpUrl(user.avatar) ? user.avatar : '';
  const id = ID_RE.test(String(b.id || '')) ? String(b.id) : String(Date.now());

  await env.DB.prepare(
    `INSERT INTO posts (id, author, initial, role, org, time, badge, heading, text, media_urls, video_url, img_layout, avatar_pic, likes)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, user.name, String(user.name).charAt(0).toUpperCase(), user.role,
    clean(b.org, 120) || 'De La Salle University – Dasmariñas',
    clean(b.time, 60) || new Date().toISOString(), clean(b.badge, 30) || 'announcement',
    heading, text, JSON.stringify(media), videoUrl, imgLayout, avatarPic, 0
  ).run();
  return { ok: true, id };
}

async function handleDeletePost(b, env) {
  const { error } = await authorize(b, env, ['council']);
  if (error) return error;
  const id = String(b.id || '');
  if (!ID_RE.test(id)) return fail('Invalid post ID.');
  const res = await env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  await env.DB.prepare('DELETE FROM post_likes WHERE post_id = ?').bind(id).run();
  if (res.meta.changes === 0) return fail('Post not found.');
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────
   ANIMO VOICE / CONCERNS
──────────────────────────────────────────────────────────────────── */
function maskStudentNo(sn) {
  const s = String(sn || '');
  return s.length > 4 ? s.slice(0, 4) + '*'.repeat(s.length - 4) : s;
}

// Council (valid session) gets everything. Everyone else only gets concerns
// the Council already reviewed, with the student number masked and without
// attachments or account info — even if someone calls the API directly.
async function handleGetConcerns(b, env) {
  const staff = await getSessionUser(b, env);
  const isCouncil = !!staff && staff.role === 'council';
  const { results } = await env.DB.prepare('SELECT * FROM concerns ORDER BY created_at DESC').all();
  const rows = isCouncil ? results : results.filter(c => ['Reviewed', 'Resolved'].includes(c.status) && !c.archived);
  const concerns = rows.map(c => {
    const anonymous = String(c.anonymous).toLowerCase() === 'yes';
    return {
      id: c.id, date: formatDateMDY(c.date),
      studentNo: isCouncil ? (c.student_no || '') : maskStudentNo(c.student_no),
      name: anonymous ? 'Anonymous' : c.name,
      cat: c.category, urgency: c.urgency, body: c.concern,
      fileUrl: isCouncil ? c.file_url : '',
      anonymous, status: c.status || 'Received', user: '', archived: !!c.archived,
    };
  });
  return { ok: true, concerns, scope: isCouncil ? 'council' : 'public' };
}

async function handleSubmitConcern(b, env, request, url) {
  const limited = await rateLimit(env, request, 'concern', 30, 60 * 60);
  if (limited) return limited;

  const studentNo = clean(b.studentNo, 30);
  const category = clean(b.category, 60);
  const urgency = clean(b.urgency, 10) || 'Low';
  const concern = clean(b.concern, 1500);
  const anonymous = b.anonymous === true || b.anonymous === 'true' || b.anonymous === 'Yes';
  if (!studentNo) return fail('Please enter your student number.');
  if (!CONCERN_CATEGORIES.includes(category)) return fail('Please choose a valid category.');
  if (!URGENCY_LEVELS.includes(urgency)) return fail('Please choose a valid urgency level.');
  if (!concern) return fail('Please describe your concern.');

  // An attachment must be a file that THIS Worker stored (no outside links
  // that a Council member could be tricked into opening).
  let fileUrl = '';
  if (b.fileUrl) {
    try {
      const f = new URL(String(b.fileUrl));
      if (f.origin === url.origin && f.pathname.startsWith('/file/')) fileUrl = f.href;
      else return fail('Invalid attachment.');
    } catch { return fail('Invalid attachment.'); }
  }

  const id = randomId();
  await env.DB.prepare(
    `INSERT INTO concerns (id, date, student_no, name, category, urgency, concern, file_url, anonymous, status, user)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    id, formatDateMDY(Date.now()), studentNo, anonymous ? 'Anonymous' : (clean(b.name, 100) || 'Anonymous'),
    category, urgency, concern, fileUrl, anonymous ? 'Yes' : 'No', 'Received', ''
  ).run();
  return { ok: true, id };
}

async function handleSetConcernStatus(b, env, status) {
  const { error } = await authorize(b, env, ['council']);
  if (error) return error;
  const res = await env.DB.prepare('UPDATE concerns SET status = ? WHERE id = ?').bind(status, String(b.id || '')).run();
  if (res.meta.changes === 0) return fail('Concern ID not found.');
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────
   ARCHIVE / RESTORE / DELETE  (concerns, appointments, events)
   `table` only ever comes from the router above, never from the request.
   Archived rows are hidden from the public site but kept in the database
   and can be restored. Delete is permanent.
──────────────────────────────────────────────────────────────────── */
const ARCHIVABLE_TABLES = ['concerns', 'appointments', 'events'];

async function handleArchiveRow(b, env, table, archived, roles) {
  if (!ARCHIVABLE_TABLES.includes(table)) return fail('Invalid request.', 400);
  const { error } = await authorize(b, env, roles);
  if (error) return error;
  const id = String(b.id || '');
  if (!ID_RE.test(id)) return fail('Invalid ID.');
  try {
    const res = await env.DB.prepare(`UPDATE ${table} SET archived = ? WHERE id = ?`).bind(archived, id).run();
    if (res.meta.changes === 0) return fail('Item not found.');
  } catch (e) {
    // Restoring an appointment whose slot was re-booked in the meantime.
    if (/UNIQUE/i.test(String(e && e.message))) return fail('That time slot has been booked by someone else, so this appointment cannot be restored.');
    throw e;
  }
  return { ok: true };
}

// Best-effort removal of a file this Worker stored in R2 (never throws).
async function deleteOwnFile(env, fileUrl) {
  try {
    if (!fileUrl) return;
    const p = new URL(String(fileUrl)).pathname;
    if (!p.startsWith('/file/')) return;
    const key = decodeURIComponent(p.slice('/file/'.length));
    if (/^[A-Za-z0-9._-]{1,200}$/.test(key)) await env.UPLOADS.delete(key);
  } catch (e) { console.warn('deleteOwnFile failed:', e && e.message); }
}

async function handleDeleteConcern(b, env) {
  const { error } = await authorize(b, env, ['council']);
  if (error) return error;
  const id = String(b.id || '');
  if (!ID_RE.test(id)) return fail('Invalid ID.');
  const row = await env.DB.prepare('SELECT file_url FROM concerns WHERE id = ?').bind(id).first();
  if (!row) return fail('Concern ID not found.');
  await env.DB.prepare('DELETE FROM concerns WHERE id = ?').bind(id).run();
  await deleteOwnFile(env, row.file_url);
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────
   LASALLIAN INSIGHTS / EVALUATIONS  (staff only — contains names/comments)
──────────────────────────────────────────────────────────────────── */
async function handleGetEvals(b, env) {
  const { error } = await authorize(b, env, ['council', 'admin']);
  if (error) return error;
  const { results } = await env.DB.prepare('SELECT * FROM evals ORDER BY id DESC').all();
  const evals = results.map(ev => ({
    date: formatDateMDY(ev.timestamp), event: ev.event, rating: ev.rating,
    enjoyed: ev.enjoyed, improvement: ev.improvement, comment: ev.comment, by: ev.name,
  }));
  return { ok: true, evals };
}

async function handleSubmitEval(b, env, request) {
  const limited = await rateLimit(env, request, 'eval', 30, 60 * 60);
  if (limited) return limited;
  await env.DB.prepare(
    `INSERT INTO evals (timestamp, event, rating, enjoyed, improvement, comment, name)
     VALUES (?,?,?,?,?,?,?)`
  ).bind(
    new Date().toISOString(), clean(b.event, 80), clean(b.rating, 10),
    clean(b.enjoyed, 1000), clean(b.improvement, 1000), clean(b.comment, 1000), clean(b.name, 100)
  ).run();
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────
   SW CARE DESK / APPOINTMENTS
──────────────────────────────────────────────────────────────────── */
// Public callers get ONLY which slots are taken. The admin (SWC) gets the
// full records. Date is returned exactly as stored (ISO "YYYY-MM-DD") because
// the calendar uses it as a lookup key.
async function handleGetAppointments(b, env) {
  const staff = await getSessionUser(b, env);
  const isAdmin = !!staff && staff.role === 'admin';
  const { results } = await env.DB.prepare('SELECT * FROM appointments ORDER BY created_at DESC').all();
  // Archived appointments are visible to the SWC admin only, and no longer
  // block their time slot for students.
  const appts = results.filter(a => isAdmin || !a.archived).map(a => isAdmin
    ? { ID: a.id, Date: a.date, Time: a.time, StudentNo: a.student_no, Email: a.email,
        Name: a.name, Category: a.category, Concern: a.concern, Status: a.status, Archived: !!a.archived }
    : { Date: a.date, Time: a.time, Status: a.status });
  const blk = await env.DB.prepare('SELECT id, date, time, reason FROM unavailable_slots ORDER BY date, time').all();
  const blocked = blk.results.map(x => isAdmin
    ? { ID: x.id, Date: x.date, Time: x.time, Reason: x.reason || '' }
    : { Date: x.date, Time: x.time });
  return { ok: true, appointments: appts, blocked, scope: isAdmin ? 'admin' : 'public' };
}

async function handleBookAppointment(b, env, request) {
  const limited = await rateLimit(env, request, 'booking', 30, 60 * 60);
  if (limited) return limited;

  const date = clean(b.date, 10);
  const time = clean(b.time, 10);
  const studentNo = clean(b.studentNo, 30);
  const email = clean(b.email, 120);
  const name = clean(b.name, 100);
  const category = clean(b.category, 60);
  const concern = clean(b.concern, 1000);

  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00Z') : null;
  if (!d || isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== date) return fail('Please pick a valid date.');
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) return fail('Appointments are only available on weekdays.');
  const dayMs = 86400000;
  if (d.getTime() < Date.now() - 2 * dayMs || d.getTime() > Date.now() + 400 * dayMs) return fail('Please pick a date within the next year.');
  if (!SLOT_TIMES.includes(time)) return fail('Please pick a valid time slot.');
  if (!studentNo) return fail('Please enter your student number.');
  if (!/^[^\s@]+@(hs\.)?dlsud\.edu\.ph$/i.test(email)) return fail('Please use a valid DLSUD email address.');
  if (!name || !concern) return fail('Please fill in your name and concern.');

  const off = await env.DB.prepare(`SELECT 1 AS x FROM unavailable_slots WHERE date = ? AND (time = '' OR time = ?) LIMIT 1`).bind(date, time).first();
  if (off) return fail('The SWC is not available at that date/time. Please pick another.');

  const taken = fail('That time slot was just booked by someone else. Please pick another.');
  const existing = await env.DB.prepare(
    `SELECT id FROM appointments WHERE date = ? AND time = ? AND status IN ('Booked','Pending') AND archived = 0 LIMIT 1`
  ).bind(date, time).first();
  if (existing) return taken;

  const id = randomId();
  try {
    await env.DB.prepare(
      `INSERT INTO appointments (id, date, time, student_no, email, name, category, concern, status)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(id, date, time, studentNo, email, name, category, concern, 'Booked').run();
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) return taken;   // lost a race with another student
    throw e;
  }
  return { ok: true, id };
}

/* ────────────────────────────────────────────────────────────────────
   HOME CAROUSEL
──────────────────────────────────────────────────────────────────── */
async function handleGetCarouselSlides(env) {
  const { results } = await env.DB.prepare('SELECT * FROM carousel').all();
  const slides = results.map(s => ({ id: s.id, type: s.type, src: s.src, caption: s.caption }));
  return { ok: true, slides };
}

async function handleAddCarouselSlide(b, env) {
  const { error } = await authorize(b, env, ['council']);
  if (error) return error;
  if (!isHttpUrl(b.src)) return fail('Invalid image URL.');
  await env.DB.prepare('INSERT INTO carousel (id, type, src, caption, time) VALUES (?,?,?,?,?)')
    .bind(randomId(), 'photo', b.src, clean(b.caption, 200), new Date().toISOString()).run();
  return { ok: true };
}

async function handleClearCarouselSlides(b, env) {
  const { error } = await authorize(b, env, ['council']);
  if (error) return error;
  await env.DB.prepare('DELETE FROM carousel').run();
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────
   RESOURCE HUB
──────────────────────────────────────────────────────────────────── */
async function handleGetResources(env) {
  const { results } = await env.DB.prepare('SELECT * FROM resources ORDER BY rowid DESC').all();
  const resources = results.map(r => ({ id: r.id, name: r.name, url: r.url, date: r.date, uploadedBy: r.uploaded_by }));
  return { ok: true, resources };
}

async function handleAddResource(b, env) {
  const { user, error } = await authorize(b, env, ['council']);
  if (error) return error;
  const name = clean(b.name, 200);
  if (!name) return fail('Please give the resource a name.');
  if (!isHttpUrl(b.url)) return fail('Invalid file URL.');
  const id = randomId();
  await env.DB.prepare('INSERT INTO resources (id, name, url, date, uploaded_by) VALUES (?,?,?,?,?)')
    .bind(id, name, b.url, clean(b.date, 20) || formatDateMDY(new Date()), user.username).run();
  return { ok: true, id };
}

async function handleDeleteResource(b, env) {
  const { error } = await authorize(b, env, ['council']);
  if (error) return error;
  const res = await env.DB.prepare('DELETE FROM resources WHERE id = ?').bind(String(b.id || '')).run();
  if (res.meta.changes === 0) return fail('Resource ID not found.');
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────
   TEAM  (Council members: council + admin can edit)
   Counselors now live in their own table — see COUNSELORS below.
──────────────────────────────────────────────────────────────────── */
async function handleGetTeam(env) {
  const { results } = await env.DB.prepare('SELECT * FROM team').all();
  const rows = results.filter(t => t.type === 'member').map(t => ({ type: t.type, key: t.key, photo: t.photo || '', description: t.description || '' }));
  return { ok: true, team: rows };
}

async function handleSaveTeamMember(b, env) {
  const type = String(b.type || '');
  if (type !== 'member') return fail('Invalid type.');
  const { user, error } = await authorize(b, env, ['council', 'admin']);
  if (error) return error;
  const key = String(b.key || '');
  if (!/^[A-Za-z0-9_.-]{1,40}$/.test(key)) return fail('Invalid key.');
  if (b.photo !== undefined && b.photo !== '' && !isHttpUrl(b.photo)) return fail('Invalid photo URL.');

  const existing = await env.DB.prepare('SELECT * FROM team WHERE type = ? AND key = ?').bind(type, key).first();
  const photo = b.photo !== undefined ? b.photo : (existing ? existing.photo : '');
  const description = b.description !== undefined ? clean(b.description, 1500) : (existing ? existing.description : '');
  const updatedAt = new Date().toISOString();
  if (existing) {
    await env.DB.prepare('UPDATE team SET photo=?, description=?, updated_by=?, updated_at=? WHERE type=? AND key=?')
      .bind(photo, description, user.username, updatedAt, type, key).run();
  } else {
    await env.DB.prepare('INSERT INTO team (type, key, photo, description, updated_by, updated_at) VALUES (?,?,?,?,?,?)')
      .bind(type, key, photo, description, user.username, updatedAt).run();
  }
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────
   COUNSELORS  (public read; SWC admin adds / edits / removes)
──────────────────────────────────────────────────────────────────── */
async function handleGetCounselors(env) {
  const { results } = await env.DB.prepare('SELECT * FROM counselors ORDER BY sort_order ASC, created_at ASC').all();
  return { ok: true, counselors: results.map(c => ({ id: c.id, name: c.name, email: c.email || '', photo: c.photo || '', description: c.description || '' })) };
}

async function handleSaveCounselor(b, env, url) {
  const { user, error } = await authorize(b, env, ['admin']);
  if (error) return error;
  const name = clean(b.name, 120);
  if (!name) return fail('Please enter the counselor\'s name.');
  const email = clean(b.email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Please enter a valid email address.');
  const description = clean(b.description, 1500);
  let photo = '';
  if (b.photo) {
    photo = ownFileUrl(b.photo, url);
    if (!photo) return fail('Invalid photo.');
  }

  const id = b.id ? String(b.id) : '';
  if (id) {
    if (!ID_RE.test(id)) return fail('Invalid ID.');
    const existing = await env.DB.prepare('SELECT photo FROM counselors WHERE id = ?').bind(id).first();
    if (!existing) return fail('Counselor not found.');
    if (b.keepExistingPhoto === true && !b.photo) photo = existing.photo || '';
    await env.DB.prepare('UPDATE counselors SET name=?, email=?, photo=?, description=?, updated_by=? WHERE id=?')
      .bind(name, email, photo, description, user.username, id).run();
    if (existing.photo && existing.photo !== photo) await deleteOwnFile(env, existing.photo);
    return { ok: true, id };
  }
  const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM counselors').first();
  if (Number(count.c) >= 30) return fail('Counselor limit reached. Remove one first.');
  const newId = randomId();
  await env.DB.prepare(
    `INSERT INTO counselors (id, name, email, photo, description, updated_by, sort_order)
     VALUES (?,?,?,?,?,?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM counselors))`
  ).bind(newId, name, email, photo, description, user.username).run();
  return { ok: true, id: newId };
}

async function handleDeleteCounselor(b, env) {
  const { error } = await authorize(b, env, ['admin']);
  if (error) return error;
  const id = String(b.id || '');
  if (!ID_RE.test(id)) return fail('Invalid ID.');
  const row = await env.DB.prepare('SELECT photo FROM counselors WHERE id = ?').bind(id).first();
  if (!row) return fail('Counselor not found.');
  await env.DB.prepare('DELETE FROM counselors WHERE id = ?').bind(id).run();
  await deleteOwnFile(env, row.photo);
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────
   ABOUT SWC  (public read; SWC admin edits)
──────────────────────────────────────────────────────────────────── */
const ABOUT_FIELDS = { title: 120, body: 5000, hours: 300, location: 300, contact: 300 };

async function handleGetAbout(env) {
  const row = await env.DB.prepare("SELECT value, updated_at FROM site_content WHERE k = 'about_swc'").first();
  let about = {};
  try { about = row && row.value ? JSON.parse(row.value) : {}; } catch { about = {}; }
  const out = {};
  for (const f of Object.keys(ABOUT_FIELDS)) out[f] = typeof about[f] === 'string' ? about[f] : '';
  return { ok: true, about: out, updatedAt: row ? row.updated_at : null };
}

async function handleSaveAbout(b, env) {
  const { user, error } = await authorize(b, env, ['admin']);
  if (error) return error;
  const about = {};
  for (const [f, max] of Object.entries(ABOUT_FIELDS)) about[f] = clean(b[f], max);
  // clean() keeps line breaks, so paragraphs survive.
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO site_content (k, value, updated_by, updated_at) VALUES ('about_swc', ?, ?, ?)
     ON CONFLICT(k) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
  ).bind(JSON.stringify(about), user.username, now).run();
  return { ok: true, updatedAt: now };
}

/* ────────────────────────────────────────────────────────────────────
   UNAVAILABLE DATES / TIMES  (SWC admin only)
   time = '' blocks the whole day. Existing bookings are never silently
   overridden: the SWC must archive them first.
──────────────────────────────────────────────────────────────────── */
function validDateKey(date) {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00Z') : null;
  return d && !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date ? d : null;
}

async function handleAddUnavailable(b, env) {
  const { user, error } = await authorize(b, env, ['admin']);
  if (error) return error;
  const date = clean(b.date, 10);
  const time = clean(b.time, 10);
  const d = validDateKey(date);
  if (!d) return fail('Please pick a valid date.');
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) return fail('Weekends are already unavailable.');
  if (time && !SLOT_TIMES.includes(time)) return fail('Please pick a valid time slot.');

  const active = await env.DB.prepare(
    `SELECT time FROM appointments WHERE date = ? AND status IN ('Booked','Pending') AND archived = 0` + (time ? ' AND time = ?' : '')
  ).bind(...(time ? [date, time] : [date])).all();
  if (active.results.length) {
    return fail(time
      ? 'A student has already booked that time. Archive that appointment first if you need to cancel it.'
      : `${active.results.length} active appointment(s) are booked that day. Archive them first, or mark only the free times unavailable.`);
  }

  const reason = clean(b.reason, 200);
  try {
    await env.DB.prepare('INSERT INTO unavailable_slots (id, date, time, reason, created_by) VALUES (?,?,?,?,?)')
      .bind(randomId(), date, time, reason, user.username).run();
    if (!time) {   // a whole-day block makes any individual blocks for that day redundant
      await env.DB.prepare("DELETE FROM unavailable_slots WHERE date = ? AND time != ''").bind(date).run();
    }
  } catch (e) {
    if (!/UNIQUE/i.test(String(e && e.message))) throw e;   // already marked — fine
  }
  return { ok: true };
}

async function handleRemoveUnavailable(b, env) {
  const { error } = await authorize(b, env, ['admin']);
  if (error) return error;
  const date = clean(b.date, 10);
  const time = clean(b.time, 10);
  if (!validDateKey(date)) return fail('Please pick a valid date.');
  const res = await env.DB.prepare('DELETE FROM unavailable_slots WHERE date = ? AND time = ?').bind(date, time).run();
  if (res.meta.changes === 0) return fail('That time was not marked unavailable.');
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────
   FILE UPLOADS (→ R2)
   Only known-safe types are accepted. The type is decided from the file
   extension AND checked against the file's real first bytes, and what the
   browser claims ("mimeType") is ignored. HTML / SVG / scripts can never
   be stored, so an uploaded file can't run code on any page.
──────────────────────────────────────────────────────────────────── */
const FILE_TYPES = {
  jpg:  { mime: 'image/jpeg', magic: 'jpeg' },  jpeg: { mime: 'image/jpeg', magic: 'jpeg' },
  png:  { mime: 'image/png',  magic: 'png' },
  gif:  { mime: 'image/gif',  magic: 'gif' },
  webp: { mime: 'image/webp', magic: 'webp' },
  pdf:  { mime: 'application/pdf', magic: 'pdf' },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: 'zip' },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', magic: 'zip' },
  xlsx: { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', magic: 'zip' },
  doc:  { mime: 'application/msword', magic: 'ole' },
  ppt:  { mime: 'application/vnd.ms-powerpoint', magic: 'ole' },
  xls:  { mime: 'application/vnd.ms-excel', magic: 'ole' },
  txt:  { mime: 'text/plain', magic: 'text' },
  csv:  { mime: 'text/csv', magic: 'text' },
};
const PUBLIC_UPLOAD_EXTS = ['jpg', 'jpeg', 'png'];               // student concern attachments
const MAX_PUBLIC_UPLOAD = 10 * 1024 * 1024;
const MAX_STAFF_UPLOAD = 20 * 1024 * 1024;
const INLINE_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];

function matchesMagic(kind, b) {
  const eq = (off, arr) => arr.every((v, i) => b[off + i] === v);
  switch (kind) {
    case 'jpeg': return eq(0, [0xFF, 0xD8, 0xFF]);
    case 'png':  return eq(0, [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
    case 'gif':  return eq(0, [0x47, 0x49, 0x46, 0x38]);
    case 'webp': return eq(0, [0x52, 0x49, 0x46, 0x46]) && eq(8, [0x57, 0x45, 0x42, 0x50]);
    case 'pdf':  return eq(0, [0x25, 0x50, 0x44, 0x46, 0x2D]);
    case 'zip':  return eq(0, [0x50, 0x4B, 0x03, 0x04]);
    case 'ole':  return eq(0, [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
    case 'text': return !b.slice(0, 4096).includes(0);
    default:     return false;
  }
}

async function handleUploadFile(b, env, url, request) {
  const staff = await getSessionUser(b, env);
  if (!staff) {
    const limited = await rateLimit(env, request, 'upload', 15, 60 * 60);
    if (limited) return limited;
  }
  const maxBytes = staff ? MAX_STAFF_UPLOAD : MAX_PUBLIC_UPLOAD;
  const b64 = typeof b.base64 === 'string' ? b.base64 : '';
  if (!b64) return fail('No file received.');
  if (b64.length > Math.ceil(maxBytes * 4 / 3) + 16) return fail(`File is too large (max ${Math.round(maxBytes / 1048576)} MB).`, 413);

  const m = String(b.fileName || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/);
  const ext = m ? m[1] : '';
  const type = FILE_TYPES[ext];
  if (!type || (!staff && !PUBLIC_UPLOAD_EXTS.includes(ext))) {
    return fail(staff ? 'This file type is not allowed.' : 'Only JPG or PNG images are allowed.');
  }

  let bytes;
  try { bytes = fromB64(b64); } catch { return fail('The file could not be read.'); }
  if (bytes.length === 0 || bytes.length > maxBytes) return fail(`File is too large (max ${Math.round(maxBytes / 1048576)} MB).`, 413);
  if (!matchesMagic(type.magic, bytes)) return fail('The file contents do not match its type.');

  // Random, unguessable key: nobody can find another person's upload by counting.
  const key = `${crypto.randomUUID()}.${ext}`;
  await env.UPLOADS.put(key, bytes, { httpMetadata: { contentType: type.mime } });
  return { ok: true, fileUrl: `${url.origin}/file/${key}`, fileId: key };
}

async function serveFile(rawKey, env, request) {
  let key;
  try { key = decodeURIComponent(rawKey); } catch { return new Response('Not found', { status: 404 }); }
  if (!/^[A-Za-z0-9._-]{1,200}$/.test(key)) return new Response('Not found', { status: 404 });

  const obj = await env.UPLOADS.get(key);
  if (!obj) return new Response('Not found', { status: 404, headers: baseHeaders(request) });

  const h = baseHeaders(request);
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('Cache-Control', 'public, max-age=31536000, immutable');
  h.set('Cross-Origin-Resource-Policy', 'cross-origin');   // the Pages site embeds these images
  // Defence in depth — also neutralises any older upload that has a risky type.
  h.set('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  const mime = String(h.get('Content-Type') || '').toLowerCase();
  if (!INLINE_MIMES.includes(mime)) {
    h.set('Content-Type', 'application/octet-stream');
    h.set('Content-Disposition', 'attachment');
  }
  return new Response(request.method === 'HEAD' ? null : obj.body, { headers: h });
}

/* ────────────────────────────────────────────────────────────────────
   APPOINTMENTS — permanent delete (SWC admin only)
──────────────────────────────────────────────────────────────────── */
async function handleDeleteAppointment(b, env) {
  const { error } = await authorize(b, env, ['admin']);
  if (error) return error;
  const id = String(b.id || '');
  if (!ID_RE.test(id)) return fail('Invalid ID.');
  const res = await env.DB.prepare('DELETE FROM appointments WHERE id = ?').bind(id).run();
  if (res.meta.changes === 0) return fail('Appointment not found.');
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────
   LASALLIAN INSIGHTS EVENTS  (Council manages; everyone can read)
──────────────────────────────────────────────────────────────────── */
// A QR/image must be a file this Worker stored (uploaded through uploadFile).
function ownFileUrl(value, url) {
  try {
    const f = new URL(String(value));
    return f.origin === url.origin && f.pathname.startsWith('/file/') ? f.href : null;
  } catch { return null; }
}

async function handleGetEvents(b, env) {
  const staff = await getSessionUser(b, env);
  const isCouncil = !!staff && staff.role === 'council';
  const { results } = await env.DB.prepare('SELECT * FROM events ORDER BY sort_order ASC, created_at ASC').all();
  const events = results
    .filter(e => isCouncil || !e.archived)
    .map(e => ({ id: e.id, label: e.label, desc: e.description || '', link: e.link || '', qr: e.qr || '', archived: !!e.archived }));
  return { ok: true, events, scope: isCouncil ? 'council' : 'public' };
}

async function handleSaveEvent(b, env, url, isNew) {
  const { error } = await authorize(b, env, ['council']);
  if (error) return error;

  const label = clean(b.label, 80);
  if (!label) return fail('Please give the event a name.');
  const description = clean(b.description, 2000);
  const link = clean(b.link, 2048);
  if (link && !isHttpUrl(link)) return fail('The evaluation link must start with http:// or https://');
  let qr = '';
  if (b.qr) {
    qr = ownFileUrl(b.qr, url);
    if (!qr) return fail('Invalid QR image.');
  }

  if (isNew) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS c FROM events').first();
    if (Number(count.c) >= 50) return fail('Event limit reached. Delete old events first.');
    const id = randomId();
    await env.DB.prepare(
      `INSERT INTO events (id, label, description, link, qr, sort_order)
       VALUES (?,?,?,?,?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM events))`
    ).bind(id, label, description, link, qr).run();
    return { ok: true, id };
  }

  const id = String(b.id || '');
  if (!ID_RE.test(id)) return fail('Invalid ID.');
  const existing = await env.DB.prepare('SELECT qr FROM events WHERE id = ?').bind(id).first();
  if (!existing) return fail('Event not found.');
  await env.DB.prepare('UPDATE events SET label=?, description=?, link=?, qr=? WHERE id=?')
    .bind(label, description, link, qr, id).run();
  if (existing.qr && existing.qr !== qr) await deleteOwnFile(env, existing.qr);   // replaced or removed QR
  return { ok: true, id };
}

async function handleDeleteEvent(b, env) {
  const { error } = await authorize(b, env, ['council']);
  if (error) return error;
  const id = String(b.id || '');
  if (!ID_RE.test(id)) return fail('Invalid ID.');
  const row = await env.DB.prepare('SELECT qr FROM events WHERE id = ?').bind(id).first();
  if (!row) return fail('Event not found.');
  await env.DB.prepare('DELETE FROM events WHERE id = ?').bind(id).run();
  await deleteOwnFile(env, row.qr);
  return { ok: true };
}

/* ────────────────────────────────────────────────────────────────────
   PROFILE  (council + admin): display name, username, profile picture.
   Password changes use `changePassword` above. Changing the username needs
   the current password, and live sessions follow the rename.
──────────────────────────────────────────────────────────────────── */
async function handleUpdateProfile(b, env, request, url) {
  const { user, error } = await authorize(b, env, ['council', 'admin']);
  if (error) return error;

  const row = await env.DB.prepare('SELECT username, password, name, avatar FROM users WHERE username = ?').bind(user.username).first();
  if (!row) return fail('Account not found.');

  let name = row.name || row.username;
  let username = row.username;
  let avatar = row.avatar || '';

  if (b.name !== undefined) {
    name = clean(b.name, 60);
    if (name.length < 2) return fail('Display name must be at least 2 characters.');
  }

  if (b.username !== undefined) {
    const wanted = clean(b.username, 32);
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(wanted)) return fail('Username must be 3–32 characters (letters, numbers, dot, dash or underscore).');
    if (wanted !== row.username) {
      const limited = await rateLimit(env, request, 'profile-pw', 6, 15 * 60, user.username, true);
      if (limited) return limited;
      const check = await verifyPassword(row.password, b.currentPassword);
      if (!check.ok) return fail('Enter your current password to change your username.');
      const taken = await env.DB.prepare('SELECT username FROM users WHERE lower(username) = lower(?)').bind(wanted).first();
      if (taken && taken.username !== row.username) return fail('That username is already taken.');
      username = wanted;
    }
  }

  if (b.avatar !== undefined) {
    if (b.avatar === '' || b.avatar === null) avatar = '';
    else {
      avatar = ownFileUrl(b.avatar, url);
      if (!avatar) return fail('Invalid profile picture.');
    }
  }

  const initial = String(name).charAt(0).toUpperCase();
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET username = ?, name = ?, initial = ?, avatar = ? WHERE username = ?')
        .bind(username, name, initial, avatar, row.username),
      // Keep every signed-in device logged in after a rename.
      env.DB.prepare('UPDATE sessions SET username = ? WHERE lower(username) = lower(?)').bind(username, row.username),
    ]);
  } catch (e) {
    if (/UNIQUE/i.test(String(e && e.message))) return fail('That username is already taken.');
    throw e;
  }
  return { ok: true, username, name, initial, avatar };
}
