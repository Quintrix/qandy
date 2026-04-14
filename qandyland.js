//
//
// ──── Qandyland Server v2 ────────────────────────────────────────────────────
//
// Simplified server storage using a single array per drive.
// Fixes manifest saving issues by eliminating the dual-state manifest/files.
//
// Usage: node qandyland2.js [port]
// Default port: 8080
//
// Storage structure: drive.storage = [[key, value], ...]
//   Files:       ["path/to/file.txt", "file content"]
//   Directories: ["<path/to/dir>", ""]
//   Manifest:    ["_dir.sys!", "name|size|timestamp|owner|session\n..."]
//
// Manifest format (compatible with qandy-dos.js localStorage):
//   Each non-manifest line: name|size|timestamp|owner|session
//   Self-entry (last line): _dir.sys!|manifestsize|timestamp
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
var SESSION_COOKIE = 'q';
var VALID_NAME_RE        = /^(?!\.)[A-Za-z0-9 \-_.()+=!]+$/;
var VALID_SERVER_NAME_RE = /^(?!\.)[A-Za-z0-9 \-_.()+=]+$/; // server/drive names (no !)
var MAX_SERVER_NAME_LEN  = 24;
var SERVER_CONFIG_FILE = 'qandyland.json';   // Server config file in the working directory

var MAX_PLAYERS    = 100;

// Session → { itemId, mapId, drive } ownership map: ensures a session can only
// control the item it joined with.  Best-effort for same-origin connections.
var _playerOwnership = {};

// Default center z-position for player spawn on an 8-column map (mapx=7).
// Calculated as: y=5, x=3 → z = y*(mapx+1) + x = 5*8 + 3 = 43.
var DEFAULT_SPAWN_Z = '43';

// ── Server discovery / registry ───────────────────────────────────────────────

// Configurable via command-line: node qandyland2.js [port] [--name "..."] [--registry "url"] [--maxPlayers N]
var SERVER_NAME    = 'Qandyland Server';
var SERVER_VERSION = '2.0';
var REGISTRY_URL   = 'https://qandy.vercel.app/api/servers';
var _serverId = null;          // assigned by registry on first POST
var _publicIp = null;          // detected once on startup
var _heartbeatTimer = null;
var _serverStartTime = Date.now(); // used for uptime reporting

// Parse extended command-line arguments
var _cliName     = null;
(function () {
  var args = process.argv.slice(2);
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--registry'   && args[i + 1]) { REGISTRY_URL = args[++i]; }
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
//   storage: [[key, value], ...]  – single array holding everything:
//              ["path/to/file.txt", "content"]      – regular file
//              ["<path/to/dir>", ""]                – directory token
//              ["_dir.sys!", "manifest_text"]       – manifest file
//   owner:   session_or_'console',
//   created: timestamp_string
// }
//
// Manifest text format (one line per entry):
//   name|size|timestamp|owner|session
//   _dir.sys!|manifestsize|timestamp
//
var drives = {};

// ── Storage helpers ───────────────────────────────────────────────────────────

// Find the index of a key in the storage array. Returns -1 if not found.
function _storageIndex(storage, key) {
  for (var i = 0; i < storage.length; i++) {
    if (storage[i][0] === key) return i;
  }
  return -1;
}

// Get a value from the storage array by key. Returns null if not found.
function _storageGet(storage, key) {
  var idx = _storageIndex(storage, key);
  return idx >= 0 ? storage[idx][1] : null;
}

// Set a value in the storage array. Inserts if key not found, updates if found.
function _storageSet(storage, key, value) {
  var idx = _storageIndex(storage, key);
  if (idx >= 0) {
    storage[idx][1] = value;
  } else {
    storage.push([key, value]);
  }
}

// Delete an entry from the storage array by key.
function _storageDelete(storage, key) {
  var idx = _storageIndex(storage, key);
  if (idx >= 0) storage.splice(idx, 1);
}

// ── Manifest helpers ──────────────────────────────────────────────────────────

// Parse manifest text into an array of entry objects.
// Format per line: name|size|timestamp|owner|session
function _parseManifestText(text) {
  var entries = [];
  if (!text) return entries;
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var parts = line.split('|');
    if (parts.length < 3) continue;
    var name = parts[0].trim();
    if (!name) continue;
    entries.push({
      name:      name,
      size:      parseInt(parts[1], 10) || 0,
      timestamp: parts[2] || '',
      owner:     parts[3] || '',
      session:   parts[4] || ''
    });
  }
  return entries;
}

// Read the current manifest entries from a drive's storage array.
function _readManifest(driveName) {
  var drive = drives[driveName];
  if (!drive) return [];
  var text = _storageGet(drive.storage, MANIFEST_KEY);
  return _parseManifestText(text);
}

// Serialize manifest entries to text and store it in the drive's storage array.
// entries – array of { name, size, timestamp, owner, session } (must not include MANIFEST_KEY itself)
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
      (e.owner || '') + '|' + (e.session || '')
    );
  }
  var body     = lines.length ? lines.join('\n') + '\n' : '';
  var selfLine = MANIFEST_KEY + '|0|' + ts;
  var full     = body + selfLine;
  var mSize    = utf8len(full);
  selfLine     = MANIFEST_KEY + '|' + mSize + '|' + ts;
  full         = body + selfLine;

  // One more pass: recalculate in case size string length changed
  var finalSize = utf8len(full);
  if (finalSize !== mSize) {
    selfLine = MANIFEST_KEY + '|' + finalSize + '|' + ts;
    full     = body + selfLine;
  }

  _storageSet(drive.storage, MANIFEST_KEY, full);
}

// ── Drive stats ───────────────────────────────────────────────────────────────

function calculateDriveStats(drive) {
  var fileCount = 0;
  var totalSize = 0;
  var storage = drive.storage || [];
  for (var i = 0; i < storage.length; i++) {
    var key = storage[i][0];
    var val = storage[i][1];
    if (key === MANIFEST_KEY) continue;
    if (key.charAt(0) === '<') continue; // directory token
    fileCount++;
    totalSize += utf8len(val);
  }
  return { fileCount: fileCount, totalSize: totalSize };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0B';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
  return Math.round(bytes / (1024 * 1024)) + 'MB';
}

// ── Server configuration ──────────────────────────────────────────────────────

// Load server configuration from the working directory.
// Returns the parsed config object, or {} if no config file exists.
function loadServerConfig() {
  var configPath = path.join(process.cwd(), SERVER_CONFIG_FILE);
  try {
    var raw = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {}
  return {};
}

// Save server configuration to the working directory.
// Only saves serverName and drives list (no sensitive path information).
function saveServerConfig(cfg) {
  try {
    fs.writeFileSync(path.join(process.cwd(), SERVER_CONFIG_FILE), JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.warn('Failed to save server config: ' + (e.message || String(e)));
  }
}

// ── Console display ───────────────────────────────────────────────────────────

var BOX_WIDTH = 62; // inner width between ║ characters

function _boxLine(text) {
  var s = (text == null ? '' : String(text));
  if (s.length > BOX_WIDTH) s = s.slice(0, BOX_WIDTH);
  return '║' + s + ' '.repeat(BOX_WIDTH - s.length) + '║';
}

function displayStartupBanner(publicIP, registryStatus, serverId) {
  var line = '═'.repeat(BOX_WIDTH);
  console.log('╔' + line + '╗');
  console.log(_boxLine('                  QANDYLAND SERVER v2'));
  console.log('╠' + line + '╣');

  console.log(_boxLine(' Server: ' + SERVER_NAME));
  console.log(_boxLine(''));

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
  var b = n;
  var slash = n.lastIndexOf('/');
  if (slash >= 0) b = n.substring(slash + 1);
  return b.charAt(0) === '_';
}

// Resolve a name against cwd, return canonical path (without leading /)
function resolveName(cwd, name) {
  var base = (cwd || '/').replace(/^\//, '').replace(/\/$/, '');
  var n = normName(name);
  if (n.indexOf('/') >= 0) {
    return n.replace(/^\//, '');
  }
  return base ? (base + '/' + n) : n;
}

// Get/create a session token from cookie header
function getSession(req, res) {
  var cookieHeader = req.headers['cookie'] || '';
  var match = cookieHeader.match(new RegExp('(?:^|;)\\s*' + SESSION_COOKIE + '=([^;]+)'));
  if (match) return match[1];

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

function driveCreate(driveName, session) {
  var name = normName(driveName);
  var fv = validateName(name);
  if (!fv.ok) return { success: false, error: 'invalid drive name: ' + fv.reason };
  if (drives[name]) return { success: false, error: 'drive already exists' };

  var ts = timestamp();
  drives[name] = {
    storage: [],
    owner:   session,
    created: ts
  };

  // Initialize the manifest with an empty entry
  _saveManifest(name, []);

  return { success: true, result: 'drive created' };
}

function driveMount(driveName, session) {
  var name = normName(driveName);
  if (!drives[name]) return { success: false, error: 'drive not found' };
  return { success: true, result: 'server://' + name + '/', cwd: '/' };
}

// Find a manifest entry by basename (case-insensitive, ignores hidden/protected markers).
function _findEntry(manifest, userInput) {
  var base = baseName(normName(userInput)).toLowerCase();
  for (var i = 0; i < manifest.length; i++) {
    var entry = manifest[i];
    if (baseName(normName(entry.name)).toLowerCase() === base) return entry;
  }
  return null;
}

function fileSave(driveName, cwd, name, content, session, owner) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var fname = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var fv = validateName(baseName(fname));
  if (!fv.ok) return { success: false, error: fv.reason };

  var canonical = resolveName(cwd, fname);
  var manifest  = _readManifest(driveName);

  // Find existing entry by canonical path (exact match prevents cross-directory collisions)
  var existing = null;
  for (var fi = 0; fi < manifest.length; fi++) {
    if (manifest[fi].name === canonical) { existing = manifest[fi]; break; }
  }

  // Write-protection check
  if (existing && isWriteProtected(existing.name)) {
    return { success: false, error: 'file is write-protected' };
  }

  var str  = String(content == null ? '' : content);
  var size = utf8len(str);

  if (size > MAX_FILE_BYTES) {
    return { success: false, error: 'file too large (max ' + formatBytes(MAX_FILE_BYTES) + ')' };
  }

  var stats = calculateDriveStats(drive);
  if (!existing && stats.fileCount >= MAX_DRIVE_FILES) {
    return { success: false, error: 'drive full' };
  }

  // Drive total size check
  var oldSize = existing ? existing.size : 0;
  if (stats.totalSize - oldSize + size > MAX_TOTAL_DRIVE_SIZE) {
    return { success: false, error: 'drive storage limit exceeded (max ' + formatBytes(MAX_TOTAL_DRIVE_SIZE) + ')' };
  }

  var ts = timestamp();
  _storageSet(drive.storage, canonical, str);

  // Update manifest: remove old entry by canonical name, add updated entry
  var newManifest = manifest.filter(function (e) {
    return e.name !== MANIFEST_KEY && e.name !== canonical;
  });
  newManifest.push({
    name:      canonical,
    size:      size,
    timestamp: ts,
    owner:     owner || session,
    session:   session
  });
  _saveManifest(driveName, newManifest);

  return { success: true, result: true };
}

function fileLoad(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var fname    = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var canonical = resolveName(cwd, fname);
  var manifest  = _readManifest(driveName);

  // Find entry by canonical path
  var existing = null;
  for (var fi = 0; fi < manifest.length; fi++) {
    if (manifest[fi].name === canonical) { existing = manifest[fi]; break; }
  }

  if (!existing) return { success: false, error: 'file not found' };

  var content = _storageGet(drive.storage, canonical);
  if (content == null) return { success: false, error: 'file not found' };

  return { success: true, content: content };
}

// Append an element to a JSON array stored in a file.
// If the file does not exist it is created with a single-element array.
// Returns { success, error } like other file operations.
function fileAppendJSON(driveName, cwd, name, element, session, owner) {
  var existing = fileLoad(driveName, cwd, name, session);
  var arr = [];
  if (existing.success) {
    try { arr = JSON.parse(existing.content); } catch (e) { arr = []; }
    if (!Array.isArray(arr)) arr = [];
  }
  arr.push(element);
  return fileSave(driveName, cwd, name, JSON.stringify(arr), session, owner);
}

function fileDelete(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var fname    = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var canonical = resolveName(cwd, fname);
  var manifest  = _readManifest(driveName);

  // Find entry by canonical path
  var existing = null;
  for (var fi = 0; fi < manifest.length; fi++) {
    if (manifest[fi].name === canonical) { existing = manifest[fi]; break; }
  }

  if (!existing) return { success: false, error: 'file not found' };
  if (isWriteProtected(existing.name)) return { success: false, error: 'file is write-protected' };

  _storageDelete(drive.storage, canonical);

  var newManifest = manifest.filter(function (e) {
    return e.name !== MANIFEST_KEY && e.name !== canonical;
  });
  _saveManifest(driveName, newManifest);

  return { success: true, result: 'deleted' };
}

function fileRename(driveName, cwd, name, dest, session) {
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
  var manifest      = _readManifest(driveName);

  // Find by canonical path
  var existing = null, destExisting = null;
  for (var fi = 0; fi < manifest.length; fi++) {
    if (manifest[fi].name === srcCanonical)  existing     = manifest[fi];
    if (manifest[fi].name === destCanonical) destExisting = manifest[fi];
  }

  if (!existing) return { success: false, error: 'file not found' };
  if (isWriteProtected(existing.name)) return { success: false, error: 'file is write-protected' };
  if (destExisting) return { success: false, error: 'destination already exists' };

  var content = _storageGet(drive.storage, srcCanonical);
  if (content == null) return { success: false, error: 'file not found' };

  _storageSet(drive.storage, destCanonical, content);
  _storageDelete(drive.storage, srcCanonical);

  var ts = timestamp();
  var newManifest = manifest.filter(function (e) {
    return e.name !== MANIFEST_KEY && e.name !== srcCanonical;
  });
  newManifest.push({
    name:      destCanonical,
    size:      existing.size,
    timestamp: ts,
    owner:     existing.owner || session,
    session:   existing.session || session
  });
  _saveManifest(driveName, newManifest);

  return { success: true, result: 'renamed' };
}

function fileExists(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: true, exists: false };

  var fname    = normName(name);
  if (!fname) return { success: true, exists: false };
  var canonical = resolveName(cwd, fname);
  var manifest  = _readManifest(driveName);

  for (var fi = 0; fi < manifest.length; fi++) {
    if (manifest[fi].name === canonical) return { success: true, exists: true };
  }
  return { success: true, exists: false };
}

function dirMake(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var dirName = normName(name);
  if (!dirName) return { success: false, error: 'invalid directory name' };
  var fv = validateName(baseName(dirName));
  if (!fv.ok) return { success: false, error: fv.reason };

  var canonical = resolveName(cwd, dirName);
  canonical = String(canonical || '').replace(/\/+$/, '');
  var dirToken = '<' + canonical + '>';

  // Check if directory already exists in storage
  if (_storageIndex(drive.storage, dirToken) >= 0) {
    return { success: false, error: 'directory already exists' };
  }

  // For nested directories, ensure parent exists
  var slashIdx = canonical.lastIndexOf('/');
  if (slashIdx > 0) {
    var parent = canonical.substring(0, slashIdx);
    var parentToken = '<' + parent + '>';
    if (_storageIndex(drive.storage, parentToken) < 0) {
      return { success: false, error: 'parent directory not found' };
    }
  }

  var ts = timestamp();
  _storageSet(drive.storage, dirToken, '');

  // Update manifest with new directory token
  var manifest = _readManifest(driveName);
  var newManifest = manifest.filter(function (e) { return e.name !== MANIFEST_KEY; });
  newManifest.push({ name: dirToken, size: 0, timestamp: ts, owner: '', session: session || '' });
  _saveManifest(driveName, newManifest);

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
  canonical = String(canonical || '').replace(/^\/+|\/+$/g, '');

  if (canonical === '') {
    return { success: true, cwd: '/', result: 'server://' + driveName + '/' };
  }

  if (_storageIndex(drive.storage, '<' + canonical + '>') < 0) {
    return { success: false, error: 'directory not found' };
  }

  var newCwdPath = '/' + canonical + '/';
  return { success: true, cwd: newCwdPath, result: 'server://' + driveName + newCwdPath };
}

function dirRemove(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var dirName = normName(name);
  if (!dirName) return { success: false, error: 'invalid directory name' };

  var canonical = resolveName(cwd, dirName);
  canonical = String(canonical || '').replace(/^\/+|\/+$/g, '');

  if (canonical === '') {
    return { success: false, error: 'cannot remove root directory' };
  }

  var dirToken = '<' + canonical + '>';
  if (_storageIndex(drive.storage, dirToken) < 0) {
    return { success: false, error: 'directory not found' };
  }

  // Check if empty (no files or subdirs under this path)
  var prefix = canonical + '/';
  var storage = drive.storage;
  for (var i = 0; i < storage.length; i++) {
    var k = storage[i][0];
    if (k === dirToken || k === MANIFEST_KEY) continue;
    // Sub-directory tokens: <canonical/...>
    if (k.charAt(0) === '<') {
      var inner = k.substring(1, k.length - 1);
      if (inner.indexOf(prefix) === 0) return { success: false, error: 'directory not empty' };
    } else {
      if (k.indexOf(prefix) === 0) return { success: false, error: 'directory not empty' };
    }
  }

  _storageDelete(drive.storage, dirToken);

  var manifest = _readManifest(driveName);
  var newManifest = manifest.filter(function (e) {
    return e.name !== MANIFEST_KEY && e.name !== dirToken;
  });
  _saveManifest(driveName, newManifest);

  return { success: true, result: 'done' };
}

function dirList(driveName, cwd, pattern, switches, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var showHidden = (switches || '').indexOf('a') >= 0;
  var dir   = (cwd || '/').replace(/^\//, '').replace(/\/$/, '');
  var lines = [];

  lines.push('Directory of server://' + driveName + (cwd || '/') + '\n');
  lines.push('\n');

  // Subdirectories – find storage entries of the form <dirPrefix + name>
  var dirPrefix = dir ? (dir + '/') : '';
  var storage = drive.storage;

  for (var i = 0; i < storage.length; i++) {
    var k = storage[i][0];
    if (k.charAt(0) !== '<') continue;
    var inner = k.substring(1, k.length - 1);
    if (inner.indexOf(dirPrefix) !== 0) continue;
    var rel = inner.substring(dirPrefix.length);
    if (!rel || rel.indexOf('/') >= 0) continue;
    if (!showHidden && isHidden(rel)) continue;
    if (pattern && !matchPattern(rel, pattern)) continue;
    lines.push('  <DIR>  ' + rel + '\n');
  }

  // Files in current directory
  var manifest = _readManifest(driveName);
  var entries = manifest.filter(function (e) {
    if (!e || !e.name) return false;
    if (e.name === MANIFEST_KEY) return showHidden;
    if (e.name.charAt(0) === '<') return false;
    if (!showHidden && isHidden(e.name)) return false;
    var slash = e.name.lastIndexOf('/');
    var fileDir = slash >= 0 ? e.name.substring(0, slash) : '';
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

function fileList(driveName, cwd, pattern, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var dir   = (cwd || '/').replace(/^\//, '').replace(/\/$/, '');
  var names = [];

  var manifest = _readManifest(driveName);
  var entries = manifest.filter(function (e) {
    if (!e || !e.name) return false;
    if (e.name === MANIFEST_KEY) return false;
    if (e.name.charAt(0) === '<') return false;
    var slash = e.name.lastIndexOf('/');
    var fileDir = slash >= 0 ? e.name.substring(0, slash) : '';
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

// ── bigbang() – GFX World Generation ─────────────────────────────────────────
//
// Creates a multiplayer world on the server by reading capflag.gfx from the
// server's working directory.  The client is never trusted for map data.
//
// bigbang(driveName, session)
//   driveName – drive name to create world on (e.g. "gfx")
//   session   – caller session token
//
// .gfx file format (one sector per line):
//   [sector]=[96 tiles][valid exits].[item id][item z][item data]...
//   sector  – upper-case letter + lower-case letter or numeral (e.g. A1, _L)
//   tiles   – 2-char code each, 96 tiles = 192 chars
//   exits   – 2-char sector codes for allowed movement (after tile chars)
//   .       – separator before item list
//   items   – 6-char entries: 2=id, 2=z-location, 2=data
//
// Creates server://{drive}/w/{sectorId}/  for each non-_L sector, with:
//   e.txt – valid exit sector codes
//   <id><z><data> – one 6-char file per static item in the sector
// Creates server://{drive}/p.txt with empty player slots derived from _L items.

var GFX_FILE = 'capflag.gfx';

function bigbang(driveName, session) {
  if (!drives[driveName]) return { success: false, error: 'drive not mounted: ' + driveName };

  // Load capflag.gfx from the server's working directory (never from the client)
  var gfxPath = path.join(process.cwd(), GFX_FILE);
  var raw;
  try {
    raw = fs.readFileSync(gfxPath, 'utf8');
  } catch (e) {
    return { success: false, error: 'cannot read ' + GFX_FILE + ': ' + (e.message || String(e)) };
  }

  var lines = raw.split('\n');
  var sectors = [];   // { id, exits, items[] }
  var lobbyItems = [];

  for (var li = 0; li < lines.length; li++) {
    var line = lines[li].trim();
    if (!line) continue;

    var eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;

    var sectorId  = line.substring(0, eqIdx);
    var rest      = line.substring(eqIdx + 1);
    var dotIdx    = rest.indexOf('.');
    var mapData   = dotIdx >= 0 ? rest.substring(0, dotIdx) : rest;
    var itemData  = dotIdx >= 0 ? rest.substring(dotIdx + 1) : '';

    // tiles are first 192 chars (96 × 2); exits are the remainder
    var exitStr = mapData.substring(192);

    // parse items (6 chars each: 2=id, 2=z, 2=data)
    var items = [];
    for (var ji = 0; ji + 6 <= itemData.length; ji += 6) {
      items.push(itemData.substring(ji, ji + 6));
    }

    if (sectorId === '_L') {
      // _L is the lobby sector: it has no exits and is not part of the navigable
      // world.  Its items define the player-slot positions; we use them only to
      // build p.txt and do not create a w/_L/ directory for it.
      lobbyItems = items;
    } else {
      sectors.push({ id: sectorId, exits: exitStr, items: items });
    }
  }

  if (sectors.length === 0) {
    return { success: false, error: GFX_FILE + ' contains no valid world sectors' };
  }

  var created = [];
  var errors  = [];

  // Create /w/ root directory
  var wDir = dirMake(driveName, '/', 'w', session);
  if (!wDir.success && wDir.error !== 'directory already exists') {
    return { success: false, error: 'failed to create /w/ directory: ' + wDir.error };
  }

  // Create a sub-directory and files for each world sector
  for (var si = 0; si < sectors.length; si++) {
    var sector  = sectors[si];
    var dirPath = 'w/' + sector.id;

    var mkResult = dirMake(driveName, '/', dirPath, session);
    if (!mkResult.success && mkResult.error !== 'directory already exists') {
      errors.push('mkdir ' + dirPath + ': ' + mkResult.error);
      continue;
    }

    // e.txt – valid exits for this sector
    var eResult = fileSave(driveName, '/', dirPath + '/e.txt', sector.exits, session, 'bigbang');
    if (!eResult.success) errors.push(dirPath + '/e.txt: ' + eResult.error);

    // one 6-char file per static item (filename encodes id+z+data, content empty)
    for (var ii = 0; ii < sector.items.length; ii++) {
      var itemFile = sector.items[ii];
      var iResult  = fileSave(driveName, '/', dirPath + '/' + itemFile, '', session, 'bigbang');
      if (!iResult.success) errors.push(dirPath + '/' + itemFile + ': ' + iResult.error);
    }

    created.push(sector.id);
  }

  // Build p.txt from player-slot items in the _L (lobby) sector.
  // Player slot items have ID matching [A-Z][a-z] and data == "Za" (no special data).
  // "Za" is the .gfx convention for "item has no attached data"; items with other
  // data values (e.g. the flag Yj44Sa whose data "Sa" encodes its owning team) are
  // game objects that are not player slots.
  // Deduplicate: the same player code may appear at more than one z-position.
  var playerSlots = '';
  var playerCodes = [];
  var seenCodes   = {};
  for (var pi = 0; pi < lobbyItems.length; pi++) {
    if (lobbyItems[pi].length < 6) continue; // skip malformed items
    var itemId   = lobbyItems[pi].substring(0, 2);
    var itemData = lobbyItems[pi].substring(4, 6);
    if (/^[A-Z][a-z]$/.test(itemId) && itemData === 'Za' && !seenCodes[itemId]) {
      seenCodes[itemId] = true;
      playerSlots += itemId + '=\n';
      playerCodes.push(itemId);
    }
  }
  if (!playerSlots) {
    errors.push('p.txt: no player codes found in _L sector');
  } else {
    var pResult = fileSave(driveName, '/', 'p.txt', playerSlots, session, 'bigbang');
    if (!pResult.success) errors.push('p.txt: ' + pResult.error);
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join('; '), maps: created };
  }

  return {
    success: true,
    result:  'World created: ' + created.length + ' sector' + (created.length !== 1 ? 's' : '') + ', ' + playerCodes.length + ' player slots',
    maps:    created,
    players: playerCodes
  };
}

// ── Secure terminal output sanitization ───────────────────────────────────────

// Sanitize arbitrary file content before writing it to the server terminal.
// Strips control characters (except \n), ANSI/VT escape sequences, and other
// sequences that could manipulate the terminal or cause unexpected behaviour.
function sanitizeForTerminal(content) {
  var s = (content == null) ? '' : String(content);

  // Remove ANSI/VT escape sequences: ESC followed by [ or ( or ) or other
  // introducers, plus the rest of the sequence.
  // Covers: CSI sequences (ESC [ ... final), OSC sequences (ESC ] ... ST/BEL),
  // and other two-char ESC sequences.
  s = s.replace(/\x1b\[[\x20-\x3f]*[\x40-\x7e]/g, '');  // CSI sequences (full spec)
  s = s.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, ''); // OSC sequences
  s = s.replace(/\x1b[PX^_][^\x1b]*\x1b\\/g, '');     // DCS/SOS/PM/APC
  s = s.replace(/\x1b[()][A-Za-z0-9]/g, '');           // character set designations
  s = s.replace(/\x1b./g, '');                         // any remaining two-char ESC seq (aggressive)

  // Remove all ASCII control characters except \n (0x0A).
  // This covers NUL, BEL, BS, HT, VT, FF, CR, SO, SI, DEL, and others.
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\x00-\x09\x0b-\x1f\x7f]/g, '');

  return s;
}

// ── Server console formatting helpers ─────────────────────────────────────────

function _formatTimestampShort(ts) {
  if (!ts || ts.length < 14) return (ts || '(unknown)');
  return ts.slice(0, 4) + '-' + ts.slice(4, 6) + '-' + ts.slice(6, 8) +
         ' ' + ts.slice(8, 10) + ':' + ts.slice(10, 12) + ':' + ts.slice(12, 14);
}

function _formatTimestampHuman(ts) {
  if (!ts || ts.length < 14) return (ts || '(unknown)');
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December'];
  var mo = parseInt(ts.slice(4, 6), 10) - 1;
  var dy = parseInt(ts.slice(6, 8), 10);
  var yr = ts.slice(0, 4);
  var hr = parseInt(ts.slice(8, 10), 10);
  var mn = parseInt(ts.slice(10, 12), 10);
  var sc = parseInt(ts.slice(12, 14), 10);
  if (mo < 0 || mo > 11 || isNaN(dy) || isNaN(hr) || isNaN(mn) || isNaN(sc)) return ts;
  var ampm = hr >= 12 ? 'PM' : 'AM';
  var hr12 = hr % 12 || 12;
  return (MONTHS[mo] || '?') + ' ' + dy + ', ' + yr + ' at ' +
         hr12 + ':' + String(mn).padStart(2, '0') + ':' + String(sc).padStart(2, '0') + ' ' + ampm;
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

// Send a plain-text retro-style response (used by 2-char commands like GS).
function respondRetro(res, text) {
  res.writeHead(200, {
    'Content-Type':  'text/plain',
    'Cache-Control': 'no-store'
  });
  res.end(String(text));
}

// Parse a p.txt manifest string and return the formatted GS-style game state string.
// @param {string} content - the raw p.txt file content (lines of "PlayerCode=AvatarData")
// @returns {string} formatted game state, e.g. "JSSa.SbM3N2L3.Tc"
//   Format: <state><slot>.<slot>...  where state is JS or IP and each slot is
//   <playerCode><avatarData> for occupied slots or <playerCode> for empty slots.
function parsePlayerManifest(content) {
  var lines = content.split('\n');
  var hasActive = false;
  var slots = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;
    var code   = line.slice(0, eqIdx);
    var avatar = line.slice(eqIdx + 1).trim();
    if (avatar.length > 0) hasActive = true;
    slots.push(code + avatar);
  }
  var state = hasActive ? 'IP' : 'JS';
  // 
  // @@ game state needs to remain at 'JS' until we implement a system
  // for all players have voted to 'start game', we will discuss a method
  // to do this in the prompt 
  //  
  var state = 'JS';
  return state + slots.join('.');
}

// ── Form-encoded 2-character command handler (retro BB protocol) ──────────────
//
// POST /qandyland.js  Content-Type: application/x-www-form-urlencoded
//   c=BB&d=<drive>
//
// Commands:
//   BB – Big Bang: create a new multiplayer world on <drive> by loading
//        capflag.gfx from the server's working directory.
//        d = drive name          (safe chars only)
//
//   GS – Game State: return current state and complete player manifest
//        d = drive name          (safe chars only)
//        Response: <state><slot>.<slot>...
//          state codes: JS (just starting), IP (in progress)
//          slot format: <playerCode><avatarData> for occupied, <playerCode> for empty
//
//   RF – Refresh: return complete map state in Queville format
//        d = drive name          (safe chars only)
//        m = map ID              (e.g. "A1")
//        Response: Queville format "[items]-[player1]-[player2]..."
//          items   – concatenated 4-char codes for non-player items (ItemID + zz)
//          players – "[playerId][zz][avatarStr]" e.g. "Sa43B1D0"

// Returns true if the drive name contains only safe filesystem characters.
function isValidDriveName(drive) {
  return !!(drive && /^[A-Za-z0-9_-]+$/.test(drive) && drive.length <= 64);
}

function handleCommand(req, res, raw) {
  var session = getSession(req, res);
  var params = {};
  var pairs = raw.split('&');
  for (var i = 0; i < pairs.length; i++) {
    var idx = pairs[i].indexOf('=');
    if (idx > 0) {
      params[pairs[i].slice(0, idx)] = pairs[i].slice(idx + 1);
    }
  }

  var cmd = String(params.c || '').toUpperCase();
  var result;

  switch (cmd) {
    case 'BB': {
      var drive = String(params.d || '');

      // Validate drive name: safe filesystem characters only
      if (!isValidDriveName(drive)) {
        return respond(res, { success: false, error: 'invalid drive name' });
      }

      result = bigbang(drive, session);
      logRequest(req, 'BB', drive, '', session, result);
      if (!result.success) {
        return respondRetro(res, 'XX' + result.error);
      }
      // Initialise game console: create c.txt with ["BB"]
      fileSave(drive, '/', 'c.txt', JSON.stringify(['BB']), session, 'BB');
      // Return game state in GS format so client can fall through to normal handling
      var bbLoad = fileLoad(drive, '/', 'p.txt', session);
      if (!bbLoad.success) {
        return respondRetro(res, 'XX[World created but state unavailable]');
      }
      return respondRetro(res, parsePlayerManifest(bbLoad.content));
    }

    case 'GS': {
      var gsDrive = String(params.d || '');

      // Validate drive name: safe filesystem characters only
      if (!isValidDriveName(gsDrive)) {
        return respondRetro(res, 'XX[Invalid drive name]');
      }

      // Check drive is mounted
      if (!drives[gsDrive]) {
        return respondRetro(res, 'XX[Drive not found]');
      }

      // Read player manifest from p.txt
      var gsLoad = fileLoad(gsDrive, '/', 'p.txt', session);
      if (!gsLoad.success) {
        return respondRetro(res, 'XW[No game world]');
      }

      // Parse p.txt and return formatted game state
      var gsResponse = parsePlayerManifest(gsLoad.content);
      logRequest(req, 'GS', gsDrive, '', session, { success: true, result: gsResponse });
      return respondRetro(res, gsResponse);
    }

    case 'JG': {
      // Join Game: claim an empty player slot and create the initial slot file on the map.
      // The slot file is named "[itemId][zz].txt" (8 chars, e.g. "Sa43.txt").
      // Call SG (Start Game) afterwards to rename the file with the player's avatar.
      // Parameters: d=drive, id=itemId (e.g. "Sa"), av=avatar (optional, stored for SG)
      var jgDrive  = String(params.d  || '');
      var jgItemId = String(params.id || '');
      var jgAvatar = String(params.av || '');

      if (!isValidDriveName(jgDrive))            return respondRetro(res, 'XXInvalid drive');
      if (!/^[A-Z][a-z]$/.test(jgItemId))        return respondRetro(res, 'XXInvalid item ID');
      if (!drives[jgDrive])                       return respondRetro(res, 'XXDrive not found');

      // Determine spawn map: Team One (S*) → A1, Team Two (T*) → L8
      var jgMapId = (jgItemId.charAt(0) === 'S') ? 'A1' : 'L8';

      // Scan the map directory to find all occupied z-locations.
      // Both empty slot files ("Sa43.txt") and active player files ("Sa43B1D0C2.txt")
      // encode the z-location at characters 2-3, so we check all files with the
      // same team prefix (same first letter) to avoid z-location collisions.
      var jgOccupiedZ = {};
      var jgScanResult = fileList(jgDrive, 'w/' + jgMapId, null, session);
      if (jgScanResult.success && jgScanResult.listing) {
        var jgScanFiles = jgScanResult.listing.split('\n');
        for (var jgSi = 0; jgSi < jgScanFiles.length; jgSi++) {
          var jgSf = jgScanFiles[jgSi].trim();
          if (!jgSf) continue;
          var jgSb = jgSf.substring(jgSf.lastIndexOf('/') + 1);
          // Any player file for the same team encodes z at chars 2-3
          var jgPfx = jgSb.match(/^([A-Z][a-z])(\d{2})/);
          if (jgPfx && jgPfx[1].charAt(0) === jgItemId.charAt(0)) {
            jgOccupiedZ[jgPfx[2]] = true;
          }
        }
      }

      // Also reject if this itemId already has any file (slot already taken)
      var jgAlreadyTaken = false;
      if (jgScanResult.success && jgScanResult.listing) {
        var jgCheckFiles = jgScanResult.listing.split('\n');
        for (var jgCi = 0; jgCi < jgCheckFiles.length; jgCi++) {
          var jgCf = jgCheckFiles[jgCi].trim();
          if (!jgCf) continue;
          var jgCb = jgCf.substring(jgCf.lastIndexOf('/') + 1);
          if (jgCb.startsWith(jgItemId) && jgCb.endsWith('.txt')) {
            jgAlreadyTaken = true;
            break;
          }
        }
      }
      if (jgAlreadyTaken) return respondRetro(res, 'XXSlot already taken');

      // Find first available z-location from valid non-edge coordinate pools
      var jgValidX = [1, 2, 3, 4, 5, 6];
      var jgValidY = [2, 4, 6, 8, 10];
      var jgZ = '18'; // fallback default
      var jgZFound = false;
      for (var jgYi = 0; jgYi < jgValidY.length && !jgZFound; jgYi++) {
        for (var jgXi = 0; jgXi < jgValidX.length && !jgZFound; jgXi++) {
          var jgZval = jgValidY[jgYi] * 8 + jgValidX[jgXi];
          var jgZStr = String(jgZval).padStart(2, '0');
          if (!jgOccupiedZ[jgZStr]) {
            jgZ = jgZStr;
            jgZFound = true;
          }
        }
      }

      // Create empty slot file: "Sa43.txt" (8 chars total)
      // The avatar will be added to the filename when SG (Start Game) is called.
      var jgFile = 'w/' + jgMapId + '/' + jgItemId + jgZ + '.txt';
      var jgCreate = fileSave(jgDrive, '/', jgFile, '', session, 'JG');
      if (!jgCreate.success) return respondRetro(res, 'XXFailed to create player file');

      // Record session ownership so future move/SG commands can be authorised
      _playerOwnership[session] = { itemId: jgItemId, mapId: jgMapId, drive: jgDrive };

      // Log join event to game console
      fileAppendJSON(jgDrive, '/', 'c.txt', 'JG ' + jgItemId + ' ' + jgAvatar, session, 'JG');

      logRequest(req, 'JG', jgDrive, jgItemId, session, { success: true });
      return respondRetro(res, 'OK' + jgItemId + jgZ);
    }

    case 'SG': {
      // Start Game: rename the empty player slot file to include the player's avatar.
      // Transitions the player from "joined" (8-char slot file) to "active"
      // (>8-char file whose name encodes avatar and optional movement buffer).
      // Parameters: d=drive, id=itemId (e.g. "Sa"), av=avatar (e.g. "B1D0C2")
      var sgDrive  = String(params.d  || '');
      var sgItemId = String(params.id || '');
      var sgAvatar = String(params.av || '');

      if (!isValidDriveName(sgDrive))                        return respondRetro(res, 'XXInvalid drive');
      if (!/^[A-Z][a-z]$/.test(sgItemId))                   return respondRetro(res, 'XXInvalid item ID');
      if (!/^[A-Za-z0-9]{2,10}$/.test(sgAvatar))            return respondRetro(res, 'XXInvalid avatar');
      if (!drives[sgDrive])                                  return respondRetro(res, 'XXDrive not found');

      // Verify session owns this player slot (set during JG)
      var sgOwner = _playerOwnership[session];
      if (!sgOwner || sgOwner.itemId !== sgItemId)           return respondRetro(res, 'XXUnauthorized');

      // Determine which map the player is on (same rule as JG)
      var sgMapId = (sgItemId.charAt(0) === 'S') ? 'A1' : 'L8';

      // Scan the map directory to find the 8-char empty slot file for this player
      var sgList = fileList(sgDrive, 'w/' + sgMapId, null, session);
      if (sgList.success && sgList.listing) {
        var sgFiles = sgList.listing.split('\n');
        for (var sgi = 0; sgi < sgFiles.length; sgi++) {
          var sgFile = sgFiles[sgi].trim();
          if (!sgFile) continue;
          var sgBase = sgFile.substring(sgFile.lastIndexOf('/') + 1);
          // Match the 8-char empty slot pattern: "[itemId][zz].txt"
          var sgSlotMatch = sgBase.match(/^([A-Z][a-z])(\d{2})\.txt$/);
          if (sgSlotMatch && sgSlotMatch[1] === sgItemId) {
            var sgZLocation = sgSlotMatch[2]; // e.g. "43"
            var sgNewBase   = sgItemId + sgZLocation + sgAvatar + '.txt'; // e.g. "Sa43B1D0C2.txt"
            var sgRename = fileRename(sgDrive, 'w/' + sgMapId, sgBase, sgNewBase, session);
            if (sgRename.success) {
              logRequest(req, 'SG', sgDrive, sgItemId, session, { success: true });
              return respondRetro(res, 'OK' + sgItemId);
            } else {
              return respondRetro(res, 'XXRename failed: ' + (sgRename.error || ''));
            }
          }
        }
      }

      return respondRetro(res, 'XXPlayer file not found');
    }

    case 'RF': {
      // Refresh: return complete game state in Queville format.
      // Parameters: d=drive, m=mapId (e.g. "A1")
      // Response: Queville format "[items]-[player1]-[player2]..."
      //   items   – concatenated 4-char codes for items/empty slots, e.g. "Sa43Tb22"
      //   players – each section is "[playerId][zz][avatarStr]" or
      //             "[playerId][zz][avatarStr]-[movements]", e.g. "Sa43B1D0C2" or
      //             "Sa43B1D0C2-NSW"
      //
      // Filename length determines content type (no separate manifest needed):
      //   8 chars total ("Sa43.txt")         → item or empty player slot
      //   >8 chars total ("Sa43B1D0C2.txt")  → active player with avatar
      //   >8 chars with dash ("Sa43B1D0C2-NSW.txt") → active player with movements
      var rfDrive = String(params.d || '');
      var rfMapId = String(params.m || '');

      if (!isValidDriveName(rfDrive))            return respondRetro(res, 'XXInvalid drive');
      if (!/^[A-Z][1-9A-Z]$/.test(rfMapId))      return respondRetro(res, 'XXInvalid map ID');
      if (!drives[rfDrive])                       return respondRetro(res, 'XXDrive not found');

      // List all files in w/[mapId]/ and classify by filename length
      var rfList = fileList(rfDrive, 'w/' + rfMapId, null, session);
      var rfItems = '';
      var rfPlayers = [];
      if (rfList.success && rfList.listing) {
        var rfFiles = rfList.listing.split('\n');
        for (var rfi = 0; rfi < rfFiles.length; rfi++) {
          var rfFile = rfFiles[rfi].trim();
          if (!rfFile) continue;
          var rfBase = rfFile.substring(rfFile.lastIndexOf('/') + 1);

          if (rfBase.length === 8) {
            // "Sa43.txt" = item or empty player slot (8 chars total)
            var rfItemMatch = rfBase.match(/^([A-Z][a-z]\d{2})\.txt$/);
            if (rfItemMatch) {
              rfItems += rfItemMatch[1]; // e.g. "Sa43"
            }
          } else if (rfBase.length > 8) {
            // "Sa43B1D0C2.txt" or "Sa43B1D0C2-NSW.txt" = active player with avatar
            var rfPlayerMatch = rfBase.match(/^([A-Z][a-z])(\d{2})(.+)\.txt$/);
            if (rfPlayerMatch) {
              var rfPlayerId       = rfPlayerMatch[1]; // "Sa"
              var rfPlayerZ        = rfPlayerMatch[2]; // "43"
              var rfAvatarAndMoves = rfPlayerMatch[3]; // "B1D0C2" or "B1D0C2-NSW"
              // Build player entry: "Sa43B1D0C2" or "Sa43B1D0C2-NSW"
              rfPlayers.push(rfPlayerId + rfPlayerZ + rfAvatarAndMoves);
            }
          }
        }
      }

      // Build Queville format: [items]-[player1]-[player2]...
      var rfResponse = rfItems;
      if (rfPlayers.length > 0) {
        rfResponse += '-' + rfPlayers.join('-');
      }

      logRequest(req, 'RF', rfDrive, rfMapId, session, { success: true, result: rfResponse });
      return respondRetro(res, rfResponse);
    }

    default:
      result = { success: false, error: 'unknown command: ' + cmd };
      logRequest(req, cmd || '(unknown)', '', '', session, result);
      return respond(res, result);
  }
}

// ── Legacy JSON request dispatcher ────────────────────────────────────────────
// (legacy reference – new protocol uses form-encoded 2-char commands above)

function handleQandyland(req, res) {
  var session = getSession(req, res);

  readBody(req).then(function (raw) {
    var pkt;
    try { pkt = JSON.parse(raw); } catch (e) {
      return respond(res, { success: false, error: 'invalid JSON' });
    }

    var method   = normName(pkt.method   || '').toLowerCase();
    var drive    = normName(pkt.drive    || '');
    var cwd      = normName(pkt.cwd      || '/');
    var name     = normName(pkt.name     || '');
    var dest     = normName(pkt.dest     || '');
    var content  = pkt.content != null ? String(pkt.content) : '';
    var pattern  = normName(pkt.pattern  || '');
    var switches = normName(pkt.switches || '');
    var owner    = normName(pkt.owner    || '');

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
        result = fileSave(drive, cwd, name, content, session, owner);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'load':
        result = fileLoad(drive, cwd, name, session);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'delete':
        result = fileDelete(drive, cwd, name, session);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'rename':
        result = fileRename(drive, cwd, name, dest, session);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'exists':
        result = fileExists(drive, cwd, name, session);
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
        result = dirRemove(drive, cwd, name, session);
        logRequest(req, method, drive, name, session, result);
        return respond(res, result);

      case 'dir':
        result = dirList(drive, cwd, pattern, switches, session);
        logRequest(req, method, drive, pattern, session, result);
        return respond(res, result);

      case 'list':
        result = fileList(drive, cwd, pattern, session);
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
    var contentType = (req.headers['content-type'] || '').toLowerCase();
    if (contentType.indexOf('application/x-www-form-urlencoded') >= 0) {
      readBody(req).then(function (raw) {
        handleCommand(req, res, raw);
      }).catch(function (err) {
        respond(res, { success: false, error: 'server error: ' + err.message });
      });
      return;
    }
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

  serveStatic(req, res);
});

// ── Server console (stdin) command processing ─────────────────────────────────

if (process.stdin.isTTY) {
  process.stdin.setEncoding('utf8');

  var _serverMountedDrive = null;
  var _serverCwd = '/';
  var _createWizard = null;  // active wizard state (or null)

  // ── QDOS navigation command handlers ────────────────────────────────────────

  function _handleMount(name) {
    if (!name) { process.stdout.write('Usage: mount <drive>\n'); return; }
    var n = normName(name);
    if (!drives[n]) { process.stdout.write('Error: drive "' + n + '" not found.\n'); return; }
    _serverMountedDrive = n;
    _serverCwd = '/';
    process.stdout.write('Mounted: server://' + n + '/\n');
  }

  function _handleDir() {
    if (!_serverMountedDrive) { process.stdout.write('No drive mounted. Use: mount <drive>\n'); return; }
    var drive = drives[_serverMountedDrive];
    var dir   = (_serverCwd || '/').replace(/^\//, '').replace(/\/$/, '');
    process.stdout.write('Directory of server://' + _serverMountedDrive + (_serverCwd || '/') + '\n\n');

    // Subdirectories from storage tokens
    var dirPrefix = dir ? (dir + '/') : '';
    var storage = drive.storage;
    for (var di = 0; di < storage.length; di++) {
      var dk = storage[di][0];
      if (dk.charAt(0) !== '<') continue;
      var inner = dk.substring(1, dk.length - 1);
      if (inner.indexOf(dirPrefix) !== 0) continue;
      var rel = inner.substring(dirPrefix.length);
      if (!rel || rel.indexOf('/') >= 0) continue;
      process.stdout.write('  <DIR>  ' + rel + '\n');
    }

    // Files in current directory
    var manifest = _readManifest(_serverMountedDrive);
    var dirEntries = manifest.filter(function (e) {
      if (!e || !e.name) return false;
      if (e.name === MANIFEST_KEY) return false;
      if (e.name.charAt(0) === '<') return false;
      var slash = e.name.lastIndexOf('/');
      var fileDir = slash >= 0 ? e.name.substring(0, slash) : '';
      return fileDir === dir;
    });
    var fileCount = 0;
    for (var fi = 0; fi < dirEntries.length; fi++) {
      var fe   = dirEntries[fi];
      var fnb  = baseName(fe.name);
      var fsz  = formatBytes(fe.size || 0);
      var fts  = _formatTimestampShort(fe.timestamp);
      var sess = (fe.session || 'PUBLIC').slice(0, 8);
      var fown = fe.owner || '';
      process.stdout.write(
        '  ' + fnb.padEnd(14) + ' ' + fsz.padStart(6) + '  ' + fts + '  ' +
        sess.padEnd(10) + '  ' + fown + '\n'
      );
      fileCount++;
    }
    process.stdout.write('\n' + fileCount + ' file(s)\n');
  }

  function _handleLs() {
    if (!_serverMountedDrive) { process.stdout.write('No drive mounted. Use: mount <drive>\n'); return; }
    var drive   = drives[_serverMountedDrive];
    var dir     = (_serverCwd || '/').replace(/^\//, '').replace(/\/$/, '');
    var lsPrefix = dir ? (dir + '/') : '';

    // Subdirectories from storage tokens
    var storage = drive.storage;
    for (var li = 0; li < storage.length; li++) {
      var lk = storage[li][0];
      if (lk.charAt(0) !== '<') continue;
      var inner = lk.substring(1, lk.length - 1);
      if (inner.indexOf(lsPrefix) !== 0) continue;
      var rel = inner.substring(lsPrefix.length);
      if (!rel || rel.indexOf('/') >= 0) continue;
      process.stdout.write(rel + '/\n');
    }

    // Files
    var manifest = _readManifest(_serverMountedDrive);
    var lsEntries = manifest.filter(function (e) {
      if (!e || !e.name) return false;
      if (e.name === MANIFEST_KEY) return false;
      if (e.name.charAt(0) === '<') return false;
      var slash = e.name.lastIndexOf('/');
      var fileDir = slash >= 0 ? e.name.substring(0, slash) : '';
      return fileDir === dir;
    });
    for (var lj = 0; lj < lsEntries.length; lj++) {
      process.stdout.write(baseName(lsEntries[lj].name) + '\n');
    }
  }

  function _handleMkdir(name) {
    if (!name) { process.stdout.write('Usage: mkdir <name>\n'); return; }
    if (!_serverMountedDrive) { process.stdout.write('No drive mounted. Use: mount <drive>\n'); return; }
    var mkr = dirMake(_serverMountedDrive, _serverCwd, name, 'console');
    if (mkr.success) {
      process.stdout.write('Created directory: ' + name + '/\n');
    } else {
      process.stdout.write('Error: ' + mkr.error + '\n');
    }
  }

  function _handleChdir(name) {
    if (!_serverMountedDrive) { process.stdout.write('No drive mounted. Use: mount <drive>\n'); return; }
    var cdr = dirChange(_serverMountedDrive, _serverCwd, name || '/', 'console');
    if (cdr.success) {
      _serverCwd = cdr.cwd;
      process.stdout.write(cdr.result + '\n');
    } else {
      process.stdout.write('Error: ' + cdr.error + '\n');
    }
  }

  function _handleRmdir(name) {
    if (!name) { process.stdout.write('Usage: rmdir <name>\n'); return; }
    if (!_serverMountedDrive) { process.stdout.write('No drive mounted. Use: mount <drive>\n'); return; }
    var rmr = dirRemove(_serverMountedDrive, _serverCwd, name, 'console');
    if (rmr.success) {
      process.stdout.write('Removed directory: ' + name + '/\n');
    } else {
      process.stdout.write('Error: ' + rmr.error + '\n');
    }
  }

  function _handleFileDelete(name) {
    if (!name) { process.stdout.write('Usage: delete <filename>\n'); return; }
    var fdr = fileDelete(_serverMountedDrive, _serverCwd, name, 'console');
    if (fdr.success) {
      process.stdout.write('Deleted: ' + name + '\n');
    } else {
      process.stdout.write('Error: ' + fdr.error + '\n');
    }
  }

  function _handleRename(arg) {
    if (!arg) { process.stdout.write('Usage: rename <name>=<newname>\n'); return; }
    if (!_serverMountedDrive) { process.stdout.write('No drive mounted. Use: mount <drive>\n'); return; }
    var eqIdx = arg.indexOf('=');
    if (eqIdx < 0) { process.stdout.write('Usage: rename <name>=<newname>\n'); return; }
    var rnSrc = arg.slice(0, eqIdx).trim();
    var rnDst = arg.slice(eqIdx + 1).trim();
    if (!rnSrc || !rnDst) { process.stdout.write('Usage: rename <name>=<newname>\n'); return; }
    var rnr = fileRename(_serverMountedDrive, _serverCwd, rnSrc, rnDst, 'console');
    if (rnr.success) {
      process.stdout.write('Renamed: ' + rnSrc + ' \u2192 ' + rnDst + '\n');
    } else {
      process.stdout.write('Error: ' + rnr.error + '\n');
    }
  }

  function _handleExamine(name) {
    if (!name) { process.stdout.write('Usage: exam <filename>\n'); return; }
    if (!_serverMountedDrive) { process.stdout.write('No drive mounted. Use: mount <drive>\n'); return; }
    var canonical = resolveName(_serverCwd, normName(name));
    var manifest = _readManifest(_serverMountedDrive);
    var exEntry = null;
    for (var fi = 0; fi < manifest.length; fi++) {
      if (manifest[fi].name === canonical) { exEntry = manifest[fi]; break; }
    }
    // Fall back to basename match for convenience (e.g. user types just "a.txt")
    if (!exEntry) exEntry = _findEntry(manifest, name);
    if (!exEntry) { process.stdout.write('Error: file "' + name + '" not found.\n'); return; }
    var exNb = baseName(exEntry.name);
    process.stdout.write('File: '        + exNb + '\n');
    process.stdout.write('Path: '        + exEntry.name + '\n');
    process.stdout.write('Size: '        + (exEntry.size || 0) + ' bytes\n');
    process.stdout.write('Created: '     + _formatTimestampHuman(exEntry.timestamp) + '\n');
    process.stdout.write('Owner Token: ' + (exEntry.session || '(none)') +
                         ' (' + (exEntry.owner || '(none)') + ')\n');
  }

  var TYPE_MAX_BYTES = 65536; // 64 KB display limit

  function _handleType(name) {
    if (!name) { process.stdout.write('Usage: type <filename>\n'); return; }
    if (!_serverMountedDrive) { process.stdout.write('No drive mounted. Use: mount <drive>\n'); return; }
    var canonical = resolveName(_serverCwd, normName(name));
    var manifest = _readManifest(_serverMountedDrive);
    var tyEntry = null;
    for (var fi = 0; fi < manifest.length; fi++) {
      if (manifest[fi].name === canonical) { tyEntry = manifest[fi]; break; }
    }
    // Fall back to basename match for convenience (e.g. user types just "p.txt")
    if (!tyEntry) tyEntry = _findEntry(manifest, name);
    if (!tyEntry) { process.stdout.write('Error: file "' + name + '" not found.\n'); return; }

    var result = fileLoad(_serverMountedDrive, _serverCwd, tyEntry.name, 'console');
    if (!result.success) { process.stdout.write('Error: ' + result.error + '\n'); return; }

    var raw = result.content;
    var size = (raw == null) ? 0 : String(raw).length;
    var truncated = false;
    var display = (raw == null) ? '' : String(raw);
    if (display.length > TYPE_MAX_BYTES) {
      display = display.slice(0, TYPE_MAX_BYTES);
      truncated = true;
    }
    var safe = sanitizeForTerminal(display);

    process.stdout.write('File: ' + tyEntry.name + '  (' + size + ' bytes)\n');
    process.stdout.write('──── begin ────────────────────────────\n');
    process.stdout.write(safe);
    if (safe.length > 0 && safe[safe.length - 1] !== '\n') process.stdout.write('\n');
    process.stdout.write('──── end ──────────────────────────────\n');
    if (truncated) {
      process.stdout.write('(Output truncated at ' + TYPE_MAX_BYTES + ' bytes. Full size: ' + size + ' bytes)\n');
    }
  }

  function _wizardPrompt(msg) {
    process.stdout.write(msg);
  }

  // Parse a command line into tokens, respecting double-quoted strings.
  function parseQuotedArgs(str) {
    var tokens = [];
    var i = 0;
    var start;
    while (i < str.length) {
      while (i < str.length && str[i] === ' ') i++;
      if (i >= str.length) break;
      if (str[i] === '"') {
        i++;
        start = i;
        while (i < str.length && str[i] !== '"') i++;
        tokens.push(str.slice(start, i));
        if (i < str.length) i++;
      } else {
        start = i;
        while (i < str.length && str[i] !== ' ') i++;
        tokens.push(str.slice(start, i));
      }
    }
    return tokens;
  }

  // Print the prompt for the current wizard step.
  function _wizardShowPrompt() {
    var w = _createWizard;
    if (!w) return;
    if (w.step === 'drive_name') {
      _wizardPrompt('Input name of drive to create [' + w.defaultDrive + ']: ');
    }
  }

  // Echo a pre-supplied argument as if the user typed and submitted it.
  function _wizardEchoStep(val) {
    var w = _createWizard;
    if (!w) return;
    if (w.step === 'drive_name') {
      process.stdout.write('Drive name: ' + val + '\n');
    }
  }

  // Automatically advance wizard steps using pre-supplied arguments.
  function _wizardAutoAdvance() {
    var w = _createWizard;
    if (!w || !w.args || !w.args.length) {
      _wizardShowPrompt();
      return;
    }
    var val = w.args.shift();
    _wizardEchoStep(val);
    _wizardStep(val);
  }

  // Process one line of input while the drive creation wizard is active.
  function _wizardStep(line) {
    var w = _createWizard;
    if (!w) return;
    var trimmed = line.trim();

    if (w.step === 'drive_name') {
      w.driveName = trimmed || w.defaultDrive;
      // Create the drive immediately (no persistence step in v2)
      var cr = driveCreate(w.driveName, 'console');
      if (cr.success) {
        process.stdout.write('\n\u2713 Created drive \'' + w.driveName + '\' (memory-only).\n');
      } else {
        process.stdout.write('\n\u2717 Error: ' + cr.error + '\n');
      }
      _createWizard = null;
      process.stdout.write('\nqandyland2.js ');
    }
  }

  // Start the drive creation wizard. args may pre-supply [driveName].
  function _startCreateWizard(args) {
    var defaultName = 'newdrive';
    _createWizard = {
      step:         'drive_name',
      defaultDrive: defaultName,
      driveName:    null,
      args:         (args || []).slice()
    };
    process.stdout.write('\nCreate a new drive\n');
    process.stdout.write('──────────────────\n');
    _wizardAutoAdvance();
  }

  var _stdinBuf = '';
  process.stdin.on('data', function (chunk) {
    _stdinBuf += chunk;
    var lines = _stdinBuf.split('\n');
    _stdinBuf = lines.pop();
    lines.forEach(function (line) {

      var trimmed = line.trim();
      if (!trimmed) return;

      // If wizard is active, route input there
      if (_createWizard) {
        _wizardStep(line);
        return;
      }

      var allTokens = parseQuotedArgs(trimmed);
      var cmd   = (allTokens[0] || '').toLowerCase();
      var arg   = allTokens.slice(1).join(' ');

      switch (cmd) {
        case 'serverstorage': {
          var driveName = arg || _serverMountedDrive;
          if (!driveName) {
            process.stdout.write('Usage: serverstorage [drive-name]\n');
            process.stdout.write('       serverstorage          (shows current mounted drive)\n');
            break;
          }

          var drive = drives[driveName];
          if (!drive) {
            process.stdout.write('Error: drive "' + driveName + '" not found.\n');
            var availableDrives = Object.keys(drives);
            if (availableDrives.length > 0) {
              process.stdout.write('Available drives: ' + availableDrives.join(', ') + '\n');
            }
            break;
          }

          var stats = calculateDriveStats(drive);
          var storage = drive.storage || [];
          var dirTokens = storage.filter(function (e) {
            return e && e[0] && e[0].charAt(0) === '<';
          });
          var fileEntries = storage.filter(function (e) {
            return e && e[0] && e[0] !== MANIFEST_KEY && e[0].charAt(0) !== '<';
          });

          process.stdout.write('\n' + '='.repeat(60) + '\n');
          process.stdout.write('DRIVE STORAGE DEBUG: ' + driveName + '\n');
          process.stdout.write('='.repeat(60) + '\n');
          process.stdout.write('Type: memory-only\n');
          process.stdout.write('Owner: ' + (drive.owner || 'none') + '\n');
          process.stdout.write('Created: ' + (drive.created || 'unknown') + '\n');
          process.stdout.write('Files: ' + stats.fileCount + ' (' + formatBytes(stats.totalSize) + ')\n');
          process.stdout.write('Directories: ' + dirTokens.length + '\n');
          process.stdout.write('Storage entries: ' + storage.length + '\n');
          process.stdout.write('\n');

          if (dirTokens.length > 0) {
            process.stdout.write('DIRECTORIES (' + dirTokens.length + '):\n');
            for (var i = 0; i < dirTokens.length; i++) {
              var dtName = dirTokens[i][0] || '';
              var dtTrunc = dtName.length > 50 ? dtName.substring(0, 47) + '...' : dtName;
              process.stdout.write('  ' + dtTrunc + '\n');
            }
            process.stdout.write('\n');
          }

          if (fileEntries.length > 0) {
            process.stdout.write('FILES (' + fileEntries.length + '):\n');
            for (var j = 0; j < fileEntries.length; j++) {
              var fkey = fileEntries[j][0];
              var fval = fileEntries[j][1] || '';
              var keyTrunc = fkey.length > 35 ? fkey.substring(0, 32) + '...' : fkey;
              var fsize = utf8len(fval);
              var contentTrunc = fval.length > 40 ? fval.substring(0, 37) + '...' : fval;
              contentTrunc = contentTrunc.replace(/[\r\n\t]/g, function (c) {
                return c === '\r' ? '\\r' : c === '\n' ? '\\n' : '\\t';
              });
              process.stdout.write('  ' + keyTrunc.padEnd(35) + ' | ' +
                String(fsize).padStart(6) + 'b | ' + contentTrunc + '\n');
            }
            process.stdout.write('\n');
          }

          // Manifest entries from parsed text
          var manifestEntries = _readManifest(driveName);
          if (manifestEntries.length > 0) {
            process.stdout.write('MANIFEST ENTRIES (' + manifestEntries.length + '):\n');
            for (var k = 0; k < manifestEntries.length; k++) {
              var entry = manifestEntries[k];
              var eName = (entry.name || '').padEnd(30);
              var eSize = String(entry.size || 0).padStart(8);
              var eTs   = (entry.timestamp || '').substring(0, 14);
              var eOwn  = (entry.owner || 'none').substring(0, 12);
              var eSess = (entry.session || 'none').substring(0, 8);
              process.stdout.write('  ' + eName + ' | ' + eSize + 'b | ' +
                eTs + ' | ' + eOwn.padEnd(12) + ' | ' + eSess + '\n');
            }
            process.stdout.write('\n');
          }

          process.stdout.write('='.repeat(60) + '\n');
          break;
        }

        case 'create':
          _startCreateWizard(allTokens.slice(1));
          break;

        case 'list': {
          var names = Object.keys(drives);
          if (names.length === 0) {
            process.stdout.write('No drives.\n');
          } else {
            process.stdout.write('Drives:\n');
            names.forEach(function (n) {
              var d = drives[n];
              var dStats = calculateDriveStats(d);
              process.stdout.write('  ' + n + '  [memory]' +
                '  ' + dStats.fileCount + ' file(s), ' + formatBytes(dStats.totalSize) + '\n');
            });
          }
          break;
        }

        case 'mount':
          _handleMount(arg);
          break;

        case 'dir':
          _handleDir();
          break;

        case 'ls':
          _handleLs();
          break;

        case 'mkdir':
          _handleMkdir(arg);
          break;

        case 'cd':
        case 'chdir':
          _handleChdir(arg);
          break;

        case 'rmdir':
          _handleRmdir(arg);
          break;

        case 'rename':
          _handleRename(arg);
          break;

        case 'exam':
        case 'examine':
          _handleExamine(arg);
          break;

        case 'type':
          _handleType(arg);
          break;

        case 'delete':
          if (_serverMountedDrive) {
            if (!arg) { process.stdout.write('Usage: delete <filename>\n'); break; }
            _handleFileDelete(arg);
          } else {
            if (!arg) { process.stdout.write('Usage: delete <name>\n'); break; }
            var dn = normName(arg);
            if (!drives[dn]) {
              process.stdout.write('Error: drive "' + dn + '" not found.\n');
            } else {
              process.stdout.write('Warning: All data on drive "' + dn + '" will be permanently lost.\n');
              delete drives[dn];
              process.stdout.write('Drive "' + dn + '" deleted.\n');
            }
          }
          break;

        case 'help':
          process.stdout.write(
            'Server console commands:\n' +
            '  create [drive-name]  - Create a new memory-only drive\n' +
            '  list                 - List all drives\n' +
            '  delete <name>        - Delete a drive (no drive mounted) or a file (drive mounted)\n' +
            '  serverstorage [drv]  - Show raw storage contents of a drive\n' +
            '\nNavigation commands (mount a drive first):\n' +
            '  mount <drive>        - Mount a drive for navigation\n' +
            '  dir                  - Directory listing with full metadata\n' +
            '  ls                   - Simple file/directory listing\n' +
            '  cd <name>            - Change directory (.. = parent, / = root)\n' +
            '  mkdir <name>         - Create a directory\n' +
            '  rmdir <name>         - Remove an empty directory\n' +
            '  rename <old>=<new>   - Rename a file\n' +
            '  exam <name>          - Examine file metadata in detail\n' +
            '  type <name>          - Display file contents safely (strips control chars)\n' +
            '  help                 - Show this help\n'
          );
          break;

        default:
          process.stdout.write('Unknown command "' + cmd + '". Type "help" for commands.\n');
      }

      process.stdout.write('qandyland2.js ');
    });
  });
}

// ── Server initialization ─────────────────────────────────────────────────────

function _proceedWithStartup() {
  var cfg = loadServerConfig();
  var driveList = (cfg.drives && Array.isArray(cfg.drives) && cfg.drives.length > 0) ? cfg.drives : ['gfx'];

  // Create blank memory-only drives from config (drives always start empty on restart)
  for (var i = 0; i < driveList.length; i++) {
    var dn = normName(driveList[i]);
    if (dn && validateName(dn).ok) {
      var cr = driveCreate(dn, 'console');
      if (!cr.success) { console.warn('Warning: could not create drive "' + dn + '": ' + cr.error); }
    }
  }

  server.listen(PORT, function () {
    if (REGISTRY_URL) {
      getPublicIp(function (err, ip) {
        _publicIp = (err || !ip) ? null : ip;
        registerWithRegistry(function (regErr) {
          var regStatus = regErr ? 'Failed' : 'Connected';
          displayStartupBanner(_publicIp, regStatus, _serverId);
          startHeartbeat();
          if (process.stdin.isTTY) { process.stdout.write('\nqandyland2.js '); }
        });
      });
    } else {
      displayStartupBanner(null, 'Disabled', null);
      if (process.stdin.isTTY) { process.stdout.write('\nqandyland2.js '); }
    }
  });
}

function _applyServerConfig() {
  var cfg = loadServerConfig();
  if (cfg.serverName && !_cliName) { SERVER_NAME = cfg.serverName; }
  return cfg;
}

(function _initializeServer() {
  _applyServerConfig();
  if (!SERVER_NAME) SERVER_NAME = 'Qandyland Server';
  _proceedWithStartup();
})();

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
