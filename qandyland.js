//
// ──── Qandyland Server ────────────────────────────────────────────────────────
//
// Node.js HTTP server for shared file storage on persistent JSON "drives"
// (like virtual disks) that mirror the manifest format used by qandy-dos.js.
//
// Usage: node qandyland.js [port]
// Default port: 8080
//
// Security: Session-based ownership via HTTP-only cookies.
// Persistence: Drive structure saved to drives.json on every change.
//
// Request format (POST /qandyland.js, Content-Type: application/json):
//   { "method": "create|mount|mkdir|chdir|rmdir|save|load|delete|rename|exists|dir|list",
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
// Hard-coded limits: modify source to change (not configurable via API or scripts)
var MAX_TOTAL_DRIVE_SIZE = 5 * 1024 * 1024; // 5 MB per drive
var MAX_FILE_BYTES = 32 * 1024;             // 32 KB per file
var MAX_DRIVE_FILES = 1000;
var SESSION_COOKIE = 'qsession';
var VALID_NAME_RE  = /^(?!\.)[A-Za-z0-9 \-_.()+=!]+$/;
var DRIVES_FILE    = 'drives.json';          // Legacy persistence file
var DRIVE_FILE_MARKER = '_qandy_drive';      // Marker present in all per-drive JSON files

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

function logRequest(req, method, drive, name, session, result) {
  var ts     = new Date().toISOString().slice(11, 19);
  var ip     = (req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || 'unknown')
    .replace('::ffff:', '').replace('::1', 'local').slice(0, 15);
  var action = (method  || '').slice(0, 8).padEnd(9);
  var drv    = (drive   || '-').slice(0, 8).padEnd(8);
  var file   = (name    || '-').slice(0, 12).padEnd(12);
  var sess   = (session || '').slice(0, 8).padEnd(8);
  var status = (result && result.success) ? 'SUCCESS' : 'FAILED';
  console.log('[' + ts + '] ' + ip.padEnd(15) + ' ' + action + ' ' + drv + ' ' + file + ' ' + sess + ' ' + status);
}

// ── In-memory storage ─────────────────────────────────────────────────────────
//
// drives[driveName] = {
//   manifest: [{ name, size, timestamp, owner, permissions, session }],
//   files:    { canonicalName: content_string },
//   dirs:     { dirName: { owner, created } },
//   owner:    session_or_'console',
//   created:  timestamp_string,
//   persistent:         bool   – true saves to {name}.json on every change
//   accessLevel:        string – 'sysop' | 'user' | 'public'
//   defaultPermissions: string – 4-char RNDW string applied to new files
// }
//
// File manifest entry fields:
//   owner       – script name from RUN= variable (organisational label, not security)
//   permissions – 4-char string: R=Read, N=Name(list), D=Delete, W=Write (guest access)
//   session     – session token of the client that created/last-wrote the file
//
var drives = {};

// ── Drive persistence ─────────────────────────────────────────────────────────

function calculateDriveStats(drive) {
  var fileCount = 0;
  var totalSize = 0;
  var files = drive.files || {};
  var keys = Object.keys(files);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] === MANIFEST_KEY) continue;
    fileCount++;
    totalSize += utf8len(files[keys[i]]);
  }
  return { fileCount: fileCount, totalSize: totalSize };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0B';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
  return Math.round(bytes / (1024 * 1024)) + 'MB';
}

// Save a single persistent drive to {driveName}.json
function saveDrive(driveName) {
  var drive = drives[driveName];
  if (!drive || !drive.persistent) return; // Memory-only drives are never persisted
  var data = {};
  data[DRIVE_FILE_MARKER] = true;
  data.id       = driveName;
  data.version  = '2.0';
  data.created  = drive.created || new Date().toISOString();
  data.owner    = drive.owner   || 'server';
  data.accessLevel        = drive.accessLevel        || 'public';
  data.defaultPermissions = drive.defaultPermissions || 'RNDW';
  data.persistent = true;
  data.manifest = drive.manifest || [];
  data.files    = drive.files    || {};
  data.dirs     = drive.dirs     || {};
  data.stats    = calculateDriveStats(drive);
  fs.writeFile(driveName + '.json', JSON.stringify(data, null, 2), function (err) {
    if (err) console.warn('Failed to save drive ' + driveName + ': ' + (err.message || String(err)));
  });
}

// Kept for legacy compatibility – saves all persistent drives
function saveDrives() {
  var names = Object.keys(drives);
  for (var i = 0; i < names.length; i++) {
    saveDrive(names[i]);
  }
}

function loadDrives() {
  var loaded = {};

  // Load per-drive JSON files (new format: {driveName}.json with DRIVE_FILE_MARKER)
  try {
    var files = fs.readdirSync('.');
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      if (!f.endsWith('.json')) continue;
      try {
        var content = fs.readFileSync(f, 'utf8');
        var info = JSON.parse(content);
        if (!info[DRIVE_FILE_MARKER]) continue; // Skip non-drive JSON files
        var n = normName(info.id || f.slice(0, -5));
        if (!n || !validateName(n).ok) continue;
        drives[n] = {
          manifest:           info.manifest           || [],
          files:              info.files              || {},
          dirs:               info.dirs               || {},
          owner:              info.owner              || 'server',
          created:            info.created            || new Date().toISOString(),
          accessLevel:        info.accessLevel        || 'public',
          defaultPermissions: info.defaultPermissions || 'RNDW',
          persistent: true
        };
        loaded[n] = true;
      } catch (e) {
        // Skip files that are not valid drive JSON
      }
    }
  } catch (e) {
    // Ignore directory read errors
  }

  // Backward compat: also load from legacy drives.json (created by the old server)
  try {
    var legacyRaw  = fs.readFileSync(DRIVES_FILE, 'utf8');
    var legacyData = JSON.parse(legacyRaw);
    var names = Object.keys(legacyData.drives || {});
    for (var j = 0; j < names.length; j++) {
      var ln = names[j];
      if (loaded[ln]) continue; // Per-drive file takes precedence
      var d = legacyData.drives[ln];
      drives[ln] = {
        manifest:           d.manifest || [],
        files:              d.files    || {},
        dirs:               d.dirs     || {},
        owner:              d.owner    || 'server',
        created:            d.created  || new Date().toISOString(),
        accessLevel:        'public',
        defaultPermissions: 'RNDW',
        persistent: true
      };
    }
  } catch (e) {
    // No legacy drives.json – fine
  }
}

// ── Console display ───────────────────────────────────────────────────────────

var BOX_WIDTH = 62; // inner width between ║ characters

function _boxLine(text) {
  // Pad or truncate text to exactly BOX_WIDTH chars, wrap in ║
  var s = (text == null ? '' : String(text));
  if (s.length > BOX_WIDTH) s = s.slice(0, BOX_WIDTH);
  return '║' + s + ' '.repeat(BOX_WIDTH - s.length) + '║';
}

function displayStartupBanner(publicIP, registryStatus, serverId) {
  var line = '═'.repeat(BOX_WIDTH);
  console.log('╔' + line + '╗');
  console.log(_boxLine('                    QANDYLAND SERVER'));
  console.log('╠' + line + '╣');

  var portStr  = 'Port: ' + String(PORT).padEnd(25);
  var ipStr    = 'Public IP: ' + (publicIP || '(unknown)').padEnd(15);
  console.log(_boxLine(' ' + portStr + ' ' + ipStr));

  var regStr  = 'Registry: ' + registryStatus.padEnd(21);
  var idStr   = 'Server ID: ' + (serverId || '(none)').slice(0, 15);
  console.log(_boxLine(' ' + regStr + ' ' + idStr));

  console.log(_boxLine(''));
  console.log(_boxLine(' Available Drives:'));

  var driveNames = Object.keys(drives);
  if (driveNames.length === 0) {
    console.log(_boxLine('   (no drives created yet)'));
  } else {
    for (var i = 0; i < driveNames.length; i++) {
      var n     = driveNames[i];
      var stats = calculateDriveStats(drives[n]);
      var created = '';
      try {
        var d = new Date(drives[n].created);
        created = isNaN(d.getTime()) ? '(invalid date)' : d.toISOString().split('T')[0];
      } catch (e) {
        created = '(invalid date)';
      }
      var entry = '   \u2022 ' + n.padEnd(10) +
        '(' + stats.fileCount + ' file' + (stats.fileCount !== 1 ? 's' : '') +
        ', ' + formatBytes(stats.totalSize) + ')' +
        (created ? ' - Created ' + created : '');
      console.log(_boxLine(entry));
    }
  }

  console.log(_boxLine(''));
  console.log(_boxLine(' Ready for connections...'));
  console.log('╚' + line + '╝');
  console.log('');
  console.log('[TIME    ] CLIENT          ACTION    DRIVE    FILE         SESSION  RESULT');
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

// ── Permission check ──────────────────────────────────────────────────────────
// Determines whether a request context may perform 'action' on 'file'.
//
// context: 'sysop' – host machine (always has full access, like root/administrator)
//          'user'  – guest iframe (access governed by the file's 4-bit RNDW string)
//
// action:  'read'   – load file content
//          'name'   – see filename in directory listings
//          'delete' – remove file
//          'write'  – create or overwrite file
//
// RNDW permission string (file.permissions):
//   [0] R – guest can Read (load content)
//   [1] N – guest can see Name in listings
//   [2] D – guest can Delete
//   [3] W – guest can Write (create/overwrite)
//   '-' in any position means the permission is denied for guests.
//   Example: 'RNDW' = full guest access, 'RN--' = read-only, '----' = no guest access
//
// qandyland.js (the server owner) always bypasses this check entirely.
function canGuestAccess(file, context, action) {
  if (context === 'sysop') return true; // Sysop always has full access
  var perms = (file && file.permissions) || 'RNDW'; // Default: full access (backward compat)
  switch (action) {
    case 'read':   return perms[0] === 'R';
    case 'name':   return perms[1] === 'N';
    case 'delete': return perms[2] === 'D';
    case 'write':  return perms[3] === 'W';
  }
  return false;
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

// Map a drive access level to its default file permission string.
// sysop = no guest access, user = read-only for guests, public = full guest access.
function defaultPermsForAccessLevel(accessLevel) {
  if (accessLevel === 'sysop') return '----';
  if (accessLevel === 'user')  return 'RN--';
  return 'RNDW'; // public (default)
}

// persistent    – true: saved to {name}.json on disk; false: memory-only, cleared on restart
// accessLevel   – 'sysop' | 'user' | 'public'  (drive-level gate; sysop ignores this)
// defaultPerms  – 4-char RNDW string applied to new files created on this drive
function driveCreate(driveName, session, persistent, accessLevel, defaultPerms) {
  var name = normName(driveName);
  var fv = validateName(name);
  if (!fv.ok) return { success: false, error: 'invalid drive name: ' + fv.reason };
  if (drives[name]) return { success: false, error: 'drive already exists' };

  // Validate and normalise optional parameters
  var isPersistent = (persistent === true || persistent === 'true');
  var access = (accessLevel === 'sysop' || accessLevel === 'user') ? accessLevel : 'public';
  var perms = defaultPermsForAccessLevel(access);
  if (typeof defaultPerms === 'string' && /^[R\-][N\-][D\-][W\-]$/.test(defaultPerms)) {
    perms = defaultPerms; // Caller may supply an explicit override
  }

  var ts = timestamp();
  drives[name] = {
    manifest:           [],
    files:              {},
    dirs:               {},
    owner:              session,
    created:            ts,
    persistent:         isPersistent,
    accessLevel:        access,
    defaultPermissions: perms
  };

  // Create the root manifest entry
  _saveManifest(name, []);

  if (isPersistent) saveDrive(name);
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
      (e.owner || '') + '|' + (e.permissions || '----') + '|' + (e.session || '')
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
  drive.manifest.push({ name: MANIFEST_KEY, size: utf8len(full), timestamp: ts, owner: '', permissions: '----', session: '' });
}

// context: 'sysop' | 'user'  (from pkt.context sent by qandy-dos.js)
// owner:   script label from RUN= variable (organizational, not security)
function fileSave(driveName, cwd, name, content, session, context, owner) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var fname = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var fv = validateName(baseName(fname));
  if (!fv.ok) return { success: false, error: fv.reason };

  var canonical = resolveName(cwd, fname);
  var existing  = _findEntry(drive.manifest, fname);
  var ctx = context || 'user';

  // Write-protection check (always honoured, even for sysop)
  if (existing && isWriteProtected(existing.name)) {
    return { success: false, error: 'file is write-protected' };
  }

  // Drive-level gate: sysop-only drives reject user-context requests
  if (ctx !== 'sysop' && drive.accessLevel === 'sysop') {
    return { success: false, error: 'permission denied' };
  }

  // File-level permission check for user context
  if (existing && !canGuestAccess(existing, ctx, 'write')) {
    return { success: false, error: 'permission denied' };
  }

  var str  = String(content == null ? '' : content);
  var size = utf8len(str);

  if (size > MAX_FILE_BYTES) {
    return { success: false, error: 'file too large (max ' + formatBytes(MAX_FILE_BYTES) + ')' };
  }
  if (!existing && drive.manifest.length >= MAX_DRIVE_FILES) {
    return { success: false, error: 'drive full' };
  }

  // Drive total size check
  var stats = calculateDriveStats(drive);
  var oldSize = (existing && drive.files[canonical]) ? utf8len(drive.files[canonical]) : 0;
  if (stats.totalSize - oldSize + size > MAX_TOTAL_DRIVE_SIZE) {
    return { success: false, error: 'drive storage limit exceeded (max ' + formatBytes(MAX_TOTAL_DRIVE_SIZE) + ')' };
  }

  var ts = timestamp();
  drive.files[canonical] = str;

  // Preserve existing permissions when overwriting; use drive default for new files
  var permissions = (existing && existing.permissions) || drive.defaultPermissions || 'RNDW';

  // Update manifest
  var manifest = drive.manifest.filter(function (e) {
    return e.name !== MANIFEST_KEY && baseName(normName(e.name)).toLowerCase() !== baseName(normName(fname)).toLowerCase();
  });
  manifest.push({
    name:        fname,
    size:        size,
    timestamp:   ts,
    owner:       owner || session,   // script label (RUN=) or fall back to session token
    permissions: permissions,
    session:     session
  });
  _saveManifest(driveName, manifest);

  if (drive.persistent) saveDrive(driveName);
  return { success: true, result: true };
}

function fileLoad(driveName, cwd, name, session, context) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var fname    = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var canonical = resolveName(cwd, fname);
  var existing  = _findEntry(drive.manifest, fname);
  var ctx = context || 'user';

  if (!existing) return { success: false, error: 'file not found' };

  // Drive-level gate
  if (ctx !== 'sysop' && drive.accessLevel === 'sysop') {
    return { success: false, error: 'permission denied' };
  }

  // File-level permission check
  if (!canGuestAccess(existing, ctx, 'read')) {
    return { success: false, error: 'permission denied' };
  }

  var content = drive.files[canonical];
  if (content == null) return { success: false, error: 'file not found' };

  return { success: true, content: content };
}

function fileDelete(driveName, cwd, name, session, context) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var fname    = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var canonical = resolveName(cwd, fname);
  var existing  = _findEntry(drive.manifest, fname);
  var ctx = context || 'user';

  if (!existing) return { success: false, error: 'file not found' };
  if (isWriteProtected(existing.name)) return { success: false, error: 'file is write-protected' };

  // Drive-level gate
  if (ctx !== 'sysop' && drive.accessLevel === 'sysop') {
    return { success: false, error: 'permission denied' };
  }

  // File-level permission check
  if (!canGuestAccess(existing, ctx, 'delete')) {
    return { success: false, error: 'permission denied' };
  }

  delete drive.files[canonical];
  var manifest = drive.manifest.filter(function (e) {
    return e.name !== MANIFEST_KEY && baseName(normName(e.name)).toLowerCase() !== baseName(normName(fname)).toLowerCase();
  });
  _saveManifest(driveName, manifest);

  if (drive.persistent) saveDrive(driveName);
  return { success: true, result: 'deleted' };
}

function fileRename(driveName, cwd, name, dest, session, context) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

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
  var ctx = context || 'user';

  if (!existing) return { success: false, error: 'file not found' };
  if (isWriteProtected(existing.name)) return { success: false, error: 'file is write-protected' };

  // Drive-level gate
  if (ctx !== 'sysop' && drive.accessLevel === 'sysop') {
    return { success: false, error: 'permission denied' };
  }

  // Rename requires write permission on the source
  if (!canGuestAccess(existing, ctx, 'write')) {
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
  manifest.push({
    name:        dname,
    size:        existing.size,
    timestamp:   ts,
    owner:       existing.owner || session,
    permissions: existing.permissions || drive.defaultPermissions || 'RNDW',
    session:     existing.session || session
  });
  _saveManifest(driveName, manifest);

  if (drive.persistent) saveDrive(driveName);
  return { success: true, result: 'renamed' };
}

function fileExists(driveName, cwd, name, session, context) {
  var drive = drives[driveName];
  if (!drive) return { success: true, exists: false };

  var fname    = normName(name);
  if (!fname) return { success: true, exists: false };
  var existing  = _findEntry(drive.manifest, fname);
  if (!existing) return { success: true, exists: false };

  var ctx = context || 'user';

  // Drive-level gate
  if (ctx !== 'sysop' && drive.accessLevel === 'sysop') {
    return { success: true, exists: false };
  }

  // Files not visible to guest if 'name' bit is denied
  if (!canGuestAccess(existing, ctx, 'name')) {
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
  if (drive.persistent) saveDrive(driveName);
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

function dirRemove(driveName, cwd, name, session, context) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var dirName   = normName(name);
  if (!dirName) return { success: false, error: 'invalid directory name' };
  var canonical = resolveName(cwd, dirName);
  if (!drive.dirs[canonical]) return { success: false, error: 'directory not found' };

  var ctx = context || 'user';
  // Drive-level gate
  if (ctx !== 'sysop' && drive.accessLevel === 'sysop') {
    return { success: false, error: 'permission denied' };
  }

  var dirEntry = drive.dirs[canonical];
  // Non-sysop may only remove dirs they created
  if (ctx !== 'sysop' && dirEntry.owner && dirEntry.owner !== session) {
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
  if (drive.persistent) saveDrive(driveName);
  return { success: true, result: 'done' };
}

function dirList(driveName, cwd, pattern, switches, session, context) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var ctx = context || 'user';
  // Drive-level gate
  if (ctx !== 'sysop' && drive.accessLevel === 'sysop') {
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

  // Files – only include entries the caller is permitted to see ('name' bit)
  var entries = drive.manifest.filter(function (e) {
    if (e.name === MANIFEST_KEY) return showHidden;
    if (!showHidden && isHidden(e.name)) return false;
    if (!canGuestAccess(e, ctx, 'name')) return false;
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
    lines.push('  ' + ts + '  ' + sz.padStart(8) + '  ' + e.name + '\n');
  }

  lines.push('\n');
  lines.push(entries.length + ' file(s)\n');

  return { success: true, listing: lines.join('') };
}

function fileList(driveName, cwd, pattern, session, context) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var ctx = context || 'user';
  // Drive-level gate
  if (ctx !== 'sysop' && drive.accessLevel === 'sysop') {
    return { success: false, error: 'permission denied' };
  }

  var dir   = (cwd || '/').replace(/^\//, '').replace(/\/$/, '');
  var names = [];

  var entries = drive.manifest.filter(function (e) {
    if (e.name === MANIFEST_KEY) return false;
    if (!canGuestAccess(e, ctx, 'name')) return false;
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

    var method  = normName(pkt.method  || '').toLowerCase();
    var drive   = normName(pkt.drive   || '');
    var cwd     = normName(pkt.cwd     || '/');
    var name    = normName(pkt.name    || '');
    var dest    = normName(pkt.dest    || '');
    var content = pkt.content != null ? String(pkt.content) : '';
    var options = pkt.options || {};
    var pattern = normName(pkt.pattern  || '');
    var switches = normName(pkt.switches || '');
    // Context: 'sysop' (host machine) or 'user' (guest iframe) – sent by qandy-dos.js
    var context = (pkt.context === 'sysop') ? 'sysop' : 'user';
    // Owner: script name from RUN= variable (organisational label, not security)
    var owner = normName(pkt.owner || '');

    var result;
    switch (method) {
      case 'create':
        logRequest(req, method, name || drive, '', session, { success: false, error: 'restricted' });
        return respond(res, { success: false, error: 'Drive creation restricted to server administrator. Use the server console.' });

      case 'mount':
        result = driveMount(name || drive, session);
        logRequest(req, method, name || drive, '', session, result);
        return respond(res, result);

      case 'save':
        result = fileSave(drive, cwd, name, content, session, context, owner);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'load':
        result = fileLoad(drive, cwd, name, session, context);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'delete':
        result = fileDelete(drive, cwd, name, session, context);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'rename':
        result = fileRename(drive, cwd, name, dest, session, context);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'exists':
        result = fileExists(drive, cwd, name, session, context);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'mkdir':
        result = dirMake(drive, cwd, name, session);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'chdir':
        result = dirChange(drive, cwd, name, session);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'rmdir':
        result = dirRemove(drive, cwd, name, session, context);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'dir':
        result = dirList(drive, cwd, pattern, switches, session, context);
        logRequest(req, method, drive, pattern, session, result);
        return respond(res, result);

      case 'list':
        result = fileList(drive, cwd, pattern, session, context);
        logRequest(req, method, drive, pattern, session, result);
        return respond(res, result);

      default:
        result = { success: false, error: 'unknown method: ' + method };
        logRequest(req, method || '(unknown)', drive, name, session, result);
        return respond(res, result);
    }
  }).catch(function (err) {
    respond(res, { success: false, error: 'server error: ' + err.message });
  });
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

// ── Load persisted drives before starting the server ─────────────────────────

loadDrives();

// ── Server console (stdin) command processing ─────────────────────────────────

if (process.stdin.isTTY) {
  process.stdin.setEncoding('utf8');

  // State for the Alpine Linux-style interactive drive creation wizard.
  // null = not in wizard; otherwise an object tracking the current step.
  var _createWizard = null;

  function _wizardPrompt(msg) {
    process.stdout.write(msg);
  }

  // Start the interactive drive-creation wizard
  function _startCreateWizard() {
    _createWizard = { step: 'server_name' };
    _wizardPrompt('\nServer Name [' + (SERVER_NAME || 'Qandyland') + ']: ');
  }

  // Process one line of input while the wizard is active
  function _wizardStep(line) {
    var w = _createWizard;
    var trimmed = line.trim();

    switch (w.step) {
      case 'server_name':
        // Update the server's display name used in registry heartbeats and the startup banner.
        // Press ENTER to keep the current name (shown as the default in brackets).
        if (trimmed) SERVER_NAME = trimmed;
        var driveNames = Object.keys(drives);
        if (driveNames.length === 0) {
          process.stdout.write('\nNo JSON drives found.\n');
        } else {
          process.stdout.write('\nExisting drives: ' + driveNames.join(', ') + '\n');
        }
        var defaultDrive = driveNames.length === 0 ? 'ctf-game' : 'new-drive';
        w.defaultDrive = defaultDrive;
        w.step = 'drive_name';
        _wizardPrompt('\nInput name of drive to create [' + defaultDrive + ']: ');
        break;

      case 'drive_name':
        w.driveName = trimmed || w.defaultDrive;
        w.step = 'persistent';
        _wizardPrompt('\n[P]ersistent or [T]emporary data? [T]: ');
        break;

      case 'persistent':
        w.persistent = (trimmed.toLowerCase() === 'p');
        w.step = 'access_level';
        process.stdout.write('\nDrive access level:\n');
        process.stdout.write('  [S] Sysop access only\n');
        process.stdout.write('  [U] User/Player access\n');
        process.stdout.write('  [P] Public access\n');
        _wizardPrompt('Default [P]: ');
        break;

      case 'access_level': {
        var letter = trimmed.toLowerCase() || 'p';
        var accessLevel;
        if (letter === 's')      accessLevel = 'sysop';
        else if (letter === 'u') accessLevel = 'user';
        else                     accessLevel = 'public';
        var cr = driveCreate(w.driveName, 'console', w.persistent, accessLevel);
        if (cr.success) {
          var typeStr   = w.persistent ? 'persistent' : 'temporary (memory)';
          var accessStr;
          if (accessLevel === 'sysop')     accessStr = 'Sysop access only';
          else if (accessLevel === 'user') accessStr = 'User/Player access';
          else                             accessStr = 'Public access';
          process.stdout.write('\nCreated ' + typeStr + ' drive \'' + w.driveName + '\' with ' + accessStr + '.\n');
          if (w.persistent) {
            process.stdout.write('Drive file: ' + w.driveName + '.json\n');
          }
        } else {
          process.stdout.write('\nError: ' + cr.error + '\n');
        }
        _createWizard = null;
        process.stdout.write('\n> ');
        break;
      }
    }
  }

  var _stdinBuf = '';
  process.stdin.on('data', function (chunk) {
    _stdinBuf += chunk;
    var lines = _stdinBuf.split('\n');
    _stdinBuf = lines.pop();
    lines.forEach(function (line) {
      // While the creation wizard is active, feed all input to it
      if (_createWizard) {
        _wizardStep(line);
        return;
      }

      var trimmed = line.trim();
      if (!trimmed) return;
      var parts = trimmed.split(/\s+/);
      var cmd   = parts[0].toLowerCase();
      var arg   = parts.slice(1).join(' ');

      switch (cmd) {
        case 'create':
          _startCreateWizard();
          break;

        case 'list': {
          var names = Object.keys(drives);
          if (names.length === 0) {
            process.stdout.write('No drives.\n');
          } else {
            process.stdout.write('Drives:\n');
            names.forEach(function (n) {
              var d = drives[n];
              var stats = calculateDriveStats(d);
              var typeLabel  = d.persistent ? 'persistent' : 'memory';
              var accessLabel = d.accessLevel || 'public';
              process.stdout.write('  ' + n + '  [' + typeLabel + ', ' + accessLabel + ']' +
                '  ' + stats.fileCount + ' file(s), ' + formatBytes(stats.totalSize) + '\n');
            });
          }
          break;
        }

        case 'delete':
          if (!arg) { process.stdout.write('Usage: delete <name>\n'); break; }
          var dn = normName(arg);
          if (!drives[dn]) {
            process.stdout.write('Error: drive "' + dn + '" not found.\n');
          } else {
            process.stdout.write('Warning: All data on drive "' + dn + '" will be permanently lost.\n');
            var wasPersistent = drives[dn].persistent;
            delete drives[dn];
            if (wasPersistent) {
              // Remove the per-drive file
              try { fs.unlinkSync(dn + '.json'); } catch (e) { /* ignore */ }
            }
            process.stdout.write('Drive "' + dn + '" deleted.\n');
          }
          break;

        case 'perms':
          if (!arg) { process.stdout.write('Usage: perms <drive> <file> [RNDW]\n'); break; }
          var permParts = arg.split(/\s+/);
          var permDrive = normName(permParts[0] || '');
          var permFile  = normName(permParts[1] || '');
          var newPerms  = normName(permParts[2] || '');
          if (!drives[permDrive]) { process.stdout.write('Error: drive "' + permDrive + '" not found.\n'); break; }
          var permEntry = _findEntry(drives[permDrive].manifest, permFile);
          if (!permEntry) { process.stdout.write('Error: file "' + permFile + '" not found.\n'); break; }
          if (newPerms) {
            if (!/^[R\-][N\-][D\-][W\-]$/.test(newPerms)) {
              process.stdout.write('Error: permissions must be a 4-char string like "RNDW" or "RN--".\n'); break;
            }
            permEntry.permissions = newPerms;
            var mf = drives[permDrive].manifest.filter(function (e) { return e.name !== MANIFEST_KEY; });
            _saveManifest(permDrive, mf);
            if (drives[permDrive].persistent) saveDrive(permDrive);
            process.stdout.write('Permissions for "' + permFile + '" set to ' + newPerms + '\n');
          } else {
            process.stdout.write('"' + permFile + '" permissions: ' + (permEntry.permissions || '----') + '\n');
          }
          break;

        case 'help':
          process.stdout.write(
            'Server console commands:\n' +
            '  create              - Create a new drive (interactive wizard)\n' +
            '  list                - List all drives with type and access level\n' +
            '  delete <name>       - Delete a drive and its data\n' +
            '  perms <drive> <file> [RNDW]  - View or set file permissions\n' +
            '  help                - Show this help\n' +
            '\nPermission string format: RNDW\n' +
            '  R = guest can Read   N = guest sees Name in listings\n' +
            '  D = guest can Delete W = guest can Write\n' +
            '  Use - to deny:  RN-- = read-only   ---- = sysop only   RNDW = full access\n'
          );
          break;

        default:
          process.stdout.write('Unknown command "' + cmd + '". Type "help" for commands.\n');
      }
    });
  });
}


server.listen(PORT, function () {
  if (process.stdin.isTTY) {
    process.stdout.write('Server console ready. Type "help" for commands.\n');
  }
  if (REGISTRY_URL) {
    getPublicIp(function (err, ip) {
      if (err || !ip) {
        _publicIp = null;
      } else {
        _publicIp = ip;
      }
      registerWithRegistry(function (regErr) {
        var regStatus = regErr ? 'Failed' : 'Connected';
        displayStartupBanner(_publicIp, regStatus, _serverId);
        startHeartbeat();
      });
    });
  } else {
    displayStartupBanner(null, 'Disabled', null);
  }
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
