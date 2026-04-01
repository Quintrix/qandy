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
var MAX_FILE_BYTES = 1024 * 1024;   // 1 MB per file
var MAX_DRIVE_FILES = 1000;
var SESSION_COOKIE = 'qsession';
var VALID_NAME_RE  = /^(?!\.)[A-Za-z0-9 \-_.()+=!]+$/;
var DRIVES_FILE    = 'drives.json';

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
//   manifest: [{ name, size, timestamp, owner }],
//   files:    { canonicalName: content_string },
//   dirs:     { dirName: true },
//   created:  timestamp_string
// }
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

function saveDrives() {
  var driveData = {
    drives: {},
    metadata: {
      version: '1.0',
      lastModified: new Date().toISOString()
    }
  };
  var names = Object.keys(drives);
  for (var i = 0; i < names.length; i++) {
    var n = names[i];
    var d = drives[n];
    driveData.drives[n] = {
      id:       n,
      created:  d.created || new Date().toISOString(),
      owner:    d.owner   || 'server',
      manifest: d.manifest || [],
      files:    d.files    || {},
      dirs:     d.dirs     || {},
      stats:    calculateDriveStats(d)
    };
  }
  fs.writeFile(DRIVES_FILE, JSON.stringify(driveData, null, 2), function (err) {
    if (err) console.warn('Failed to save ' + DRIVES_FILE + ':', err.message || String(err));
  });
}

function loadDrives() {
  try {
    var data = fs.readFileSync(DRIVES_FILE, 'utf8');
    var driveData = JSON.parse(data);
    var names = Object.keys(driveData.drives || {});
    for (var i = 0; i < names.length; i++) {
      var n    = names[i];
      var info = driveData.drives[n];
      drives[n] = {
        manifest: info.manifest || [],
        files:    info.files    || {},
        dirs:     info.dirs     || {},
        owner:    info.owner    || 'server',
        created:  info.created  || new Date().toISOString()
      };
    }
    return driveData.drives;
  } catch (e) {
    return {};
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

function driveCreate(driveName, session) {
  var name = normName(driveName);
  var fv = validateName(name);
  if (!fv.ok) return { success: false, error: 'invalid drive name: ' + fv.reason };
  if (drives[name]) return { success: false, error: 'drive already exists' };

  var ts = timestamp();
  drives[name] = {
    manifest: [],
    files:    {},
    dirs:     {},
    owner:    session,
    created:  ts
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
    lines.push(e.name + '|' + e.size + '|' + e.timestamp + '|' + (e.owner || ''));
  }
  var body    = lines.length ? lines.join('\n') + '\n' : '';
  var selfLine = MANIFEST_KEY + '|0|' + ts;
  var full    = body + selfLine;
  var mSize   = utf8len(full);
  selfLine    = MANIFEST_KEY + '|' + mSize + '|' + ts;
  full        = body + selfLine;

  drive.files[MANIFEST_KEY] = full;
  drive.manifest = entries.filter(function (e) { return e.name !== MANIFEST_KEY; });
  drive.manifest.push({ name: MANIFEST_KEY, size: utf8len(full), timestamp: ts, owner: '' });
}

function fileSave(driveName, cwd, name, content, session) {
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
  // Ownership check (non-public files)
  if (existing && existing.owner && existing.owner !== session) {
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

  // Update manifest
  var manifest = drive.manifest.filter(function (e) {
    return e.name !== MANIFEST_KEY && baseName(normName(e.name)).toLowerCase() !== baseName(normName(fname)).toLowerCase();
  });
  manifest.push({ name: fname, size: size, timestamp: ts, owner: session });
  _saveManifest(driveName, manifest);

  saveDrives();
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

  // Private file ownership check
  if (existing.owner && existing.owner !== session) {
    return { success: false, error: 'permission denied' };
  }

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
  if (existing.owner && existing.owner !== session) {
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
  if (existing.owner && existing.owner !== session) {
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
  manifest.push({ name: dname, size: existing.size, timestamp: ts, owner: existing.owner || session });
  _saveManifest(driveName, manifest);

  saveDrives();
  return { success: true, result: 'renamed' };
}

function fileExists(driveName, cwd, name, session) {
  var drive = drives[driveName];
  if (!drive) return { success: true, exists: false };

  var fname    = normName(name);
  if (!fname) return { success: true, exists: false };
  var existing  = _findEntry(drive.manifest, fname);
  if (!existing) return { success: true, exists: false };

  // Privately owned files are not visible unless you own them
  if (existing.owner && existing.owner !== session) {
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
  saveDrives();
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
  saveDrives();
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

  // Files
  var entries = drive.manifest.filter(function (e) {
    if (e.name === MANIFEST_KEY) return showHidden;
    if (!showHidden && isHidden(e.name)) return false;
    if (e.owner && e.owner !== session) return false;
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
    if (e.owner && e.owner !== session) return false;
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
    var options = pkt.options || {};
    var pattern = normName(pkt.pattern || '');
    var switches = normName(pkt.switches || '');

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
        result = fileSave(drive, cwd, name, content, session);
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

  var _stdinBuf = '';
  process.stdin.on('data', function (chunk) {
    _stdinBuf += chunk;
    var lines = _stdinBuf.split('\n');
    _stdinBuf = lines.pop();
    lines.forEach(function (line) {
      var trimmed = line.trim();
      if (!trimmed) return;
      var parts = trimmed.split(/\s+/);
      var cmd   = parts[0].toLowerCase();
      var arg   = parts.slice(1).join(' ');

      switch (cmd) {
        case 'create':
          if (!arg) { process.stdout.write('Usage: create <name>\n'); break; }
          var cr = driveCreate(arg, 'console');
          process.stdout.write(cr.success ? 'Drive "' + arg + '" created.\n' : 'Error: ' + cr.error + '\n');
          break;

        case 'list':
          var names = Object.keys(drives);
          if (names.length === 0) {
            process.stdout.write('No drives.\n');
          } else {
            process.stdout.write('Drives: ' + names.join(', ') + '\n');
          }
          break;

        case 'delete':
          if (!arg) { process.stdout.write('Usage: delete <name>\n'); break; }
          var dn = normName(arg);
          if (!drives[dn]) {
            process.stdout.write('Error: drive "' + dn + '" not found.\n');
          } else {
            process.stdout.write('Warning: All data on drive "' + dn + '" will be permanently lost.\n');
            delete drives[dn];
            saveDrives();
            process.stdout.write('Drive "' + dn + '" deleted.\n');
          }
          break;

        case 'help':
          process.stdout.write(
            'Server console commands:\n' +
            '  create <name>  - Create a new drive\n' +
            '  list           - List all drives\n' +
            '  delete <name>  - Delete a drive\n' +
            '  help           - Show this help\n'
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
