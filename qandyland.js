//
// ──── Qandyland Server ────────────────────────────────────────────────────────
//
// Node.js HTTP server for shared, in-memory file storage.
// Stores data in JSON "drives" (like virtual disks) that mirror the manifest
// format used by qandy-dos.js localStorage functions.
//
// Usage: node qandyland.js [port]
// Default port: 8080
//
// Security: Access-level permission system (O/S/U/G).
//           Drives persist to drives.json between restarts.
//           Only the server console can create/delete drives.
//
// Permission levels (read/write): O=Owner, S=Sysop, U=User, G=Guest
//   O/O - server-only  |  S/S - sysop only  |  U/U - users
//   G/G - public       |  U/G - user read, guest write  (etc.)
//
// Request format (POST /qandyland.js, Content-Type: application/json):
//   { "method": "mount|mkdir|chdir|rmdir|save|load|delete|rename|exists|dir|list",
//     "drive": "thewall",  "cwd": "/",  "name": "...", ... }
//
// Response format:
//   { "success": true|false, "error": "...", "result": "...", ... }
//

'use strict';

var http   = require('http');
var https  = require('https');
var path   = require('path');
var fs     = require('fs');
var crypto = require('crypto');

// ── Configuration ─────────────────────────────────────────────────────────────
var PORT = parseInt(process.argv[2], 10) || 8080;
var MANIFEST_KEY  = '_dir.sys!';
var MAX_NAME_BYTES = 255;
var MAX_FILE_BYTES = 1024 * 1024;   // 1 MB per file
var MAX_DRIVE_FILES = 1000;
var SESSION_COOKIE = 'qsession';
var VALID_NAME_RE  = /^(?!\.)[A-Za-z0-9 \-_.()+=!]+$/;
var DRIVES_FILE    = path.join(__dirname, 'drives.json');

// ── Access level permission system ────────────────────────────────────────────
// O=Owner(server), S=Sysop, U=User, G=Guest.  All HTTP clients are level G.
var ACCESS_LEVELS = { O: 4, S: 3, U: 2, G: 1 };
var PERM_RE = /^[OSUG]\/[OSUG]$/;
var CLIENT_LEVEL = 'G';  // HTTP clients are always treated as Guest

function validPerm(p) {
  return typeof p === 'string' && PERM_RE.test(p);
}

// Returns true when userLevel meets or exceeds the requiredLevel
function hasAccessLevel(userLevel, requiredLevel) {
  return (ACCESS_LEVELS[userLevel] || 0) >= (ACCESS_LEVELS[requiredLevel] || 99);
}

// Check read or write access against drive permissions
function checkDriveAccess(drive, userLevel, action) {
  var perms = (drive && drive.permissions) || 'G/G';
  var parts = perms.split('/');
  var required = action === 'write' ? parts[1] : parts[0];
  return hasAccessLevel(userLevel, required);
}

// Check read or write access against a file entry's permissions
// Falls back to drive permissions when the file has no explicit permissions
function checkFileAccess(entry, drive, userLevel, action) {
  var perms = (entry && entry.permissions) || (drive && drive.permissions) || 'G/G';
  var parts = perms.split('/');
  var required = action === 'write' ? parts[1] : parts[0];
  return hasAccessLevel(userLevel, required);
}

// ── Server discovery / registry ───────────────────────────────────────────────
// Configurable via command-line: node qandyland.js [port] [--name "..."] [--registry "url"] [--maxPlayers N]
var SERVER_NAME    = 'Qandyland Server';
var SERVER_VERSION = '1.0';
var REGISTRY_URL   = 'https://qandy.vercel.app/api/servers';
var MAX_PLAYERS    = 100;
var _serverId = null;          // assigned by registry on first POST
var _publicIp = null;          // detected once on startup
var _heartbeatTimer = null;
var _serverStartTime = Date.now(); // used for uptime reporting

// Parse extended command-line arguments
(function () {
  var args = process.argv.slice(2);
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--name'       && args[i + 1]) { SERVER_NAME  = args[++i]; }
    if (args[i] === '--registry'   && args[i + 1]) { REGISTRY_URL = args[++i]; }
    if (args[i] === '--maxPlayers' && args[i + 1]) { MAX_PLAYERS  = parseInt(args[++i], 10) || 100; }
    if (args[i] === '--no-registry') { REGISTRY_URL = ''; }
  }
})();

// Detect public IP via ipify.org (plain HTTP JSON API)
function getPublicIp(callback) {
  https.get('https://api.ipify.org?format=json', function (res) {
    var data = '';
    res.on('data', function (chunk) { data += chunk; });
    res.on('end', function () {
      try {
        var obj = JSON.parse(data);
        callback(null, obj.ip || null);
      } catch (e) {
        callback(e, null);
      }
    });
  }).on('error', function (e) {
    callback(e, null);
  });
}

// Build server info object for the registry
function buildServerInfo() {
  return {
    id:      _serverId,
    name:    SERVER_NAME,
    host:    _publicIp || '127.0.0.1',
    port:    PORT,
    drives:  Object.keys(drives),
    uptime:  Math.floor((Date.now() - _serverStartTime) / 60000),
    version: SERVER_VERSION
  };
}

// POST server info to the registry; stores returned id for future heartbeats
function registerWithRegistry(callback) {
  if (!REGISTRY_URL) return;
  var info = buildServerInfo();
  var body = JSON.stringify(info);
  try {
    var url = new URL(REGISTRY_URL);
    var isHttps = url.protocol === 'https:';
    var options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'POST',
      headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    var mod = isHttps ? https : http;
    var req = mod.request(options, function (res) {
      var d = '';
      res.on('data', function (c) { d += c; });
      res.on('end', function () {
        try {
          var obj = JSON.parse(d);
          if (obj && obj.id) { _serverId = obj.id; }
          if (typeof callback === 'function') callback(null, obj);
        } catch (e) {
          if (typeof callback === 'function') callback(e, null);
        }
      });
    });
    req.on('error', function (e) {
      if (typeof callback === 'function') callback(e, null);
    });
    req.write(body);
    req.end();
  } catch (e) {
    if (typeof callback === 'function') callback(e, null);
  }
}

// Send DELETE to registry when the server shuts down
function deregisterFromRegistry() {
  if (!REGISTRY_URL || !_serverId) return;
  try {
    var url = new URL(REGISTRY_URL + '?id=' + encodeURIComponent(_serverId));
    var isHttps = url.protocol === 'https:';
    var options = {
      hostname: url.hostname,
      port:     url.port || (isHttps ? 443 : 80),
      path:     url.pathname + url.search,
      method:   'DELETE',
      headers:  { 'Content-Length': 0 }
    };
    var mod = isHttps ? https : http;
    var req = mod.request(options, function () {});
    req.on('error', function (e) { console.warn('Deregister request failed:', e.message || String(e)); });
    req.end();
  } catch (e) { console.warn('deregisterFromRegistry error:', e.message || String(e)); }
}

// Start heartbeat interval (every 5 minutes)
function startHeartbeat() {
  if (!REGISTRY_URL) return;
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  _heartbeatTimer = setInterval(function () {
    registerWithRegistry(function (err) {
      if (err) { console.warn('Registry heartbeat failed:', err.message || String(err)); }
    });
  }, 5 * 60 * 1000);
}

// ── Request logging ───────────────────────────────────────────────────────────

// Column widths for aligned one-line log output
var COL_CLIENT  = 15;
var COL_ACTION  = 9;
var COL_DRIVE   = 8;
var COL_FILE    = 12;
var COL_SESSION = 9;

function logRequest(req, method, drive, name, result) {
  if (!logRequest._headerShown) {
    console.log(
      '[TIME    ] ' +
      'CLIENT         ' +
      ' ACTION   ' +
      ' DRIVE   ' +
      ' FILE        ' +
      ' SESSION ' +
      'RESULT'
    );
    logRequest._headerShown = true;
  }

  var ts      = new Date().toISOString().slice(11, 19);
  var ip      = req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown';
  var client  = (ip === '::1' || ip === '127.0.0.1') ? 'local' : ip;
  var ok      = result && result.success;
  var session = (result && result._session) || '';
  var status  = ok ? 'SUCCESS' : ('FAILED' + (result && result.error ? ' ' + result.error : ''));

  console.log(
    '[' + ts + '] ' +
    client.slice(0, COL_CLIENT).padEnd(COL_CLIENT) + ' ' +
    (method || '').slice(0, COL_ACTION - 1).padEnd(COL_ACTION) +
    (drive  || '-').slice(0, COL_DRIVE - 1).padEnd(COL_DRIVE)  +
    (name   || '-').slice(0, COL_FILE - 1).padEnd(COL_FILE)    +
    (session || '').slice(0, 8).padEnd(COL_SESSION) +
    status
  );
}

// ── In-memory storage ─────────────────────────────────────────────────────────
//
// drives[driveName] = {
//   manifest: [{ name, size, timestamp, owner, permissions }],
//   files:    { canonicalName: content_string },
//   dirs:     { dirName: { owner, created } },
//   created:  timestamp_string,
//   permissions: "R/W"   // drive-level access control, e.g. G/G, O/O
// }
//
var drives = {};

// ── Drive persistence ─────────────────────────────────────────────────────────

function saveDrives() {
  try {
    // Serialize drives (skip file content – only structure & metadata)
    var snapshot = {};
    var names = Object.keys(drives);
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var d = drives[n];
      snapshot[n] = {
        manifest:    d.manifest,
        files:       d.files,
        dirs:        d.dirs,
        created:     d.created,
        permissions: d.permissions
      };
    }
    fs.writeFileSync(DRIVES_FILE, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch (e) {
    console.warn('Warning: could not save drives.json:', e.message || String(e));
  }
}

function loadDrives() {
  try {
    if (!fs.existsSync(DRIVES_FILE)) return;
    var raw = fs.readFileSync(DRIVES_FILE, 'utf8');
    var snapshot = JSON.parse(raw);
    var names = Object.keys(snapshot);
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      var d = snapshot[n];
      drives[n] = {
        manifest:    Array.isArray(d.manifest)          ? d.manifest    : [],
        files:       (d.files && typeof d.files === 'object') ? d.files : {},
        dirs:        (d.dirs  && typeof d.dirs  === 'object') ? d.dirs  : {},
        created:     d.created     || timestamp(),
        permissions: validPerm(d.permissions) ? d.permissions : 'O/O'
      };
    }
    console.log('Loaded ' + names.length + ' drive(s) from drives.json');
  } catch (e) {
    console.warn('Warning: could not load drives.json:', e.message || String(e));
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timestamp() {
  var d = new Date();
  var pad = function (n, w) { return String(n).padStart(w || 2, '0'); };
  return (
    String(d.getFullYear()) +
    pad(d.getMonth() + 1) +
    pad(d.getDate()) +
    pad(d.getHours()) +
    pad(d.getMinutes()) +
    pad(d.getSeconds())
  );
}

function utf8len(s) {
  return Buffer.byteLength(String(s == null ? '' : s), 'utf8');
}

function normName(n) {
  return (typeof n === 'string') ? n.trim() : String(n == null ? '' : n).trim();
}

function baseName(name) {
  var n = normName(name);
  var slash = n.lastIndexOf('/');
  if (slash >= 0) n = n.substring(slash + 1);
  if (n.charAt(0) === '_') n = n.substring(1);
  if (n.length > 0 && n.charAt(n.length - 1) === '!') n = n.substring(0, n.length - 1);
  return n;
}

function validateName(name) {
  var n = normName(name);
  if (!n) return { ok: false, reason: 'empty filename' };
  if (!VALID_NAME_RE.test(n)) return { ok: false, reason: 'invalid characters in filename' };
  if (utf8len(n) > MAX_NAME_BYTES) return { ok: false, reason: 'filename exceeds 255 bytes' };
  return { ok: true };
}

function isWriteProtected(name) {
  var n = normName(name);
  return n.charAt(n.length - 1) === '!';
}

function isHidden(name) {
  var n = normName(name);
  // Hidden if basename starts with _
  var b = n;
  var slash = n.lastIndexOf('/');
  if (slash >= 0) b = n.substring(slash + 1);
  return b.charAt(0) === '_';
}

// Resolve a name against cwd, return canonical path (without leading /)
function resolveName(cwd, name) {
  var base = (cwd || '/').replace(/^\//, '');  // strip leading slash
  var n = normName(name);
  if (n.indexOf('/') >= 0) {
    // Has path component – resolve relative to root
    return n.replace(/^\//, '');
  }
  return base ? (base + '/' + n) : n;
}

// Get/create a session token from cookie header
function getSession(req, res) {
  var cookieHeader = req.headers['cookie'] || '';
  var match = cookieHeader.match(new RegExp('(?:^|;)\\s*' + SESSION_COOKIE + '=([^;]+)'));
  if (match) return match[1];

  // Issue a new session token
  var token = crypto.randomBytes(24).toString('hex');
  res.setHeader('Set-Cookie',
    SESSION_COOKIE + '=' + token +
    '; HttpOnly; SameSite=Lax; Path=/; Max-Age=86400'
  );
  return token;
}

// ── Request parsing ───────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var total  = 0;
    req.on('data', function (chunk) {
      total += chunk.length;
      if (total > MAX_FILE_BYTES + 4096) {
        req.destroy();
        return reject(new Error('Request too large'));
      }
      chunks.push(chunk);
    });
    req.on('end',   function () { resolve(Buffer.concat(chunks).toString('utf8')); });
    req.on('error', reject);
  });
}

// ── Static file serving ───────────────────────────────────────────────────────

var MIME = {
  '.html': 'text/html',
  '.htm':  'text/html',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.txt':  'text/plain',
  '.json': 'application/json',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.gif':  'image/gif',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

function serveStatic(req, res) {
  var pathname;
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch (e) {
    pathname = '/';
  }
  var filePath  = path.join(__dirname, path.normalize(pathname));

  // Prevent path traversal above cwd
  if (!filePath.startsWith(__dirname + path.sep) && filePath !== __dirname) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      return res.end('Not found');
    }
    var ext  = path.extname(filePath).toLowerCase();
    var mime = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  });
}

// ── Drive operations ──────────────────────────────────────────────────────────

function driveCreate(driveName, permissions) {
  var name = normName(driveName);
  var fv = validateName(name);
  if (!fv.ok) return { success: false, error: 'invalid drive name: ' + fv.reason };
  if (drives[name]) return { success: false, error: 'drive already exists' };

  var perms = validPerm(permissions) ? permissions : 'O/O';
  var ts = timestamp();
  drives[name] = {
    manifest:    [],
    files:       {},
    dirs:        {},
    created:     ts,
    permissions: perms
  };

  // Create the root manifest entry
  _saveManifest(name, []);
  saveDrives();

  return { success: true, result: 'drive created' };
}

function driveMount(driveName, session) {
  var name = normName(driveName);
  if (!drives[name]) return { success: false, error: 'drive not found' };
  return { success: true, result: 'server://' + name + '/', cwd: '/' };
}

function _findEntry(manifest, userInput) {
  var base = baseName(normName(userInput)).toLowerCase();
  for (var i = 0; i < manifest.length; i++) {
    var entry = manifest[i];
    if (baseName(normName(entry.name)).toLowerCase() === base) return entry;
  }
  return null;
}

function _saveManifest(driveName, entries) {
  var drive = drives[driveName];
  if (!drive) return;
  var ts    = timestamp();
  var lines = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.name === MANIFEST_KEY) continue;
    lines.push(
      e.name + '|' + e.size + '|' + e.timestamp + '|' +
      (e.owner || '') + '|' + (e.permissions || drive.permissions || 'G/G')
    );
  }
  var body    = lines.length ? lines.join('\n') + '\n' : '';
  var selfLine = MANIFEST_KEY + '|0|' + ts;
  var full    = body + selfLine;
  var mSize   = utf8len(full);
  selfLine    = MANIFEST_KEY + '|' + mSize + '|' + ts;
  full        = body + selfLine;

  drive.files[MANIFEST_KEY] = full;
  drive.manifest = entries.filter(function (e) { return e.name !== MANIFEST_KEY; });
  drive.manifest.push({ name: MANIFEST_KEY, size: utf8len(full), timestamp: ts, owner: '', permissions: '' });
}

function fileSave(driveName, cwd, name, content, userLevel) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  // Drive-level write access check
  if (!checkDriveAccess(drive, userLevel, 'write')) {
    return { success: false, error: 'permission denied' };
  }

  var fname = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var fv = validateName(baseName(fname));
  if (!fv.ok) return { success: false, error: fv.reason };

  var canonical = resolveName(cwd, fname);
  var existing  = _findEntry(drive.manifest, fname);

  // Write-protection check
  if (existing && isWriteProtected(existing.name)) {
    return { success: false, error: 'file is write-protected' };
  }
  // File-level write access check
  if (existing && !checkFileAccess(existing, drive, userLevel, 'write')) {
    return { success: false, error: 'permission denied' };
  }

  var str  = String(content == null ? '' : content);
  var size = utf8len(str);

  if (size > MAX_FILE_BYTES) {
    return { success: false, error: 'file too large' };
  }
  if (!existing && drive.manifest.length >= MAX_DRIVE_FILES) {
    return { success: false, error: 'drive full' };
  }

  var ts = timestamp();
  drive.files[canonical] = str;

  // Inherit drive permissions for new files; preserve permissions for existing files.
  // Owner tracks original creator; HTTP clients have no authenticated identity yet
  // (future: set owner from sysop key when auth is implemented).
  var filePerms = existing ? (existing.permissions || drive.permissions || 'G/G') : (drive.permissions || 'G/G');
  var fileOwner = existing ? (existing.owner || '') : '';

  // Update manifest
  var manifest = drive.manifest.filter(function (e) {
    return e.name !== MANIFEST_KEY && baseName(normName(e.name)).toLowerCase() !== baseName(normName(fname)).toLowerCase();
  });
  manifest.push({ name: fname, size: size, timestamp: ts, owner: fileOwner, permissions: filePerms });
  _saveManifest(driveName, manifest);
  saveDrives();

  return { success: true, result: true };
}

function fileLoad(driveName, cwd, name, userLevel) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  // Drive-level read access check
  if (!checkDriveAccess(drive, userLevel, 'read')) {
    return { success: false, error: 'permission denied' };
  }

  var fname    = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var canonical = resolveName(cwd, fname);
  var existing  = _findEntry(drive.manifest, fname);

  if (!existing) return { success: false, error: 'file not found' };

  // File-level read access check
  if (!checkFileAccess(existing, drive, userLevel, 'read')) {
    return { success: false, error: 'permission denied' };
  }

  var content = drive.files[canonical];
  if (content == null) return { success: false, error: 'file not found' };

  return { success: true, content: content };
}

function fileDelete(driveName, cwd, name, userLevel) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  if (!checkDriveAccess(drive, userLevel, 'write')) {
    return { success: false, error: 'permission denied' };
  }

  var fname    = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var canonical = resolveName(cwd, fname);
  var existing  = _findEntry(drive.manifest, fname);

  if (!existing) return { success: false, error: 'file not found' };
  if (isWriteProtected(existing.name)) return { success: false, error: 'file is write-protected' };
  if (!checkFileAccess(existing, drive, userLevel, 'write')) {
    return { success: false, error: 'permission denied' };
  }

  delete drive.files[canonical];
  var manifest = drive.manifest.filter(function (e) {
    return e.name !== MANIFEST_KEY && baseName(normName(e.name)).toLowerCase() !== baseName(normName(fname)).toLowerCase();
  });
  _saveManifest(driveName, manifest);
  saveDrives();

  return { success: true, result: 'deleted' };
}

function fileRename(driveName, cwd, name, dest, userLevel) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  if (!checkDriveAccess(drive, userLevel, 'write')) {
    return { success: false, error: 'permission denied' };
  }

  var fname = normName(name);
  var dname = normName(dest);
  if (!fname || !dname) return { success: false, error: 'invalid filename' };
  var fv = validateName(baseName(fname));
  var dv = validateName(baseName(dname));
  if (!fv.ok) return { success: false, error: fv.reason };
  if (!dv.ok) return { success: false, error: 'invalid destination: ' + dv.reason };

  var srcCanonical  = resolveName(cwd, fname);
  var destCanonical = resolveName(cwd, dname);
  var existing      = _findEntry(drive.manifest, fname);
  var destExisting  = _findEntry(drive.manifest, dname);

  if (!existing) return { success: false, error: 'file not found' };
  if (isWriteProtected(existing.name)) return { success: false, error: 'file is write-protected' };
  if (!checkFileAccess(existing, drive, userLevel, 'write')) {
    return { success: false, error: 'permission denied' };
  }
  if (destExisting) return { success: false, error: 'destination already exists' };

  var content = drive.files[srcCanonical];
  if (content == null) return { success: false, error: 'file not found' };

  drive.files[destCanonical] = content;
  delete drive.files[srcCanonical];

  var ts = timestamp();
  var manifest = drive.manifest.filter(function (e) {
    return e.name !== MANIFEST_KEY && baseName(normName(e.name)).toLowerCase() !== baseName(normName(fname)).toLowerCase();
  });
  manifest.push({ name: dname, size: existing.size, timestamp: ts, owner: existing.owner || '', permissions: existing.permissions || drive.permissions || 'G/G' });
  _saveManifest(driveName, manifest);
  saveDrives();

  return { success: true, result: 'renamed' };
}

function fileExists(driveName, cwd, name, userLevel) {
  var drive = drives[driveName];
  if (!drive) return { success: true, exists: false };

  var fname    = normName(name);
  if (!fname) return { success: true, exists: false };
  var existing  = _findEntry(drive.manifest, fname);
  if (!existing) return { success: true, exists: false };

  // File is invisible if user doesn't have read access
  if (!checkFileAccess(existing, drive, userLevel, 'read')) {
    return { success: true, exists: false };
  }

  return { success: true, exists: true };
}

function dirMake(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var dirName = normName(name);
  if (!dirName) return { success: false, error: 'invalid directory name' };
  var fv = validateName(baseName(dirName));
  if (!fv.ok) return { success: false, error: fv.reason };

  var canonical = resolveName(cwd, dirName);
  if (drive.dirs[canonical]) return { success: false, error: 'directory already exists' };

  drive.dirs[canonical] = { owner: session, created: timestamp() };
  return { success: true, result: 'done' };
}

function dirChange(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var dirName = normName(name);

  // Navigate to root
  if (!dirName || dirName === '/') {
    return { success: true, cwd: '/', result: 'server://' + driveName + '/' };
  }

  // Up one level
  if (dirName === '..') {
    var parts = (cwd || '/').replace(/^\//, '').replace(/\/$/, '').split('/');
    parts.pop();
    var newCwd = '/' + parts.join('/');
    if (newCwd !== '/') newCwd += '/';
    return { success: true, cwd: newCwd, result: 'server://' + driveName + newCwd };
  }

  var canonical = resolveName(cwd, dirName);
  if (!drive.dirs[canonical]) return { success: false, error: 'directory not found' };

  var newCwd = '/' + canonical + '/';
  return { success: true, cwd: newCwd, result: 'server://' + driveName + newCwd };
}

function dirRemove(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var dirName   = normName(name);
  if (!dirName) return { success: false, error: 'invalid directory name' };
  var canonical = resolveName(cwd, dirName);
  if (!drive.dirs[canonical]) return { success: false, error: 'directory not found' };

  var dirEntry = drive.dirs[canonical];
  if (dirEntry.owner && dirEntry.owner !== session) {
    return { success: false, error: 'permission denied' };
  }

  // Check if empty (no files or subdirs under this path)
  var prefix = canonical + '/';
  var hasChildren = drive.manifest.some(function (e) {
    return e.name !== MANIFEST_KEY && e.name.indexOf(prefix) === 0;
  }) || Object.keys(drive.dirs).some(function (d) {
    return d !== canonical && d.indexOf(prefix) === 0;
  });

  if (hasChildren) return { success: false, error: 'directory not empty' };

  delete drive.dirs[canonical];
  return { success: true, result: 'done' };
}

function dirList(driveName, cwd, pattern, switches, userLevel) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  // Drive-level read access check
  if (!checkDriveAccess(drive, userLevel, 'read')) {
    return { success: false, error: 'permission denied' };
  }

  var showHidden = (switches || '').indexOf('a') >= 0;
  var dir   = (cwd || '/').replace(/^\//, '').replace(/\/$/, '');
  var lines = [];

  // Header
  lines.push('Directory of server://' + driveName + (cwd || '/') + '\n');
  lines.push('\n');

  // Subdirectories
  var dirPrefix = dir ? (dir + '/') : '';
  var subDirs   = Object.keys(drive.dirs).filter(function (d) {
    if (!d.startsWith(dirPrefix)) return false;
    var rel = d.substring(dirPrefix.length);
    return rel && rel.indexOf('/') < 0;
  });

  for (var i = 0; i < subDirs.length; i++) {
    var dname = subDirs[i].substring(dirPrefix.length);
    if (!showHidden && isHidden(dname)) continue;
    if (pattern && !matchPattern(dname, pattern)) continue;
    lines.push('  <DIR>  ' + dname + '\n');
  }

  // Files
  var entries = drive.manifest.filter(function (e) {
    if (e.name === MANIFEST_KEY) return showHidden;
    if (!showHidden && isHidden(e.name)) return false;
    if (!checkFileAccess(e, drive, userLevel, 'read')) return false;
    var base = resolveName('/', e.name).replace(/\/$/, '');
    var slash = base.lastIndexOf('/');
    var fileDir = slash >= 0 ? base.substring(0, slash) : '';
    return fileDir === dir;
  });

  for (var j = 0; j < entries.length; j++) {
    var e   = entries[j];
    var nb  = baseName(e.name);
    if (pattern && !matchPattern(nb, pattern)) continue;
    var ts  = e.timestamp || '';
    var sz  = String(e.size);
    var perms = e.permissions || drive.permissions || 'G/G';
    var owner = e.owner || '';
    lines.push(
      '  ' + ts + '  ' + sz.padStart(8) + '  ' +
      e.name.padEnd(16) + '  ' + perms.padEnd(5) + '  ' + owner + '\n'
    );
  }

  lines.push('\n');
  lines.push(entries.length + ' file(s)\n');

  return { success: true, listing: lines.join('') };
}

function fileList(driveName, cwd, pattern, userLevel) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  if (!checkDriveAccess(drive, userLevel, 'read')) {
    return { success: false, error: 'permission denied' };
  }

  var dir   = (cwd || '/').replace(/^\//, '').replace(/\/$/, '');
  var names = [];

  var entries = drive.manifest.filter(function (e) {
    if (e.name === MANIFEST_KEY) return false;
    if (!checkFileAccess(e, drive, userLevel, 'read')) return false;
    var base = resolveName('/', e.name).replace(/\/$/, '');
    var slash = base.lastIndexOf('/');
    var fileDir = slash >= 0 ? base.substring(0, slash) : '';
    return fileDir === dir;
  });

  for (var i = 0; i < entries.length; i++) {
    var nb = baseName(entries[i].name);
    if (pattern && !matchPattern(nb, pattern)) continue;
    names.push(entries[i].name);
  }

  return { success: true, listing: names.join('\n') };
}

// Simple glob-style pattern matching (* and ?)
function matchPattern(name, pattern) {
  if (!pattern) return true;
  var escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  try {
    return new RegExp('^' + escaped + '$', 'i').test(name);
  } catch (e) {
    return false;
  }
}

// ── Request dispatcher ────────────────────────────────────────────────────────

function respond(res, obj) {
  var body = JSON.stringify(obj);
  res.writeHead(200, {
    'Content-Type':  'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function handleQandyland(req, res) {
  getSession(req, res); // Ensure Set-Cookie fires before body read
  var session = getSession(req, res);

  readBody(req).then(function (raw) {
    var pkt;
    try { pkt = JSON.parse(raw); } catch (e) {
      return respond(res, { success: false, error: 'invalid JSON' });
    }

    var method = normName(pkt.method || '').toLowerCase();
    var drive  = normName(pkt.drive || '');
    var cwd    = normName(pkt.cwd   || '/');
    var name   = normName(pkt.name  || '');
    var dest   = normName(pkt.dest  || '');
    var content = pkt.content != null ? String(pkt.content) : '';
    var pattern = normName(pkt.pattern || '');
    var switches = normName(pkt.switches || '');

    // All HTTP clients are treated as Guest level
    var userLevel = CLIENT_LEVEL;

    var result;
    switch (method) {
      case 'create':
        result = {
          success: false,
          error: 'Drive creation restricted to server administrator. Use the server console.'
        };
        logRequest(req, method, name || drive, '', result);
        return respond(res, result);

      case 'mount':
        result = driveMount(name || drive, session);
        logRequest(req, method, name || drive, '', result);
        return respond(res, result);

      case 'save':
        result = fileSave(drive, cwd, name, content, userLevel);
        logRequest(req, method, drive, name, result);
        return respond(res, result);

      case 'load':
        result = fileLoad(drive, cwd, name, userLevel);
        logRequest(req, method, drive, name, result);
        return respond(res, result);

      case 'delete':
        result = fileDelete(drive, cwd, name, userLevel);
        logRequest(req, method, drive, name, result);
        return respond(res, result);

      case 'rename':
        result = fileRename(drive, cwd, name, dest, userLevel);
        logRequest(req, method, drive, name, result);
        return respond(res, result);

      case 'exists':
        result = fileExists(drive, cwd, name, userLevel);
        logRequest(req, method, drive, name, result);
        return respond(res, result);

      case 'mkdir':
        result = dirMake(drive, cwd, name, session);
        logRequest(req, method, drive, name, result);
        return respond(res, result);

      case 'chdir':
        result = dirChange(drive, cwd, name, session);
        logRequest(req, method, drive, name, result);
        return respond(res, result);

      case 'rmdir':
        result = dirRemove(drive, cwd, name, session);
        logRequest(req, method, drive, name, result);
        return respond(res, result);

      case 'dir':
        result = dirList(drive, cwd, pattern, switches, userLevel);
        logRequest(req, method, drive, pattern, result);
        return respond(res, result);

      case 'list':
        result = fileList(drive, cwd, pattern, userLevel);
        logRequest(req, method, drive, pattern, result);
        return respond(res, result);

      default:
        result = { success: false, error: 'unknown method: ' + method };
        logRequest(req, method || '(unknown)', drive, name, result);
        return respond(res, result);
    }
  }).catch(function (err) {
    respond(res, { success: false, error: 'server error: ' + err.message });
  });
}

// ── Server console commands ───────────────────────────────────────────────────

function showServerHelp() {
  console.log('');
  console.log('Server console commands:');
  console.log('  create <name> [perms]  Create a drive  (default perms: O/O)');
  console.log('  list                   List all drives with permissions');
  console.log('  delete <name>          Delete a drive');
  console.log('  perms <name>           Show drive permissions');
  console.log('  help                   Show this help');
  console.log('');
  console.log('Permission format: R/W  where R=read level, W=write level');
  console.log('  O=Owner  S=Sysop  U=User  G=Guest');
  console.log('  Examples: O/O  S/S  U/U  G/G  S/U  U/G');
  console.log('');
}

function handleServerCreate(driveName, permissions) {
  if (!driveName) {
    console.log('Usage: create <drive-name> [permissions]');
    console.log('       create thewall G/G');
    return;
  }
  var perms = permissions || 'O/O';
  if (!validPerm(perms)) {
    console.log('✗ Invalid permissions "' + perms + '". Use format like O/O, S/S, U/G, G/G');
    return;
  }
  var result = driveCreate(driveName, perms);
  if (result.success) {
    console.log('✓ Drive \'' + driveName + '\' created with ' + perms + ' permissions');
  } else {
    console.log('✗ ' + result.error);
  }
}

function handleServerList() {
  var names = Object.keys(drives);
  if (names.length === 0) {
    console.log('  (no drives)');
    return;
  }
  console.log('');
  console.log('  Drive            Perms   Files    Size      Created');
  console.log('  ───────────────────────────────────────────────────────');
  for (var i = 0; i < names.length; i++) {
    var n  = names[i];
    var d  = drives[n];
    var fc = (d.manifest || []).filter(function (e) { return e.name !== MANIFEST_KEY; }).length;
    var fk = 0;
    var fkeys = Object.keys(d.files || {});
    for (var j = 0; j < fkeys.length; j++) {
      if (fkeys[j] !== MANIFEST_KEY) fk += utf8len(d.files[fkeys[j]]);
    }
    var kb = (fk / 1024).toFixed(1) + 'KB';
    var perms = d.permissions || 'O/O';
    console.log(
      '  ' + n.padEnd(16) + ' ' + perms.padEnd(7) +
      String(fc).padStart(5) + '    ' + kb.padEnd(9) + ' ' + (d.created || '')
    );
  }
  console.log('');
}

function handleServerDelete(driveName) {
  if (!driveName) {
    console.log('Usage: delete <drive-name>');
    return;
  }
  var name = normName(driveName);
  if (!drives[name]) {
    console.log('✗ Drive \'' + name + '\' not found');
    return;
  }
  delete drives[name];
  saveDrives();
  console.log('✓ Drive \'' + name + '\' deleted');
}

function handleServerPerms(driveName) {
  if (!driveName) {
    console.log('Usage: perms <drive-name>');
    return;
  }
  var name = normName(driveName);
  var d = drives[name];
  if (!d) {
    console.log('✗ Drive \'' + name + '\' not found');
    return;
  }
  var perms = d.permissions || 'O/O';
  var parts = perms.split('/');
  var levelName = { O: 'Owner', S: 'Sysop', U: 'User', G: 'Guest' };
  console.log('');
  console.log('Drive: ' + name);
  console.log('  Permissions: ' + perms);
  console.log('  Read:  ' + (levelName[parts[0]] || parts[0]) + ' level and above');
  console.log('  Write: ' + (levelName[parts[1]] || parts[1]) + ' level and above');
  console.log('');
}

function processServerCommand(cmd) {
  var parts = cmd.trim().split(/\s+/);
  var command = (parts[0] || '').toLowerCase();
  switch (command) {
    case 'create': handleServerCreate(parts[1], parts[2]); break;
    case 'list':   handleServerList();                      break;
    case 'delete': handleServerDelete(parts[1]);            break;
    case 'perms':  handleServerPerms(parts[1]);             break;
    case 'help':   showServerHelp();                        break;
    default:
      console.log('Unknown command "' + command + '". Type "help" for commands.');
  }
}

// ── HTTP server ───────────────────────────────────────────────────────────────

var server = http.createServer(function (req, res) {
  // CORS: allow all origins without credentials (server stores in-memory disposable data;
  // session ownership is best-effort and session cookies don't work cross-origin anyway).
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Max-Age', '86400');
    res.writeHead(204);
    return res.end();
  }

  var reqPathname;
  try {
    reqPathname = new URL(req.url, 'http://localhost').pathname;
  } catch (e) {
    reqPathname = '/';
  }

  if (reqPathname === '/qandyland.js' && req.method === 'POST') {
    return handleQandyland(req, res);
  }

  // Status endpoint for debugging
  if (reqPathname === '/status' && req.method === 'GET') {
    var status = {
      uptime:  Math.floor((Date.now() - _serverStartTime) / 60000),
      drives:  Object.keys(drives),
      memory:  process.memoryUsage(),
      version: SERVER_VERSION
    };
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(status, null, 2));
  }

  // Static file fallback for everything else
  serveStatic(req, res);
});

server.listen(PORT, function () {
  // Load persisted drives before showing banner
  loadDrives();

  // ── Startup banner ────────────────────────────────────────────────────────
  var ipStr      = (_publicIp || '(detecting...)').padEnd(20);
  var portStr    = String(PORT).padEnd(20);
  var regStatus  = REGISTRY_URL ? 'Enabled' : 'Disabled';
  var line       = '║ %-28s  %-29s║';
  var width      = 64;
  var border     = '═'.repeat(width - 2);

  function bannerLine(left, right) {
    var l = (left  || '').padEnd(28);
    var r = (right || '').padEnd(29);
    return '║ ' + l + '  ' + r + '║';
  }

  console.log('╔' + border + '╗');
  console.log('║' + 'QANDYLAND SERVER'.padStart(Math.ceil((width - 2 + 16) / 2)).padEnd(width - 2) + '║');
  console.log('╠' + border + '╣');
  console.log(bannerLine('Port: ' + PORT,           'Public IP: ' + (_publicIp || 'detecting...')));
  console.log(bannerLine('Registry: ' + regStatus,  'Server ID: ' + (_serverId || 'pending')));
  console.log('║' + ' '.repeat(width - 2) + '║');
  console.log('║  Available Drives:' + ' '.repeat(width - 21) + '║');

  var driveNames = Object.keys(drives);
  if (driveNames.length === 0) {
    console.log('║    (no drives created yet)' + ' '.repeat(width - 29) + '║');
  } else {
    for (var di = 0; di < driveNames.length; di++) {
      var dn  = driveNames[di];
      var dd  = drives[dn];
      var fc  = (dd.manifest || []).filter(function (e) { return e.name !== MANIFEST_KEY; }).length;
      var fk  = 0;
      var fkeys = Object.keys(dd.files || {});
      for (var fj = 0; fj < fkeys.length; fj++) {
        if (fkeys[fj] !== MANIFEST_KEY) fk += utf8len(dd.files[fkeys[fj]]);
      }
      var kb   = (fk / 1024).toFixed(1) + 'KB';
      var perms = dd.permissions || 'O/O';
      var info  = ('  • ' + dn + '   ' + perms + '  (' + fc + ' files, ' + kb + ')').padEnd(width - 2);
      console.log('║' + info + '║');
    }
  }

  console.log('║' + ' '.repeat(width - 2) + '║');
  console.log('║  Ready for connections...' + ' '.repeat(width - 28) + '║');
  console.log('║  Type \'help\' for server commands' + ' '.repeat(width - 36) + '║');
  console.log('╚' + border + '╝');
  console.log('');

  if (REGISTRY_URL) {
    getPublicIp(function (err, ip) {
      if (!err && ip) { _publicIp = ip; }
      registerWithRegistry(function (regErr) {
        if (regErr) {
          console.warn('Registry registration failed:', regErr.message || String(regErr));
        }
        startHeartbeat();
      });
    });
  }

  // ── Server console (stdin commands) ──────────────────────────────────────
  process.stdin.setEncoding('utf8');
  process.stdin.on('readable', function () {
    var chunk = process.stdin.read();
    if (chunk !== null) {
      var lines = chunk.split(/\r?\n/);
      for (var li = 0; li < lines.length; li++) {
        var cmd = lines[li].trim();
        if (cmd) processServerCommand(cmd);
      }
    }
  });
});

// Graceful shutdown: remove this server from registry
process.on('SIGINT', function () {
  deregisterFromRegistry();
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  process.exit(0);
});
process.on('SIGTERM', function () {
  deregisterFromRegistry();
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  process.exit(0);
});
