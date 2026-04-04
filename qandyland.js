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
// Persistence: Drive structure saved to per-drive JSON files in the data directory.
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
var VALID_NAME_RE        = /^(?!\.)[A-Za-z0-9 \-_.()+=!]+$/;
var VALID_SERVER_NAME_RE = /^(?!\.)[A-Za-z0-9 \-_.()+=]+$/; // server/drive names (no !)
var MAX_SERVER_NAME_LEN  = 24;
var DRIVE_FILE_MARKER = '_qandy_drive';      // Marker present in all per-drive JSON files
var SERVER_CONFIG_FILE = 'qandyland.json';   // Server config file in the working directory

var DATA_DIR = process.cwd(); // Working directory used for persistent drive storage

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
var _cliName     = null;
(function () {
  var args = process.argv.slice(2);
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--name'       && args[i + 1]) { SERVER_NAME  = args[++i]; _cliName    = SERVER_NAME; }
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

// Start heartbeat interval (every 1 hour – conservative to preserve free-tier quota)
function startHeartbeat() {
  if (!REGISTRY_URL) return;
  if (_heartbeatTimer) clearInterval(_heartbeatTimer);
  _heartbeatTimer = setInterval(function () {
    registerWithRegistry(function (err) {
      if (err) { console.warn('Registry heartbeat failed:', err.message || String(err)); }
    });
  }, 60 * 60 * 1000); // 1 hour
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
//   manifest: [{ name, size, timestamp, owner, session }],
//   files:    { canonicalName: content_string },
//   dirs:     { dirName: { owner, created } },
//   owner:    session_or_'console',
//   created:  timestamp_string,
//   persistent: bool – true saves to {name}.json in the working directory on every change
// }
//
// File manifest entry fields:
//   owner   – script name from RUN= variable (organisational label)
//   session – session token of the client that created/last-wrote the file
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

// Save a single persistent drive to {driveName}.json in the working directory
function saveDrive(driveName) {
  var drive = drives[driveName];
  if (!drive || !drive.persistent) return; // Memory-only drives are never persisted
  var data = {};
  data[DRIVE_FILE_MARKER] = true;
  data.id       = driveName;
  data.version  = '2.0';
  data.created  = drive.created || new Date().toISOString();
  data.owner    = drive.owner   || 'server';
  data.persistent = true;
  data.manifest = drive.manifest || [];
  data.files    = drive.files    || {};
  data.dirs     = drive.dirs     || {};
  data.stats    = calculateDriveStats(drive);
  var filePath = path.join(DATA_DIR, driveName + '.json');
  fs.writeFile(filePath, JSON.stringify(data, null, 2), function (err) {
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

  // Load per-drive JSON files from DATA_DIR (new format: {driveName}.json with DRIVE_FILE_MARKER)
  try {
    var dataDirFiles = fs.readdirSync(DATA_DIR);
    for (var i = 0; i < dataDirFiles.length; i++) {
      var f = dataDirFiles[i];
      if (!f.endsWith('.json')) continue;
      try {
        var content = fs.readFileSync(path.join(DATA_DIR, f), 'utf8');
        var info = JSON.parse(content);
        if (!info[DRIVE_FILE_MARKER]) continue; // Skip non-drive JSON files
        var n = normName(info.id || f.slice(0, -5));
        if (!n || !validateName(n).ok) continue;
        drives[n] = {
          manifest:   info.manifest           || [],
          files:      info.files              || {},
          dirs:       info.dirs               || {},
          owner:      info.owner              || 'server',
          created:    info.created            || new Date().toISOString(),
          persistent: true
        };
        loaded[n] = true;
      } catch (e) {
        // Skip files that are not valid drive JSON
      }
    }
  } catch (e) {
    // DATA_DIR not yet created or unreadable – fine, drives will be empty
  }

}

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
  console.log(_boxLine(' Ready for connections...'))
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

// persistent – true: saved to {name}.json on disk; false: memory-only, cleared on restart
function driveCreate(driveName, session, persistent) {
  var name = normName(driveName);
  var fv = validateName(name);
  if (!fv.ok) return { success: false, error: 'invalid drive name: ' + fv.reason };
  if (drives[name]) return { success: false, error: 'drive already exists' };

  var isPersistent = (persistent === true || persistent === 'true');

  var ts = timestamp();
  drives[name] = {
    manifest:   [],
    files:      {},
    dirs:       {},
    owner:      session,
    created:    ts,
    persistent: isPersistent
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
      (e.owner || '') + '|' + (e.session || '')
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
  drive.manifest.push({ name: MANIFEST_KEY, size: utf8len(full), timestamp: ts, owner: '', session: '' });
}

function fileSave(driveName, cwd, name, content, session, owner) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

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

  // Update manifest
  var manifest = drive.manifest.filter(function (e) {
    return e.name !== MANIFEST_KEY && baseName(normName(e.name)).toLowerCase() !== baseName(normName(fname)).toLowerCase();
  });
  manifest.push({
    name:      fname,
    size:      size,
    timestamp: ts,
    owner:     owner || session,
    session:   session
  });
  _saveManifest(driveName, manifest);

  if (drive.persistent) saveDrive(driveName);
  return { success: true, result: true };
}

function fileLoad(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var fname    = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var canonical = resolveName(cwd, fname);
  var existing  = _findEntry(drive.manifest, fname);

  if (!existing) return { success: false, error: 'file not found' };

  var content = drive.files[canonical];
  if (content == null) return { success: false, error: 'file not found' };

  return { success: true, content: content };
}

function fileDelete(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var fname    = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var canonical = resolveName(cwd, fname);
  var existing  = _findEntry(drive.manifest, fname);

  if (!existing) return { success: false, error: 'file not found' };
  if (isWriteProtected(existing.name)) return { success: false, error: 'file is write-protected' };

  delete drive.files[canonical];
  var manifest = drive.manifest.filter(function (e) {
    return e.name !== MANIFEST_KEY && baseName(normName(e.name)).toLowerCase() !== baseName(normName(fname)).toLowerCase();
  });
  _saveManifest(driveName, manifest);

  if (drive.persistent) saveDrive(driveName);
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
  var existing      = _findEntry(drive.manifest, fname);
  var destExisting  = _findEntry(drive.manifest, dname);

  if (!existing) return { success: false, error: 'file not found' };
  if (isWriteProtected(existing.name)) return { success: false, error: 'file is write-protected' };

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
    name:      dname,
    size:      existing.size,
    timestamp: ts,
    owner:     existing.owner || session,
    session:   existing.session || session
  });
  _saveManifest(driveName, manifest);

  if (drive.persistent) saveDrive(driveName);
  return { success: true, result: 'renamed' };
}

function fileExists(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: true, exists: false };

  var fname    = normName(name);
  if (!fname) return { success: true, exists: false };
  var existing  = _findEntry(drive.manifest, fname);
  if (!existing) return { success: true, exists: false };

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

function dirRemove(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var dirName   = normName(name);
  if (!dirName) return { success: false, error: 'invalid directory name' };
  var canonical = resolveName(cwd, dirName);
  if (!drive.dirs[canonical]) return { success: false, error: 'directory not found' };

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

function dirList(driveName, cwd, pattern, switches, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

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

  // Files – only include entries visible in the current directory
  var entries = drive.manifest.filter(function (e) {
    if (e.name === MANIFEST_KEY) return showHidden;
    if (!showHidden && isHidden(e.name)) return false;
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

function fileList(driveName, cwd, pattern, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var dir   = (cwd || '/').replace(/^\//, '').replace(/\/$/, '');
  var names = [];

  var entries = drive.manifest.filter(function (e) {
    if (e.name === MANIFEST_KEY) return false;
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

// ── bigbang() – Procedural World Generation ──────────────────────────────────
//
// Creates a multiplayer world on the server from a map topology string.
// Called by gfxCreation() scripts to set up worlds for capture-the-flag etc.
//
// bigbang(drive, "A1A2A3B1B2B3", "A1", true)
//   drive     – drive name to create world on (e.g. "gfx.js")
//   mapString – 2-char map IDs concatenated: "A1A2B1B2" → A1, A2, B1, B2
//   lobbyMap  – map where all players spawn (must be in mapString)
//   isRound   – if true, world edges wrap (A↔Z, 1↔9 / A↔Z for col)
//
// Creates server://{drive}/w/{mapId}/  for each map, with:
//   a.txt  – lobby map ID (world alpha / entry point)
//   m.txt  – 194-char procedural tileset string
//   e.txt  – legal exit destinations (pre-calculated, no runtime physics needed)

// Tile pool used for random map generation.
// Weighted toward grass for open battlefield feel; includes stone, swamp, desert.
var BIGBANG_TILE_POOL = [
  'Ga','Ga','Ga','Ga','Ga',  // grass (most common – open terrain)
  'Gb','Gb','Gb','Gc','Gc',  // grass variants
  'Ra','Ra','Rb',             // rocky ground
  'Sa','Sb','Sc','Sd',       // stone / swamp stone
  'Ca','Cb',                  // desert / cave floor
  'Ta','Tb'                   // swamp tiles
];

// Parse "A1A2B1B2" into ["A1","A2","B1","B2"].
// Map ID format: first char A-Z (row), second char 1-9 or A-Z (column).
function parseMapString(mapString) {
  var s = normName(mapString);
  if (!s) return { ok: false, error: 'empty map string' };
  if (s.length % 2 !== 0) {
    return { ok: false, error: 'map string length must be even (2 chars per map ID)' };
  }

  var maps = [];
  var seen = {};
  for (var i = 0; i < s.length; i += 2) {
    var id = s.substring(i, i + 2);
    if (!/^[A-Z][1-9A-Z]$/.test(id)) {
      return { ok: false, error: 'invalid map ID "' + id + '" (must be A-Z then 1-9 or A-Z)' };
    }
    if (seen[id]) {
      return { ok: false, error: 'duplicate map ID: ' + id };
    }
    seen[id] = true;
    maps.push(id);
  }
  if (maps.length === 0) return { ok: false, error: 'no maps in map string' };
  return { ok: true, maps: maps };
}

// Generate a 194-character tileset string: 96 random tiles (2 chars each) + ".."
function getRandomTileset() {
  var tiles = '';
  for (var i = 0; i < 96; i++) {
    tiles += BIGBANG_TILE_POOL[Math.floor(Math.random() * BIGBANG_TILE_POOL.length)];
  }
  return tiles + '..';
}

// ASCII code constants for map ID row/column boundaries.
var BB_ROW_A = 65, BB_ROW_Z = 90;   // 'A' and 'Z'
var BB_COL_1 = 49, BB_COL_9 = 57;   // '1' and '9'
var BB_COL_A = 65, BB_COL_Z = 90;   // 'A' and 'Z' (letter columns)

// Return the map ID of the neighbour of mapId in the given cardinal direction,
// or null if the neighbour does not exist in mapsSet (or is out-of-bounds on a
// flat world).  Direction: 'N'=north, 'S'=south, 'W'=west, 'E'=east.
// mapsSet is a plain object used as a set for O(1) existence checks.
function getNeighborMapId(mapId, direction, mapsSet, isRound) {
  var row = mapId.charCodeAt(0);  // A-Z
  var col = mapId.charCodeAt(1);  // 1-9 or A-Z

  var newRow = row;
  var newCol = col;

  if (direction === 'N') {
    if (row === BB_ROW_A) {    // at row 'A'
      if (!isRound) return null;
      newRow = BB_ROW_Z;       // wrap to 'Z'
    } else {
      newRow = row - 1;
    }
  } else if (direction === 'S') {
    if (row === BB_ROW_Z) {    // at row 'Z'
      if (!isRound) return null;
      newRow = BB_ROW_A;       // wrap to 'A'
    } else {
      newRow = row + 1;
    }
  } else if (direction === 'W') {
    if (col >= BB_COL_1 && col <= BB_COL_9) {   // col is '1'-'9'
      if (col === BB_COL_1) {                    // at col '1'
        if (!isRound) return null;
        newCol = BB_COL_9;                       // wrap to '9'
      } else {
        newCol = col - 1;
      }
    } else if (col >= BB_COL_A && col <= BB_COL_Z) {  // col is 'A'-'Z'
      if (col === BB_COL_A) {                          // at col 'A'
        if (!isRound) return null;
        newCol = BB_COL_Z;                             // wrap to 'Z'
      } else {
        newCol = col - 1;
      }
    } else {
      return null;  // unexpected column character
    }
  } else if (direction === 'E') {
    if (col >= BB_COL_1 && col <= BB_COL_9) {   // col is '1'-'9'
      if (col === BB_COL_9) {                    // at col '9'
        if (!isRound) return null;
        newCol = BB_COL_1;                       // wrap to '1'
      } else {
        newCol = col + 1;
      }
    } else if (col >= BB_COL_A && col <= BB_COL_Z) {  // col is 'A'-'Z'
      if (col === BB_COL_Z) {                          // at col 'Z'
        if (!isRound) return null;
        newCol = BB_COL_A;                             // wrap to 'A'
      } else {
        newCol = col + 1;
      }
    } else {
      return null;  // unexpected column character
    }
  }

  var neighborId = String.fromCharCode(newRow) + String.fromCharCode(newCol);
  return mapsSet[neighborId] ? neighborId : null;
}

// Return a string of legal exit map IDs for currentMap (e.g. "A2B1B3C2").
// Checks N/S/W/E neighbours in order; wrapping only when isRound is true.
// mapsSet is a plain object used as a set for O(1) existence checks.
function calculateLegalMoves(currentMap, mapsSet, isRound) {
  var exits = '';
  var dirs = ['N', 'S', 'W', 'E'];
  for (var i = 0; i < dirs.length; i++) {
    var neighbor = getNeighborMapId(currentMap, dirs[i], mapsSet, isRound);
    if (neighbor) exits += neighbor;
  }
  return exits;
}

// Main bigbang function: create all world directories and files on a drive.
function bigbang(driveName, mapString, lobbyMap, isRound, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted: ' + driveName };

  // Parse and validate the map string.
  var parsed = parseMapString(mapString);
  if (!parsed.ok) return { success: false, error: parsed.error };
  var allMaps = parsed.maps;

  // Build an O(1) set for neighbour existence checks.
  var mapsSet = {};
  for (var k = 0; k < allMaps.length; k++) mapsSet[allMaps[k]] = true;

  // Validate lobbyMap.
  var lobby = normName(lobbyMap);
  if (!lobby) return { success: false, error: 'lobbyMap is required' };
  if (!mapsSet[lobby]) {
    return { success: false, error: 'lobbyMap "' + lobby + '" not found in mapString' };
  }

  var round = (isRound === true || isRound === 'true' || isRound === 1);
  var created = [];
  var errors  = [];

  // Ensure parent directory 'w' exists (ignore "already exists" errors).
  var wDir = dirMake(driveName, '/', 'w', session);
  if (!wDir.success && wDir.error !== 'directory already exists') {
    return { success: false, error: 'failed to create /w/ directory: ' + wDir.error };
  }

  for (var i = 0; i < allMaps.length; i++) {
    var mapId   = allMaps[i];
    var dirPath = 'w/' + mapId;

    // Create map sub-directory (idempotent: ignore "already exists").
    var mkResult = dirMake(driveName, '/', dirPath, session);
    if (!mkResult.success && mkResult.error !== 'directory already exists') {
      errors.push('mkdir ' + dirPath + ': ' + mkResult.error);
      continue;
    }

    // a.txt – lobby map ID (the alpha / entry point for the whole world).
    var aResult = fileSave(driveName, '/', dirPath + '/a.txt', lobby, session, 'bigbang');
    if (!aResult.success) errors.push(dirPath + '/a.txt: ' + aResult.error);

    // m.txt – procedurally generated 194-char tileset.
    var tileset = getRandomTileset();
    var mResult = fileSave(driveName, '/', dirPath + '/m.txt', tileset, session, 'bigbang');
    if (!mResult.success) errors.push(dirPath + '/m.txt: ' + mResult.error);

    // e.txt – legal exits (pre-calculated so client needs no world-physics logic).
    var exits   = calculateLegalMoves(mapId, mapsSet, round);
    var eResult = fileSave(driveName, '/', dirPath + '/e.txt', exits, session, 'bigbang');
    if (!eResult.success) errors.push(dirPath + '/e.txt: ' + eResult.error);

    created.push(mapId);
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join('; '), maps: created };
  }

  return {
    success: true,
    result:  'World created: ' + allMaps.length + ' map' + (allMaps.length !== 1 ? 's' : ''),
    maps:    created,
    lobby:   lobby
  };
}

// ── Server console formatting helpers ─────────────────────────────────────────

// Convert compact timestamp "20260401143020" → "2026-04-01 14:30:20"
function _formatTimestampShort(ts) {
  if (!ts || ts.length < 14) return (ts || '(unknown)');
  return ts.slice(0, 4) + '-' + ts.slice(4, 6) + '-' + ts.slice(6, 8) +
         ' ' + ts.slice(8, 10) + ':' + ts.slice(10, 12) + ':' + ts.slice(12, 14);
}

// Convert compact timestamp "20260401143020" → "April 1, 2026 at 2:30:20 PM"
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
    // Owner: script name from RUN= variable (organisational label)
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

      case 'bigbang': {
        var mapString  = normName(pkt.mapString  || '');
        var lobbyMap   = normName(pkt.lobbyMap   || '');
        var isRound    = pkt.isRound;
        result = bigbang(drive, mapString, lobbyMap, isRound, session);
        logRequest(req, method, drive, mapString, session, result);
        return respond(res, result);
      }

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

// ── Startup wizard (module scope – must be accessible from _initializeServer) ──

// State for the first-startup identity wizard (server name + data directory).
// null = not in wizard; otherwise an object tracking the current step.
var _startupWizard = null;

function _startupWizardPrompt() {
  var w = _startupWizard;
  if (!w) return;
  switch (w.step) {
    case 'server_name':
      process.stdout.write('Server Name [' + SERVER_NAME + ']: ');
      break;
    case 'initial_drive':
      process.stdout.write('Initial drive name [capflag.js]: ');
      break;
  }
}

function _startupWizardStep(line) {
  var w = _startupWizard;
  var trimmed = line.trim();

  switch (w.step) {
    case 'server_name': {
      if (trimmed) {
        if (trimmed.length > MAX_SERVER_NAME_LEN) {
          process.stdout.write('\u2717 Server name must be ' + MAX_SERVER_NAME_LEN + ' characters or fewer.\n');
          _startupWizardPrompt();
          return;
        }
        if (!VALID_SERVER_NAME_RE.test(trimmed)) {
          process.stdout.write('\u2717 Invalid characters. Use A-Z, a-z, 0-9, space, - _ . ( ) + =\n');
          _startupWizardPrompt();
          return;
        }
        SERVER_NAME = trimmed;
      }
      w.step = 'initial_drive';
      _startupWizardPrompt();
      break;
    }

    case 'initial_drive': {
      var driveName = trimmed || 'capflag.js';
      var fv = validateName(driveName);
      if (!fv.ok) {
        process.stdout.write('\u2717 Invalid drive name: ' + fv.reason + '\n');
        _startupWizardPrompt();
        return;
      }
      saveServerConfig({ serverName: SERVER_NAME, drives: [driveName] });
      _startupWizard = null;
      _proceedWithStartup();
      break;
    }
  }
}

// ── Server console (stdin) command processing ─────────────────────────────────

if (process.stdin.isTTY) {
  process.stdin.setEncoding('utf8');

  // State for the Alpine Linux-style interactive drive creation wizard.
  // null = not in wizard; otherwise an object tracking the current step.
  var _createWizard = null;

  // Navigation state for QDOS-style drive inspection commands
  var _serverMountedDrive = null;
  var _serverCwd = '/';

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

    // Subdirectories in current directory
    var dirPrefix = dir ? (dir + '/') : '';
    var subDirs   = Object.keys(drive.dirs || {}).filter(function (d) {
      if (!d.startsWith(dirPrefix)) return false;
      var rel = d.substring(dirPrefix.length);
      return rel && rel.indexOf('/') < 0;
    });
    for (var di = 0; di < subDirs.length; di++) {
      process.stdout.write('  <DIR>  ' + subDirs[di].substring(dirPrefix.length) + '\n');
    }

    // Files in current directory
    var dirEntries = drive.manifest.filter(function (e) {
      if (e.name === MANIFEST_KEY) return false;
      var base  = resolveName('/', e.name).replace(/\/$/, '');
      var slash = base.lastIndexOf('/');
      var fileDir = slash >= 0 ? base.substring(0, slash) : '';
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

    // Subdirectories
    var lsDirs = Object.keys(drive.dirs || {}).filter(function (d) {
      if (!d.startsWith(lsPrefix)) return false;
      var rel = d.substring(lsPrefix.length);
      return rel && rel.indexOf('/') < 0;
    });
    for (var li = 0; li < lsDirs.length; li++) {
      process.stdout.write(lsDirs[li].substring(lsPrefix.length) + '/\n');
    }

    // Files
    var lsEntries = drive.manifest.filter(function (e) {
      if (e.name === MANIFEST_KEY) return false;
      var base  = resolveName('/', e.name).replace(/\/$/, '');
      var slash = base.lastIndexOf('/');
      var fileDir = slash >= 0 ? base.substring(0, slash) : '';
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
    var exEntry = _findEntry(drives[_serverMountedDrive].manifest, name);
    if (!exEntry) { process.stdout.write('Error: file "' + name + '" not found.\n'); return; }
    var exNb = baseName(exEntry.name);
    process.stdout.write('File: '        + exNb + '\n');
    process.stdout.write('Size: '        + (exEntry.size || 0) + ' bytes\n');
    process.stdout.write('Created: '     + _formatTimestampHuman(exEntry.timestamp) + '\n');
    process.stdout.write('Owner Token: ' + (exEntry.session || '(none)') +
                         ' (' + (exEntry.owner || '(none)') + ')\n');
  }

  function _wizardPrompt(msg) {
    process.stdout.write(msg);
  }

  // Parse a command line into tokens, respecting double-quoted strings.
  // e.g. 'create "/my/dir" "My Server"' → ['create', '/my/dir', 'My Server']
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

  // Start the interactive drive-creation wizard.
  // preArgs: optional array of pre-supplied positional arguments matching question order:
  //   [0] drive name, [1] persistence
  function _startCreateWizard(preArgs) {
    var driveNames = Object.keys(drives);
    var defaultDrive = driveNames.length === 0 ? 'ctf-game' : 'new-drive';
    _createWizard = { step: 'drive_name', args: preArgs || [], defaultDrive: defaultDrive };
    process.stdout.write('\n');
    // Auto-advance through any pre-supplied args
    _wizardAutoAdvance();
  }

  // If the current wizard step has a pre-supplied arg, consume it; otherwise prompt.
  function _wizardAutoAdvance() {
    var w = _createWizard;
    if (!w) return;
    var argIdx = { drive_name: 0, persistent: 1 };
    var idx = argIdx[w.step];
    if (idx !== undefined && idx < w.args.length) {
      // Echo the pre-supplied value and process it as if the user typed it
      var val = w.args[idx];
      _wizardEchoStep(val);
      _wizardStep(val);
    } else {
      _wizardShowPrompt();
    }
  }

  // Print the prompt for the current wizard step.
  function _wizardShowPrompt() {
    var w = _createWizard;
    if (!w) return;
    switch (w.step) {
      case 'drive_name':
        _wizardPrompt('Input name of drive to create [' + w.defaultDrive + ']: ');
        break;
      case 'persistent':
        _wizardPrompt('[P]ersistent or [T]emporary data? [T]: ');
        break;
    }
  }

  // Echo a pre-supplied argument as if the user typed and submitted it.
  function _wizardEchoStep(val) {
    var w = _createWizard;
    if (!w) return;
    switch (w.step) {
      case 'drive_name':
        process.stdout.write('Drive name: ' + val + '\n');
        break;
      case 'persistent':
        process.stdout.write('Persistence: ' + val + '\n');
        break;
    }
  }

  // Process one line of input while the drive creation wizard is active
  function _wizardStep(line) {
    var w = _createWizard;
    var trimmed = line.trim();

    switch (w.step) {
      case 'drive_name':
        w.driveName = trimmed || w.defaultDrive;
        w.step = 'persistent';
        _wizardAutoAdvance();
        break;

      case 'persistent': {
        var persInput = trimmed.toLowerCase();
        // 'p' or 'persistent' → persistent; anything else (t, temporary, Enter) → temporary
        w.persistent = (persInput === 'p' || persInput === 'persistent');
        var cr = driveCreate(w.driveName, 'console', w.persistent);
        if (cr.success) {
          var typeStr = w.persistent ? 'persistent' : 'temporary (memory)';
          process.stdout.write('\n\u2713 Created ' + typeStr + ' drive \'' + w.driveName + '\'.\n');
          if (w.persistent) {
            process.stdout.write('\u2713 Drive file: ' + path.join(process.cwd(), w.driveName + '.json') + '\n');
          }
        } else {
          process.stdout.write('\n\u2717 Error: ' + cr.error + '\n');
        }
        _createWizard = null;
        process.stdout.write('\nqandyland.js ');
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
      // Startup wizard takes priority over everything else
      if (_startupWizard) {
        _startupWizardStep(line);
        return;
      }

      // While the creation wizard is active, feed all input to it
      if (_createWizard) {
        _wizardStep(line);
        return;
      }

      var trimmed = line.trim();
      if (!trimmed) return;
      var allTokens = parseQuotedArgs(trimmed);
      var cmd   = (allTokens[0] || '').toLowerCase();
      var arg   = allTokens.slice(1).join(' ');

      switch (cmd) {
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
              var stats = calculateDriveStats(d);
              var typeLabel  = d.persistent ? 'persistent' : 'memory';
              process.stdout.write('  ' + n + '  [' + typeLabel + ']' +
                '  ' + stats.fileCount + ' file(s), ' + formatBytes(stats.totalSize) + '\n');
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

        case 'delete':
          if (_serverMountedDrive) {
            // File delete within the mounted drive (sysop has full access)
            if (!arg) { process.stdout.write('Usage: delete <filename>\n'); break; }
            _handleFileDelete(arg);
          } else {
            // Drive delete when no drive is mounted (existing behaviour)
            if (!arg) { process.stdout.write('Usage: delete <name>\n'); break; }
            var dn = normName(arg);
            if (!drives[dn]) {
              process.stdout.write('Error: drive "' + dn + '" not found.\n');
            } else {
              process.stdout.write('Warning: All data on drive "' + dn + '" will be permanently lost.\n');
              var wasPersistent = drives[dn].persistent;
              delete drives[dn];
              if (wasPersistent) {
                // Remove the per-drive JSON file from the working directory
                try { fs.unlinkSync(path.join(process.cwd(), dn + '.json')); } catch (e) { /* ignore */ }
              }
              process.stdout.write('Drive "' + dn + '" deleted.\n');
            }
          }
          break;

        case 'help':
          process.stdout.write(
            'Server console commands:\n' +
            '  create [drive-name] [P|T]\n' +
            '                      - Create a new drive (interactive wizard)\n' +
            '                        Arguments match question order; omit any to be prompted.\n' +
            '  list                - List all drives with type\n' +
            '  delete <name>       - Delete a drive (no drive mounted) or a file (drive mounted)\n' +
            '\nNavigation commands (mount a drive first):\n' +
            '  mount <drive>       - Mount a drive for navigation\n' +
            '  dir                 - Directory listing with full metadata\n' +
            '  ls                  - Simple file/directory listing\n' +
            '  cd <name>           - Change directory (.. = parent, / = root)\n' +
            '  mkdir <name>        - Create a directory\n' +
            '  rmdir <name>        - Remove an empty directory\n' +
            '  rename <old>=<new>  - Rename a file\n' +
            '  exam <name>         - Examine file metadata in detail\n' +
            '  help                - Show this help\n'
          );
          break;

        default:
          process.stdout.write('Unknown command "' + cmd + '". Type "help" for commands.\n');
      }
    });
  });
}

// ── Server initialization ─────────────────────────────────────────────────────

// Complete server startup: create blank drives from config, start HTTP listener.
function _proceedWithStartup() {
  var cfg = loadServerConfig();
  var driveList = (cfg.drives && Array.isArray(cfg.drives) && cfg.drives.length > 0)
    ? cfg.drives
    : ['capflag.js'];

  // Save config (only safe fields: serverName and drives list, no path information)
  saveServerConfig({ serverName: SERVER_NAME, drives: driveList });

  // Create blank memory-only drives from config (drives always start empty on restart)
  for (var i = 0; i < driveList.length; i++) {
    var dn = normName(driveList[i]);
    if (dn && validateName(dn).ok) {
      var cr = driveCreate(dn, 'console', false);
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
          if (process.stdin.isTTY) { process.stdout.write('\nqandyland.js '); }
        });
      });
    } else {
      displayStartupBanner(null, 'Disabled', null);
      if (process.stdin.isTTY) { process.stdout.write('\nqandyland.js '); }
    }
  });
}

// Determine whether this is the first startup (no saved server config in working directory).
function _isFirstStartup() {
  try {
    return !fs.existsSync(path.join(process.cwd(), SERVER_CONFIG_FILE));
  } catch (e) {
    return true;
  }
}

// Load saved config and apply to globals (CLI args take precedence).
function _applyServerConfig() {
  var cfg = loadServerConfig();
  if (cfg.serverName && !_cliName) { SERVER_NAME = cfg.serverName; }
  return cfg;
}

// Entry point: ask for identity on first TTY startup, otherwise proceed directly.
(function _initializeServer() {
  // If name was provided via CLI, skip the wizard
  if (_cliName) {
    _applyServerConfig();
    _proceedWithStartup();
    return;
  }

  // If a saved config exists, load it and start directly
  if (!_isFirstStartup()) {
    _applyServerConfig();
    _proceedWithStartup();
    return;
  }

  // First startup without a TTY: use defaults and proceed silently
  if (!process.stdin.isTTY) {
    _proceedWithStartup();
    return;
  }

  // First startup with a TTY: run the identity wizard before starting HTTP
  process.stdout.write('\nQandyland Player Server\n\n');
  _startupWizard = { step: 'server_name' };
  _startupWizardPrompt();
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