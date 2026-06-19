
//
// ──── Qandyland Server v2 ────────────────────────────────────────────────────
//
// Storage structure: drive.storage = Map<key, value>
//   Files:       "path/to/file.txt" → "file content"
//   Directories: "<path/to/dir>"    → ""
//   Manifest:    "_dir.sys!"        → "name|size|timestamp|owner|session\n..."
//

'use strict';

// Sysop Variables
var sysopOffline=true;        // only serves files to localHost
var sysopVision = 2;          // Radius for Mountain Look
var sysopCardWidth = 160;     // "Front-and-back punch card" limit
var sysopGfx = 'capflag.gfx'; // default .gfx file


const UNIVAC = require('./qandyland-univac.js');
UNIVAC.inject({ fileLoad,
                fileSave,
                fileDelete,
                fileList,
                fileRename,
                futureTimestamp
              });

var http   = require('http');
var path   = require('path');
var fs     = require('fs');

// ── Configuration ─────────────────────────────────────────────────────────────
var PORT = parseInt(process.argv[2], 10) || 8080;
var MANIFEST_KEY  = '_dir.sys!';
var MAX_NAME_BYTES = 255;
// Hard-coded limits: modify source to change (not configurable via API or scripts)
var MAX_TOTAL_DRIVE_SIZE = 5 * 1024 * 1024; // 5 MB per drive
var MAX_FILE_BYTES = 32 * 1024;             // 32 KB per file
var MAX_DRIVE_FILES = 10000;
var SESSION_COOKIE = 'q';
var TYPE_MAX_BYTES = 65536; // 64 KB display limit
var VALID_NAME_RE = /^(?!\.)[A-Za-z0-9 \-_.()+=!]+$/;

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

var drives = {};
var playerIndex = new Map();

// ── Storage helpers ───────────────────────────────────────────────────────────

// Get a value from the storage Map by key. Returns null if not found.
function _storageGet(storage, key) {
  var val = storage.get(key);
  return val !== undefined ? val : null;
}

// Set a value in the storage Map. Inserts or updates.
function _storageSet(storage, key, value) {
  storage.set(key, value);
}

// Delete an entry from the storage Map by key.
function _storageDelete(storage, key) {
  storage.delete(key);
}

// ── Manifest helpers ──────────────────────────────────────────────────────────

var _manifestDebounceTimers = new Map();

function _debounceSaveManifestToStorage(driveName) {
  if (_manifestDebounceTimers.has(driveName)) {
    clearTimeout(_manifestDebounceTimers.get(driveName));
  }
  _manifestDebounceTimers.set(driveName, setTimeout(function() {
    // Perform the actual serialization to _dir.sys! in storage
    _serializeManifestMapToStorage(driveName);
    _manifestDebounceTimers.delete(driveName);
  }, 50)); // Debounce for 50ms
}

// Internal helper to serialize the manifestMap to the _dir.sys! string in storage
// NOTE: This function still uses _storageSet to put the serialized
// manifest string back into the main drive.storage Map.
function _serializeManifestMapToStorage(driveName) {
  var drive = drives[driveName];
  if (!drive || !drive.manifestMap) return;

  var ts = timestamp();
  var lines = [];
  // Iterate the manifestMap, excluding the MANIFEST_KEY itself
  drive.manifestMap.forEach(function(e) {
    if (e.name === MANIFEST_KEY) return;
    lines.push(
      e.name + '|' + e.size + '|' + e.timestamp + '|' +
      (e.owner || '') + '|' + (e.session || '')
    );
  });

  var body     = lines.length ? lines.join('\n') + '\n' : '';
  var selfLine = MANIFEST_KEY + '|0|' + ts;
  var full     = body + selfLine;
  var mSize    = utf8len(full);
  selfLine     = MANIFEST_KEY + '|' + mSize + '|' + ts;
  full         = body + selfLine;

  var finalSize = utf8len(full);
  if (finalSize !== mSize) {
    selfLine = MANIFEST_KEY + '|' + finalSize + '|' + ts;
    full     = body + selfLine;
  }
  _storageSet(drive.storage, MANIFEST_KEY, full);
}

// This function will now be called ONCE at drive initialization.
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
    // Exclude the manifest's own entry from the list of content entries
    if (!name || name === MANIFEST_KEY) continue;
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
  if (!drive || !drive.manifestMap) {
    // This should ideally not happen after proper initialization
    console.error(`_readManifest called on uninitialized drive: ${driveName}`);
    return [];
  }
  // Convert Map values to an array, as original functions expect an array
  return Array.from(drive.manifestMap.values());
}

function _saveManifest(driveName, entries) {
  var drive = drives[driveName];
  if (!drive) return; // Drive must exist

  // Clear and repopulate the manifestMap from the provided 'entries' array
  drive.manifestMap.clear();
  var currentTotalSize = 0;
  var currentFileCount = 0;
  
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    if (e.name === MANIFEST_KEY) continue; // Ensure _dir.sys! is not added to manifestMap
    drive.manifestMap.set(e.name, {
      name: e.name,
      size: e.size,
      timestamp: e.timestamp,
      owner: e.owner,
      session: e.session
    });
    // Update cached stats based on what's going into the manifestMap
    if (e.name.charAt(0) !== '<') { // Count only files (not directory tokens)
      currentFileCount++;
      currentTotalSize += e.size;
    }
  }
  drive.fileCount = currentFileCount;
  drive.totalSize = currentTotalSize;
  _debounceSaveManifestToStorage(driveName);
}

// ── Drive stats ───────────────────────────────────────────────────────────────

function calculateDriveStats(drive) {
  if (typeof drive.fileCount === 'number' && typeof drive.totalSize === 'number') {
    return { fileCount: drive.fileCount, totalSize: drive.totalSize };
  }
  let fileCount = 0, totalSize = 0;
  (drive.storage || new Map()).forEach(function(val, key) {
    if (key !== MANIFEST_KEY && key.charAt(0) !== '<') {
      fileCount++;
      totalSize += utf8len(val);
    }
  });
  drive.fileCount = fileCount;
  drive.totalSize = totalSize;
  return { fileCount, totalSize };
}

function formatBytes(bytes) {
  if (bytes === 0) return '0B';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + 'KB';
  return Math.round(bytes / (1024 * 1024)) + 'MB';
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
  console.log(_boxLine('       QANDYLAND SERVER AND UNIVAC PUNCH CODE PROCESSOR '));
  console.log('╠' + line + '╣');

    console.log(_boxLine(''));

  var portStr  = 'Port: ' + String(PORT).padEnd(25);
  var ipStr    = 'Public IP: ' + (publicIP || '(unknown)').padEnd(15);
  console.log(_boxLine(' ' + portStr + ' ' + ipStr));

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

// Generates a 14-character timestamp 'minutes' into the future
function futureTimestamp(minutes) {
  var d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
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

// --- Update getSession to look at the URL parameters ---
function getSession(req) {
  try {
    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    // Priority: 1. URL Parameter 's', 2. Legacy Header
    return reqUrl.searchParams.get('s') || req.headers['x-session-token'] || null;
  } catch (e) {
    return null;
  }
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

// Custom 404 Handler that looks for 404.html
function serve404(res) {
  var errorPage = path.join(__dirname, '404.html');
  fs.stat(errorPage, function(err, stat) {
    if (!err && stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html' });
      fs.createReadStream(errorPage).pipe(res);
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
    }
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
    storage:     new Map(),   // Map<key, value> for O(1) access
    manifestMap: new Map(),  // NEW: In-memory map for metadata
    owner:       session,
    created:     ts,
    fileCount:   0,          // NEW: Cached stats
    totalSize:   0           // NEW: Cached stats
  };

  // Initialize the manifest with an empty entry by calling _saveManifest.
  // This will also trigger the debounced serialization to storage.
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

function fileSave(driveName, cwd, name, content, session, owner, customTs) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var fname = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var fv = validateName(baseName(fname));
  if (!fv.ok) return { success: false, error: fv.reason };

  var canonical = resolveName(cwd, fname);
  
  // O(1) Manifest Lookup instead of Array reading
  var existing = drive.manifestMap.get(canonical);

  if (existing && isWriteProtected(existing.name)) {
    return { success: false, error: 'file is write-protected' };
  }

  var str  = String(content == null ? '' : content);
  var size = utf8len(str);

  if (size > MAX_FILE_BYTES) return { success: false, error: 'file too large (max ' + formatBytes(MAX_FILE_BYTES) + ')' };

  // Calculate stats directly without looping
  if (!existing && drive.fileCount >= MAX_DRIVE_FILES) return { success: false, error: 'drive full' };
  var oldSize = existing ? existing.size : 0;
  if (drive.totalSize - oldSize + size > MAX_TOTAL_DRIVE_SIZE) return { success: false, error: 'drive storage limit exceeded' };

  var ts = customTs || timestamp();
  _storageSet(drive.storage, canonical, str);

  // Instantly update the manifest Map
  drive.manifestMap.set(canonical, {
    name:      canonical,
    size:      size,
    timestamp: ts,
    owner:     owner || session,
    session:   session
  });

  // Keep cache updated incrementally
  if (!existing && canonical.charAt(0) !== '<') drive.fileCount++;
  if (canonical.charAt(0) !== '<') drive.totalSize += (size - oldSize);

  _debounceSaveManifestToStorage(driveName);
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

  var fname = normName(name);
  if (!fname) return { success: false, error: 'invalid filename' };
  var canonical = resolveName(cwd, fname);
  
  var existing = drive.manifestMap.get(canonical);
  if (!existing) return { success: false, error: 'file not found' };
  if (isWriteProtected(existing.name)) return { success: false, error: 'file is write-protected' };

  _storageDelete(drive.storage, canonical);
  drive.manifestMap.delete(canonical);

  if (canonical.charAt(0) !== '<') {
    drive.fileCount--;
    drive.totalSize -= existing.size;
  }

  _debounceSaveManifestToStorage(driveName);
  return { success: true, result: 'deleted' };
}

function fileRename(driveName, cwd, name, dest, session) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not mounted' };

  var fname = normName(name);
  var dname = normName(dest);
  var fv = validateName(baseName(fname));
  var dv = validateName(baseName(dname));
  if (!fv.ok) return { success: false, error: fv.reason };
  if (!dv.ok) return { success: false, error: 'invalid destination: ' + dv.reason };

  var srcCanonical  = resolveName(cwd, fname);
  var destCanonical = resolveName(cwd, dname);
  
  var existing = drive.manifestMap.get(srcCanonical);
  var destExisting = drive.manifestMap.get(destCanonical);

  if (!existing) return { success: false, error: 'file not found' };
  if (isWriteProtected(existing.name)) return { success: false, error: 'file is write-protected' };
  if (destExisting) return { success: false, error: 'destination already exists' };

  var content = _storageGet(drive.storage, srcCanonical);
  if (content == null) return { success: false, error: 'file not found' };

  _storageSet(drive.storage, destCanonical, content);
  _storageDelete(drive.storage, srcCanonical);

  drive.manifestMap.delete(srcCanonical);
  drive.manifestMap.set(destCanonical, {
    name:      destCanonical,
    size:      existing.size,
    timestamp: timestamp(),
    owner:     existing.owner || session,
    session:   existing.session || session
  });

  _debounceSaveManifestToStorage(driveName);
  return { success: true, result: 'renamed' };
}

function fileExists(driveName, cwd, name) {
  var drive = drives[driveName];
  if (!drive) return { success: true, exists: false };

  var fname = normName(name);
  if (!fname) return { success: true, exists: false };
  
  var canonical = resolveName(cwd, fname);
  
  // O(1) key check on the manifest map
  var exists = drive.manifestMap.has(canonical);
  return { success: true, exists: exists, path: canonical };
}

// Search manifest using wildcards
function fileSearch(driveName, pattern) {
  var drive = drives[driveName];
  if (!drive) return { success: false, error: 'drive not found', results: [] };

  var results = [];
  var manifest = _readManifest(driveName);

  for (var i = 0; i < manifest.length; i++) {
    var e = manifest[i];
    if (e.name === MANIFEST_KEY || e.name.charAt(0) === '<') continue;
    
    // Support matching either the full canonical path or just the base filename
    var base = baseName(e.name);
    if (matchPattern(base, pattern) || matchPattern(e.name, pattern)) {
      results.push({
        name: e.name,
        size: e.size,
        timestamp: e.timestamp
      });
    }
  }
  return { success: true, results: results };
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
  if (drive.storage.has(dirToken)) {
    return { success: false, error: 'directory already exists' };
  }

  // For nested directories, ensure parent exists
  var slashIdx = canonical.lastIndexOf('/');
  if (slashIdx > 0) {
    var parent = canonical.substring(0, slashIdx);
    var parentToken = '<' + parent + '>';
    if (!drive.storage.has(parentToken)) {
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

  if (!drive.storage.has('<' + canonical + '>')) {
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
  if (!drive.storage.has(dirToken)) {
    return { success: false, error: 'directory not found' };
  }

  // Check if empty (no files or subdirs under this path)
  var prefix = canonical + '/';
  var notEmpty = false;
  drive.storage.forEach(function(val, k) {
    if (notEmpty) return;
    if (k === dirToken || k === MANIFEST_KEY) return;
    // Sub-directory tokens: <canonical/...>
    if (k.charAt(0) === '<') {
      var inner = k.substring(1, k.length - 1);
      if (inner.indexOf(prefix) === 0) notEmpty = true;
    } else {
      if (k.indexOf(prefix) === 0) notEmpty = true;
    }
  });
  if (notEmpty) return { success: false, error: 'directory not empty' };

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

  storage.forEach(function(val, k) {
    if (k.charAt(0) !== '<') return;
    var inner = k.substring(1, k.length - 1);
    if (inner.indexOf(dirPrefix) !== 0) return;
    var rel = inner.substring(dirPrefix.length);
    if (!rel || rel.indexOf('/') >= 0) return;
    if (!showHidden && isHidden(rel)) return;
    if (pattern && !matchPattern(rel, pattern)) return;
    lines.push('  <DIR>  ' + rel + '\n');
  });

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
  
  // Grab the current time for lazy expiration checks
  var now = timestamp(); 

  var entries = manifest.filter(function (e) {
    if (!e || !e.name) return false;
    if (e.name === MANIFEST_KEY) return false;
    if (e.name.charAt(0) === '<') return false;
    var slash = e.name.lastIndexOf('/');
    var fileDir = slash >= 0 ? e.name.substring(0, slash) : '';
    return fileDir === dir;
  });

  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];

    // ── LAZY GARBAGE COLLECTION ──
    if (e.timestamp && e.timestamp.charAt(0) === 'X') {
      var expTime = e.timestamp.substring(1);
      if (now >= expTime) {
        // Delete it from the server immediately
        fileDelete(driveName, '/', e.name, 'system');
        console.log('[GC-Lazy] Expired item removed on read: ' + e.name);
        // Skip adding it to the return array
        continue;
      }
    }

    var nb = baseName(e.name);
    if (pattern && !matchPattern(nb, pattern)) continue;
    names.push(nb);
  }
  
  return { success: true, listing: names.join(' ') };
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

function getIP(req) {
  var rawIp = req.headers['x-forwarded-for'] || (req.socket && req.socket.remoteAddress) || '127.0.0.1';
  var ip = rawIp.replace('::ffff:', '').replace('::1', '127.0.0.1').slice(0, 15);
  return ip;
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
// A system file will always be 1 character 
// A static object filename will always be 6 characters (item z-location data)
// A dynamic item filename will always be 4 characters (item z-location)
// A player item will always be at least 8 characters (item a-location face body)
//

function bigbang(driveName, session) {

  if (!drives[driveName]) return { success: false, error: 'drive not mounted: ' + driveName };

  // Load capflag.gfx from the server's working directory
  var gfxPath = path.join(process.cwd(), sysopGfx);
  var raw;
  try {
    raw = fs.readFileSync(gfxPath, 'utf8');
  } catch (e) {
    return { success: false, error: 'cannot read ' + sysopGfx + ': ' + (e.message || String(e)) };
  }

  var lines = raw.split('\n');
  var sectors = [];       // { id, tiles, exits, items[] }
  var systemFiles = [];   // { id, data } for global UNIVAC scripts
  var playerCodes = [];
  var seenCodes   = {};

  for (var li = 0; li < lines.length; li++) {
    var line = lines[li].trim();
    if (!line) continue;

    var eqIdx = line.indexOf('=');
    if (eqIdx < 0) continue;

    var sectorId  = line.substring(0, eqIdx);
    var rest      = line.substring(eqIdx + 1);

    // Ignore metadata entirely (e.g. ##=Pa:White Flag)
    if (sectorId === '##') continue;

    // Single-character keys are flat script files inside /w/, not map sectors
    if (sectorId.length === 1) {
      systemFiles.push({ id: sectorId, data: rest });
      continue;
    }

    var dotIdx    = rest.indexOf('.');
    var mapData   = dotIdx >= 0 ? rest.substring(0, dotIdx) : rest;
    var itemData  = dotIdx >= 0 ? rest.substring(dotIdx + 1) : '';

    // tiles are first 192 chars (96 × 2); exits are the remainder
    var tiles = mapData.substring(0, 192); 
    var exitStr = mapData.substring(192);
    
    // Parse items using comma separation
    var items = [];
    if (itemData) {
      var rawItems = itemData.split('~');
      for (var ri = 0; ri < rawItems.length; ri++) {
        var blob = rawItems[ri].trim();
        if (blob) items.push(blob);
      }
    }
    sectors.push({ id: sectorId, tiles: tiles, exits: exitStr, items: items });
  }

  if (sectors.length === 0) {
    return { success: false, error: sysopGfx + ' contains no valid world sectors' };
  }

  var created = [];
  var errors  = [];

  // Create /w/ root directory
  var wDir = dirMake(driveName, '/', 'w', session);
  if (!wDir.success && wDir.error !== 'directory already exists') {
    return { success: false, error: 'failed to create /w/ directory: ' + wDir.error };
  }

  // Create empty /p/ root directory for connecting players
  var pDir = dirMake(driveName, '/', 'p', session);
  if (!pDir.success && pDir.error !== 'directory already exists') {
    return { success: false, error: 'failed to create /p/ directory: ' + pDir.error };
  }

  // Save 1-character system files into /w/ using their dynamic keys (e.g. w/a, w/b)
  for (var fi = 0; fi < systemFiles.length; fi++) {
    var sysFile = systemFiles[fi];
    var sfResult = fileSave(driveName, '/', 'w/' + sysFile.id, sysFile.data, 'UNIVAC', 'UNIVAC');
    if (!sfResult.success) errors.push('w/' + sysFile.id + ': ' + sfResult.error);
  }
  
  // Process Sector Items
  for (var si = 0; si < sectors.length; si++) {
    var sector  = sectors[si];
    var dirPath = 'w/' + sector.id;

    var mkResult = dirMake(driveName, '/', dirPath, session);
    if (!mkResult.success && mkResult.error !== 'directory already exists') {
      errors.push('mkdir ' + dirPath + ': ' + mkResult.error);
      continue;
    }

    // m(.txt) – valid terrain tiles (192 chars)
    var mResult = fileSave(driveName, '/', dirPath + '/m', sector.tiles, session, 'bigbang');
    if (!mResult.success) errors.push(dirPath + '/m: ' + mResult.error);

    // e(.txt) – valid exits
    var eResult = fileSave(driveName, '/', dirPath + '/e', sector.exits, session, 'bigbang');
    if (!eResult.success) errors.push(dirPath + '/e: ' + eResult.error);

    // Create item files with Bytecode inside
    for (var ii = 0; ii < sector.items.length; ii++) {
      var parts = sector.items[ii].split('|');
      var itemMeta = parts[0];

      // Strip out whitespace then slice the exact limits
      var rawCode = (parts[1] || '').replace(/ /g, "");
      var itemCode = rawCode.replace(/_NL_/g, "");

      var itemId = itemCode.substring(0, 2);
      var iResult = fileSave(driveName, '/', dirPath + '/' + itemMeta, itemCode, '', 'bigbang');
      if (!iResult.success) errors.push(dirPath + '/' + itemMeta + ': ' + iResult.error);
    }

    created.push(sector.id);
  }

  // 
  // need a File System Consistency Checker:
  //
  // it should ensure all directories and files created have known path names
  // to prevent malicious user from 'hiding' data files in directories that 
  // don't exist preventing the terminal operator to know they exist
  // It may become some type of stand alone 'check disk' tool.
  //
  // this is not today's task, we will do this when we have finalized the .gfx format
  // so we will know what we are checking for. This is to make sure I don't forget.

  //
  // -Joe 
  //

  if (errors.length > 0) {
    return { success: false, error: errors.join('; '), maps: created };
  }

  return {
    success: true,
    result:  'World created: ' + created.length + ' sector(s), ' + playerCodes.length + ' player slots',
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
  if (ts && ts.charAt(0) === 'X') ts = ts.substring(1); // <-- ADD THIS
  if (!ts || ts.length < 14) return (ts || '(unknown)');
  return ts.slice(0, 4) + '-' + ts.slice(4, 6) + '-' + ts.slice(6, 8) +
         ' ' + ts.slice(8, 10) + ':' + ts.slice(10, 12) + ':' + ts.slice(12, 14);
}

function _formatTimestampHuman(ts) {
  if (ts && ts.charAt(0) === 'X') ts = ts.substring(1); 
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

// Send a plain-text retro-style response (used by 2-char commands like GS).
function respondRetro(res, text, session) {
  if (session) res.setHeader('X-Session-Token', session); // Return token to client
  res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
  res.end(String(text));
}

// Returns true if the drive name contains only safe filesystem characters.
function isValidDriveName(drive) {
  return !!(drive && /^[A-Za-z0-9_.-]+$/.test(drive) && drive.length <= 64);
}

function plugboard(req, stacker, plugs, drive, session) {
  let output = "";
  if (plugs != "RF") { console.log(plugs+" "+drive+" "+session); }
  function runtape(code) {
    if (code) {
      let uResult = UNIVAC(drive, player.fullPath, "RAM:"+code, session);
      if (uResult) {
        player.map      = uResult.sector;
        player.z        = uResult.z;
        player.avatar   = uResult.avatar;
        if (uResult.playerid) player.pubId = uResult.playerid;
        if (uResult.item) player.item  = uResult.item + player.pubId; // e.g. "ZaAaAa"
        player.fullPath = uResult.fullPath;
        output += uResult.output;
        // this get overwritten at line 1141
      }
    }
  }
  var player = playerIndex.get(session);
  
  if (!player) {
    player = {
      drive: drive,
      fullPath: null,
      map: "A1",
      z: 0,
      item: "",
      avatar: "",
      pubId: ""
    };
  } else {
    if (!player.map) player.map = "A1";
    if (player.z == null) player.z = 0;
    if (!player.item) player.item = "";
    if (!player.avatar) player.avatar = "";
    if (player.avatar.indexOf('-') !== -1) {
      let cleanAvatar = player.avatar.replace(/\-../g, '');
      runtape("Va" + cleanAvatar + "--");
    }
  }
  
  var refresh = true;
  let column = 0; 
  
  let tape="";  
  while (column < plugs.length) {

    let code = plugs.slice(column, column + 2);
    column += 2; 

    switch (code) {
      case 'Vn':
      case 'Vs':
      case 'Ve':
      case 'Vw':
        if (!player.item || player.item === "") { break; }
        tape += code;
        break;
        
      case 'Vd': 
        if (!player.item || player.item === "") { break; }
        let item = plugs.slice(column, column + 2); column += 2;
        tape += code+item;
        break;      

      case 'OD':
        if (tape) { runtape(tape); tape = ""; }
        let objfile = null; 
        let objid = plugs.slice(column, column + 2);
        let objz  = plugs.slice(column + 2, column + 4);
        column += 4;
        
        if (player.item === 'Za') {
        	 if (objid.charAt(0) === 'S') {
        	 	player.z = objz;
        	 }
        }

        let pZStr = (player.z < 10 ? '0' : '') + player.z;

        let odSearchPattern = 'w/' + player.map + '/' + objid + pZStr + '??';
        let odFilesResponse = fileSearch(drive, odSearchPattern);
        
        if (odFilesResponse.success && odFilesResponse.results.length > 0) {
          for (let i = 0; i < odFilesResponse.results.length; i++) {
            let entryName = odFilesResponse.results[i].name;
            let matchedBase = entryName.substring(entryName.lastIndexOf('/') + 1);
            if (matchedBase.length === 6) {
              objfile = entryName;
              break; 
            }
          }
        }

        if (objfile != null) {
          console.log("UNIVAC(" + drive + ", " + player.fullPath + ", " + objfile + ")");
          if (typeof UNIVAC === 'function') {
            let uResult = UNIVAC(drive, player.fullPath, objfile, session);
            if (uResult) {
              player.map = uResult.sector;
              player.z = uResult.z;
              player.avatar = uResult.avatar;
              if (uResult.playerid) player.pubId = uResult.playerid;
              if (uResult.item) player.item = uResult.item + player.pubId;
              
              player.fullPath = uResult.fullPath;
              output += uResult.output;
            }
            console.log("###1205### fullPath="+player.fullPath+" objfile="+objfile);
            // ###1196### fullPath=w/H1/Sa44AaAaAaAa objfile=w/H1/Sa66Za
          }
        }
        break;
                
      case 'ID':
        if (tape) { runtape(tape); tape = ""; }
        let itemId = plugs.slice(column, column + 2);
        let itemZ  = plugs.slice(column + 2, column + 4);
        column += 4;
        
        let searchPrefix = 'w/' + player.map + '/' + itemId;
        let filesResponse = fileSearch(drive, searchPrefix + '*');
        
        if (filesResponse.success && filesResponse.results.length > 0) {
          let matchedPath = null;
          let matchedBase = null;
          
          for (let i = 0; i < filesResponse.results.length; i++) {
            let base = filesResponse.results[i].name.split('/').pop();
            if (base.substring(2, 4) === itemZ) {
              matchedPath = filesResponse.results[i].name;
              matchedBase = base;
              break;
            }
          }

          if (matchedPath) {
            let matchedPubId = matchedBase.length >= 8 ? matchedBase.substring(4, 8) : "";
            let matchedFullId = matchedPubId ? itemId + matchedPubId : itemId;

            // If the player clicks their own item, send inventory
            console.log("###1256 matchedFullId="+matchedFullId+" player.item="+player.item);
            if (matchedFullId === player.item) {
              let invLoad = fileLoad(drive, '/', player.fullPath, session);
              let inventoryData = (invLoad.success && invLoad.content) ? invLoad.content : '';
              output += "S^Vi" + inventoryData + "^S";
              break; 
            }
            
            // Pick up standard dynamic items
            if (itemId >= 'Aa' && itemId < 'Qa') { tape += 'XnVd'+itemId; }
          }
        }
        break;                  

      case 'ST':
        if (tape) { runtape(tape); tape = ""; }
        if (session && playerIndex.has(session)) {
          output += "ST" + session;
        } else {
          let chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          let pubId = '';
          for (let i = 0; i < 4; i++) pubId += chars.charAt(Math.floor(Math.random() * chars.length));

          let secret = Math.random().toString(36).substring(2, 10);
          session = secret;

          player = {
            drive:    drive,
            fullPath: null,
            map:      "A1",
            item:     "",
            z:        0,
            avatar:   "",
            pubId:    pubId
          };
          playerIndex.set(session, player);

          // Create the ghost player file with Za (empty slot) as the item
          runtape("XaZa");
          player.item = 'Za'; // mark slot as created so item guards pass
          let numericZ = parseInt(player.z, 10) || 0;
          // overwrite UNIVAC output as client has no session token to process it yet
          output += "ST" + session;
          var refresh=false;
        }
        column = plugs.length;
        break;        

      case 'VA':
        if (tape) { runtape(tape); tape = ""; }
        let vaAvatar = "";
        let vaTermIdx = plugs.indexOf('--', column);
        if (vaTermIdx !== -1) {
          vaAvatar = plugs.slice(column, vaTermIdx);
          column = vaTermIdx + 2;
        } else {
          vaAvatar = plugs.slice(column);
          column = plugs.length;
        }

        if (!player.item || player.item === "") break; 
        if (vaAvatar !== player.avatar) { runtape("Va" + vaAvatar + "--"); }
        break;                

      case 'OO':
        var refresh=false;
        column = plugs.length; 
        break;        
    }
  }

  if (tape) { runtape(tape); tape=""; }
  
  if (session) { playerIndex.set(session, player); }

  if (refresh) {
    let list = fileList(drive, 'w/' + player.map, null, session);
    let items = [];
    if (list.success && list.listing) {
      let files = list.listing.split(' ');
      files.forEach(f => {
        if (f.length > 1) { if (f.length !== 6) { items.push(f); }}
      });
    }
    let numericZ = parseInt(player.z, 10) || 0;
    let z = numericZ < 0 ? "00" : (numericZ < 10 ? "0" + numericZ : String(numericZ));

    let pItemId = player.item ? player.item.substring(0, 2) : "Za";
    let pPubId = player.pubId ? player.pubId : "0000";
    if (pPubId.length < 4) pPubId = pPubId.padEnd(4, '0');
    
    output = "PI" + pItemId + z + pPubId + output;
    output += "RF" + player.map + z + items.join('~');
  }
  return respondRetro(stacker, output, session);
}

// ── HTTP server ───────────────────────────────────────────────────────────────

var server = http.createServer(function (req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Session-Token');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  var reqUrl = new URL(req.url, `http://${req.headers.host}`);
  var reqPathname = reqUrl.pathname;

  if ((reqPathname === '/qandyland.js') && req.method === 'POST') {
  readBody(req).then(function (bodyText) {
    var command, drive, session;

    if (req.headers['content-type'] === 'application/x-www-form-urlencoded') {
      var params = new URLSearchParams(bodyText);
      command = params.get('c');
      drive   = params.get('d');
      session = params.get('s');
    } else {
      // Fallback for your original text/plain logic
      command = bodyText;
      drive   = reqUrl.searchParams.get('d');
      session = getSession(req);
    }

    if (session && playerIndex.has(session)) {
      var cachedProfile = playerIndex.get(session);
      if (cachedProfile && cachedProfile.drive) {
        drive = cachedProfile.drive;
      }
    }

    plugboard(req, res, command, drive, session);
    
  }).catch(err => {
    console.error("HTTP 500 ERROR:", err.stack || err); 
    res.writeHead(500);
    res.end("Server Error");
  });
  return;
}

  var pathname = path.normalize(decodeURIComponent(reqUrl.pathname).replace(/\0/g, ''));
  if (pathname === '/') pathname = '/index.htm';
  var filePath = path.join(__dirname, pathname);
  var realBase = fs.realpathSync(__dirname);
  try {
    var resolvedPath = fs.realpathSync(filePath);
    if (!resolvedPath.startsWith(realBase) || pathname.includes('.sys!')) return serve404(res);
    fs.stat(resolvedPath, function(err, stat) {
      if (err || !stat.isFile()) return serve404(res);
      var MIME = { '.html': 'text/html', '.htm': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.txt': 'text/plain', '.png': 'image/png' };
      res.writeHead(200, { 'Content-Type': MIME[path.extname(resolvedPath).toLowerCase()] || 'application/octet-stream' });
      fs.createReadStream(resolvedPath).pipe(res);
    });
  } catch (e) { serve404(res); }
});

// ── Server console (stdin) command processing ─────────────────────────────────

if (process.stdin.isTTY) {
  var readline = require('readline');

  var _serverMountedDrive = null;
  var _serverCwd = '/';

  // Initialize the readline interface
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'qandyland.js '
  });

  // Display the initial prompt
  rl.prompt();

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

  rl.on('line', function (line) {
    var trimmed = line.trim();
    if (!trimmed) {
      rl.prompt();
      return;
    }

    var allTokens = parseQuotedArgs(trimmed);
    var cmd = (allTokens[0] || '').toLowerCase();
    var arg = allTokens.slice(1).join(' ');
    var name = arg;


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
          var storage = drive.storage;
          var dirTokens = [];
          var fileEntries = [];
          storage.forEach(function(val, key) {
            if (!key) return;
            if (key.charAt(0) === '<') {
              dirTokens.push({ key: key, val: val });
            } else if (key !== MANIFEST_KEY) {
              fileEntries.push({ key: key, val: val });
            }
          });

          process.stdout.write('\n' + '='.repeat(60) + '\n');
          process.stdout.write('DRIVE STORAGE DEBUG: ' + driveName + '\n');
          process.stdout.write('='.repeat(60) + '\n');
          process.stdout.write('Type: memory-only\n');
          process.stdout.write('Owner: ' + (drive.owner || 'none') + '\n');
          process.stdout.write('Created: ' + (drive.created || 'unknown') + '\n');
          process.stdout.write('Files: ' + stats.fileCount + ' (' + formatBytes(stats.totalSize) + ')\n');
          process.stdout.write('Directories: ' + dirTokens.length + '\n');
          process.stdout.write('Storage entries: ' + storage.size + '\n');
          process.stdout.write('\n');

          if (dirTokens.length > 0) {
            process.stdout.write('DIRECTORIES (' + dirTokens.length + '):\n');
            for (var i = 0; i < dirTokens.length; i++) {
              var dtName = dirTokens[i].key || '';
              var dtTrunc = dtName.length > 50 ? dtName.substring(0, 47) + '...' : dtName;
              process.stdout.write('  ' + dtTrunc + '\n');
            }
            process.stdout.write('\n');
          }

          if (fileEntries.length > 0) {
            process.stdout.write('FILES (' + fileEntries.length + '):\n');
            for (var j = 0; j < fileEntries.length; j++) {
              var fkey = fileEntries[j].key;
              var fval = fileEntries[j].val || '';
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

        case 'drives': {
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
          if (!name) { process.stdout.write('Usage: mount <drive>\n'); return; }
          var n = normName(name);
          if (!drives[n]) { process.stdout.write('Error: drive "' + n + '" not found.\n'); return; }
          _serverMountedDrive = n;
          _serverCwd = '/';
          process.stdout.write('Mounted: server://' + n + '/\n');
          break;

        case 'unmount':
          if (_serverMountedDrive) {
            process.stdout.write('Unmounted: server://' + _serverMountedDrive + '/\n');
            _serverMountedDrive = null;
            _serverCwd = '/';
          } else {
            process.stdout.write('No drive is currently mounted.\n');
          }
          break;

        case 'dir':
          if (!_serverMountedDrive) { process.stdout.write('No drive mounted\n'); return; }
          var drive = drives[_serverMountedDrive];
          var dir   = (_serverCwd || '/').replace(/^\//, '').replace(/\/$/, '');
          process.stdout.write('Directory of server://' + _serverMountedDrive + (_serverCwd || '/') + '\n\n');
          // Subdirectories from storage tokens
          var dirPrefix = dir ? (dir + '/') : '';
          var storage = drive.storage;
          storage.forEach(function(val, dk) {
            if (dk.charAt(0) !== '<') return;
            var inner = dk.substring(1, dk.length - 1);
            if (inner.indexOf(dirPrefix) !== 0) return;
            var rel = inner.substring(dirPrefix.length);
            if (!rel || rel.indexOf('/') >= 0) return;
            process.stdout.write('  <DIR>  ' + rel + '\n');
          });
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
          break;

        case 'ls':
          if (!_serverMountedDrive) { process.stdout.write('No drive mounted\n'); return; }
          var drive   = drives[_serverMountedDrive];
          var dir     = (_serverCwd || '/').replace(/^\//, '').replace(/\/$/, '');
          var lsPrefix = dir ? (dir + '/') : '';
          // Subdirectories from storage tokens
          var storage = drive.storage;
          storage.forEach(function(val, lk) {
            if (lk.charAt(0) !== '<') return;
            var inner = lk.substring(1, lk.length - 1);
            if (inner.indexOf(lsPrefix) !== 0) return;
            var rel = inner.substring(lsPrefix.length);
            if (!rel || rel.indexOf('/') >= 0) return;
            process.stdout.write(rel + '/\n');
          });
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
          break;

        case 'exists': {
          if (!arg) { 
            process.stdout.write('Usage: exists <filename>\n'); 
            break; 
          }
          if (!_serverMountedDrive) { 
            process.stdout.write('No drive mounted\n'); 
            break; 
          }
          
          // Call helper
          var res = fileExists(_serverMountedDrive, _serverCwd, arg);
          
          // Format output for terminal operator
          if (res.exists) {
            process.stdout.write('TRUE (File "' + res.path + '" exists)\n');
          } else {
            process.stdout.write('FALSE (File not found)\n');
          }
          break;
        }

        case 'search': {
          if (!arg) { 
            process.stdout.write('Usage: search <pattern>\n'); 
            break; 
          }
          if (!_serverMountedDrive) { 
            process.stdout.write('No drive mounted\n'); 
            break; 
          }

          // Call helper
          var res = fileSearch(_serverMountedDrive, arg);
          
          if (!res.success) {
            process.stdout.write('Error: ' + res.error + '\n');
            break;
          }

          // Format output for terminal operator
          if (res.results.length === 0) {
            process.stdout.write('No matching files found.\n');
          } else {
            process.stdout.write('Search results for "' + arg + '":\n');
            for (var i = 0; i < res.results.length; i++) {
              var r = res.results[i];
              process.stdout.write('  ' + r.name.padEnd(30) + ' | ' + String(r.size).padStart(6) + ' bytes | ' + r.timestamp + '\n');
            }
            process.stdout.write('\nTotal: ' + res.results.length + ' match(es) found.\n');
          }
          break;
        }


        case 'mkdir':
           if (!name) { process.stdout.write('Usage: mkdir <name>\n'); return; }
           if (!_serverMountedDrive) { process.stdout.write('No drive mounted. Use: mount <drive>\n'); return; }
           var mkr = dirMake(_serverMountedDrive, _serverCwd, name, 'console');
           if (mkr.success) {
             process.stdout.write('Created directory: ' + name + '/\n');
           } else {
             process.stdout.write('Error: ' + mkr.error + '\n');
           }
          break;

        case 'cd':
        case 'chdir':
          if (!_serverMountedDrive) { process.stdout.write('No drive mounted. Use: mount <drive>\n'); return; }
          var cdr = dirChange(_serverMountedDrive, _serverCwd, name || '/', 'console');
          if (cdr.success) {
            _serverCwd = cdr.cwd;
            process.stdout.write(cdr.result + '\n');
          } else {
            process.stdout.write('Error: ' + cdr.error + '\n');
          }
          break;

        case 'rmdir':
          if (!name) { process.stdout.write('Usage: rmdir <name>\n'); return; }
          if (!_serverMountedDrive) { process.stdout.write('No drive mounted. Use: mount <drive>\n'); return; }
          var rmr = dirRemove(_serverMountedDrive, _serverCwd, name, 'console');
          if (rmr.success) {
            process.stdout.write('Removed directory: ' + name + '/\n');
          } else {
            process.stdout.write('Error: ' + rmr.error + '\n');
          }
          break;

        case 'rename':
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
          break;

        case 'exam':
        case 'examine':
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
          process.stdout.write('Owner Token: ' + (exEntry.session || '(none)') + ' (' + (exEntry.owner || '(none)') + ')\n');
          break;

        case 'type':
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
          process.stdout.write(safe);
          if (safe.length > 0 && safe[safe.length - 1] !== '\n') process.stdout.write('\n');
          if (truncated) {
            process.stdout.write('(Output truncated at ' + TYPE_MAX_BYTES + ' bytes. Full size: ' + size + ' bytes)\n');
          }
          break;

        case 'delete':
          if (_serverMountedDrive) {
            if (!arg) { process.stdout.write('Usage: delete <filename>\n'); break; }
              if (!name) { process.stdout.write('Usage: delete <filename>\n'); return; }
              var fdr = fileDelete(_serverMountedDrive, _serverCwd, name, 'console');
              if (fdr.success) {
                process.stdout.write('Deleted: ' + name + '\n');
              } else {
                process.stdout.write('Error: ' + fdr.error + '\n');
              }
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
            '  drives               - List all drives\n' +
            '  delete <name>        - Delete a drive (no drive mounted) or a file (drive mounted)\n' +
            '\nNavigation commands (mount a drive first):\n' +
            '  mount <drive>        - Mount a drive for navigation\n' +
            '  unmount <drive>      - Unmount current drive\n' +
            '  dir                  - Directory listing with full metadata\n' +
            '  ls                   - Simple file/directory listing\n' +
            '  cd <name>            - Change directory (.. = parent, / = root)\n' +
            '  mkdir <name>         - Create a directory\n' +
            '  rmdir <name>         - Remove an empty directory\n' +
            '  rename <old>=<new>   - Rename a file\n' +
            '  exam <name>          - Examine file metadata in detail\n' +
            '  type <name>          - Display file contents safely (strips control chars)\n' +
            '  exit                 - shutdown the server (can also use shutdown or quit)\n' +
            '  help                 - Show this help\n\n'
            
          );
          break;

        case 'exit':
        case 'shutdown':
        case 'quit':
          process.stdout.write('\nGracefully shutting down Qandyland Server...\n');
          server.close(function() {
            process.stdout.write('All connections closed. HTTP server stopped.\n\n');
            process.exit(0);
          });
          setTimeout(function() {
            process.stdout.write('Forcing shutdown...\n');
            process.exit(0);
          }, 3000);
          break;

        default:
          process.stdout.write('Unknown command "' + cmd + '". Type "help" for commands.\n');
    }
    rl.prompt();
  }).on('close', function () {
    process.exit(0);
  });
}

// ── Server initialization ─────────────────────────────────────────────────────

function _proceedWithStartup() {

  var driveList = ['capflag.gfx']; // HARDCODED: Add all desired initial drive names here.
  
  for (var i = 0; i < driveList.length; i++) {
    var dn = normName(driveList[i]);
    console.log(`Processing drive: ${dn}`);
    if (dn && validateName(dn).ok) {
      if (drives[dn]) { 
        console.warn(`Warning: Drive "${dn}" already exists during startup.`);
        continue;
      }
      
      drives[dn] = {
        storage:     new Map(),     // Map<key, value> for O(1) access
        manifestMap: new Map(), // Initialize empty manifest map
        owner:       'console', // Default owner for drives from config
        created:     timestamp(),
        fileCount:   0,
        totalSize:   0
      };

      // Load initial manifest from storage IF IT EXISTS AND IS NOT EMPTY.
      // This is crucial for pre-existing drive data from a config (like capflag.gfx)
      // that might have been loaded from a previous run or a fixed file.
      // If there's no persistence, the initial _dir.sys! will be empty.
      var initialManifestText = _storageGet(drives[dn].storage, MANIFEST_KEY);
      var initialEntries = _parseManifestText(initialManifestText);
      _saveManifest(dn, initialEntries); // Populates manifestMap & updates _dir.sys! (debounced)

      if (dn.endsWith('.gfx')) {
        console.log(`\n  Initiating Big Bang for world drive '${dn}' using file '${sysopGfx}'...`);
        var initResult = bigbang(dn, 'system'); // 'system' session for bigbang operation
        if (initResult.success) {
          console.log(`  \u2713 World '${dn}' initialized.\n`);
        } else {
          console.error(`  \u2717 Failed to initialize world '${dn}': ${initResult.error}`);
        }
      }
    }
  }
}

(function _initializeServer() {
  //_applyServerConfig();
  _proceedWithStartup();

  // Start the HTTP server
  server.listen(PORT, function () {
    // Optional: Retrieve the local address or a public IP if known
    var publicIP = '127.0.0.1'; 
    displayStartupBanner(publicIP, null, null);
    
    // If running in terminal, display the prompt
    if (process.stdin.isTTY) {
      process.stdout.write('qandyland.js ');
    }
  });
})();

// Graceful shutdown: remove this server from registry
process.on('SIGINT', function () {
  process.exit(0);
});

process.on('SIGTERM', function () {
  process.exit(0);
});

process.on('uncaughtException', function(err) {
  console.error("UNCAUGHT EXCEPTION:", err.stack || err);
});

process.on('unhandledRejection', function(reason, p) {
  console.error("UNHANDLED PROMISE REJECTION:", reason.stack || reason);
});
