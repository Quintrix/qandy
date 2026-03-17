
var DOS = true;
var DEVICE = 'none';

(function (global) {
  'use strict';

  // ── Constants ────────────────────────────────────────────────────────────
  var LOCAL_PREFIX = 'qandy:file:';
  var MANIFEST_KEY = '_dir.sys!';          // canonical key for the manifest file
  var MAX_NAME_BYTES = 255;
  var VALID_NAME_RE = /^(?!\.)[A-Za-z0-9 \-_.()+=]+$/;
  var SUPPORTED_DEVICES = ['local', 'echo', 'harddrive', 'none'];
  var SEP = '/';
  var ROOT_SEG = '/';
  var _cwd = ROOT_SEG;

  // ── Internal state ───────────────────────────────────────────────────────
  var _echoStore = Object.create(null);
  var _harddriveHandle = null;
  var _clipboard = null; // { name, content }

  // ── Utility ──────────────────────────────────────────────────────────────
  function _utf8len(s) {
    try { return (new TextEncoder()).encode(String(s)).length; } catch (e) { return String(s).length; }
  }

  function _normName(n) {
    return (typeof n === 'string') ? n.trim() : String(n == null ? '' : n).trim();
  }

  /** Strip leading _ and trailing ! to get the plain base name. */
  function _baseName(name) {
    var n = _normName(name);
    if (n.charAt(0) === '_') n = n.substring(1);
    if (n.length > 0 && n.charAt(n.length - 1) === '!') n = n.substring(0, n.length - 1);
    return n;
  }

  function _isHidden(canonicalName) {
    return typeof canonicalName === 'string' && canonicalName.charAt(0) === '_';
  }

  function _isProtected(canonicalName) {
    return typeof canonicalName === 'string' && canonicalName.length > 0 &&
           canonicalName.charAt(canonicalName.length - 1) === '!';
  }

  /** Validate the base (flag-stripped) filename. */
  function _validateBase(name) {
    var n = _normName(name);
    if (!n) return { ok: false, reason: 'empty filename' };
    if (!VALID_NAME_RE.test(n)) return { ok: false, reason: 'invalid characters in filename' };
    if (_utf8len(n) > MAX_NAME_BYTES) return { ok: false, reason: 'filename exceeds 255 bytes' };
    return { ok: true, name: n };
  }

  /** yyyymmddhhmmss from a Date object. */
  function _tsFromDate(d) {
    var p = function (n) { return String(n).padStart(2, '0'); };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
              + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  /** yyyymmddhhmmss timestamp using the system clock. */
  function _timestamp() {
    return _tsFromDate(new Date());
  }


  function getCwdSync() { return _cwd || ROOT_SEG; }
  function setCwdSync(p) {
    _cwd = (typeof p === 'string' && p.length) ? String(p) : ROOT_SEG;
    // optional: persist to localStorage if you want cross-refresh persistence
    //try { localStorage.setItem(LOCAL_PREFIX + 'cwd', _cwd); } catch (e) {}
  }
  function resolveDirPath(name, cwd) {
    if (typeof name !== 'string') return null;
    name = name.trim();
    if (!name) return null;
    if (name === '.' || name === './') return (cwd || getCwdSync()) || ROOT_SEG;
    var base=(cwd && cwd.length) ? cwd : ROOT_SEG;
    if (name.charAt(0) === SEP) { base = ''; }
    var parts=(base+SEP+name).split(SEP).filter(Boolean);
    var out = [];
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i];
      if (seg === '.') continue;
      if (seg === '..') { if (out.length) out.pop(); continue; }
      out.push(seg);
    }
    return out.length ? SEP + out.join(SEP) : ROOT_SEG;
  }

  // compatibility shim to expose the internal manifest loader if caller expects loadManifest()
  // replace old calls with the new one and remove this
  function loadManifest() { return typeof _loadManifest === 'function' ? _loadManifest() : []; }

  // Check if manifest contains a directory token for the given normalized target path
  function manifestHasDir(manifest, target) {
    if (!Array.isArray(manifest)) manifest = [];
    var token = '<' + target + '>';
    for (var i = 0; i < manifest.length; i++) {
      var e = manifest[i];
      if (!e || typeof e.name !== 'string') continue;
      if (e.name === token) return true;
    }
    return false;
  }

  // Helper function to get directory path from a file's canonical name
  function _getFileDir(canonicalName) {
    // Files are stored as-is: e.g., "/system/file.txt" or just "file.txt"
    var lastSep = canonicalName.lastIndexOf(SEP);
    return lastSep > 0 ? canonicalName.substring(0, lastSep) : ROOT_SEG;
  }

  // ── System-file detection ─────────────────────────────────────────────────
  /**
   * Classify user-supplied name.
   * Returns 'dir.txt' | 'dir.sys' | 'normal'
   */
  function _classify(userInput) {
    var base = _baseName(_normName(userInput)).toLowerCase();
    if (base === 'dir.txt') return 'dir.txt';
    if (base === 'dir.sys') return 'dir.sys';
    return 'normal';
  }

  // ── Manifest (always localStorage) ───────────────────────────────────────
  function _readManifestRaw() {
    try {
      return localStorage.getItem(LOCAL_PREFIX + MANIFEST_KEY) || '';
    } catch (e) { return ''; }
  }

  /**
   * Parse manifest text into array of { name, size, timestamp }.
   * Skips the _dir.sys! self-entry (handled separately).
   */
  function _parseManifest(raw) {
    var manifest = [];
    if (!raw) return manifest;
    var lines = raw.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var parts = line.split('|');
      if (parts.length < 3) continue;
      var name = parts[0].trim();
      var size = parseInt(parts[1], 10) || 0;
      var ts = parts[2].trim();
      if (name) manifest.push({ name: name, size: size, timestamp: ts });
    }
    return manifest;
  }

  function _loadManifest() {
    return _parseManifest(_readManifestRaw());
  }

  /**
   * Serialise manifest array to text, append self-entry, and write to localStorage.
   * Returns true on success or 'Error: Disk Full'.
   */
  function _saveManifest(manifest) {
    var ts = _timestamp();

    // Build body lines (excluding any stale self-entry)
    var lines = [];
    for (var i = 0; i < manifest.length; i++) {
      var e = manifest[i];
      if (e.name === MANIFEST_KEY) continue; // remove old self-entry
      lines.push(e.name + '|' + e.size + '|' + e.timestamp);
    }

    // Append self-entry: compute size of the full string including itself
    var bodyText = lines.length ? lines.join('\n') + '\n' : '';
    // placeholder to compute approximate size
    var selfLine = MANIFEST_KEY + '|0|' + ts;
    var full = bodyText + selfLine;
    var manifestSize = _utf8len(full);
    // replace with actual size
    selfLine = MANIFEST_KEY + '|' + manifestSize + '|' + ts;
    full = bodyText + selfLine;

    // Update self-entry size with precise value (one iteration is sufficient)
    var finalSize = _utf8len(full);
    if (finalSize !== manifestSize) {
      selfLine = MANIFEST_KEY + '|' + finalSize + '|' + ts;
      full = bodyText + selfLine;
    }

    try {
      localStorage.setItem(LOCAL_PREFIX + MANIFEST_KEY, full);
      return true;
    } catch (e) {
      return 'Error: Disk Full';
    }
  }

  /**
   * Find manifest entry whose base name matches the user-supplied name.
   * Returns { index, entry } or null.
   */
  function _findEntry(manifest, userInput) {
    var base = _baseName(_normName(userInput)).toLowerCase();
    for (var i = 0; i < manifest.length; i++) {
      if (_baseName(manifest[i].name).toLowerCase() === base) {
        return { index: i, entry: manifest[i] };
      }
    }
    return null;
  }

  // ── Device-aware directory listing ────────────────────────────────────────
  /**
   * Return all file entries for the given device as array of {name, size, timestamp}.
   * For 'local':     reads from localStorage manifest.
   * For 'echo':      reads from in-memory _echoStore.
   * For 'harddrive': iterates the directory via File System Access API.
   * For 'none':      returns [].
   */
  async function _dirEntries(device) {
    switch (device) {
      case 'local':
        return _loadManifest();
      case 'echo': {
        var entries = [];
        var ts = _timestamp();
        var keys = Object.keys(_echoStore);
        for (var i = 0; i < keys.length; i++) {
          var k = keys[i];
          entries.push({ name: k, size: _utf8len(_echoStore[k]), timestamp: ts });
        }
        return entries;
      }
      case 'harddrive': {
        if (!_harddriveHandle) return [];
        var hdEntries = [];
        try {
          for await (var [hdName, hdHandle] of _harddriveHandle) {
            if (hdHandle.kind !== 'file') continue;
            try {
              var hdFile = await hdHandle.getFile();
              hdEntries.push({
                name: hdName,
                size: hdFile.size,
                timestamp: _tsFromDate(new Date(hdFile.lastModified))
              });
            } catch (e) {}
          }
        } catch (e) {}
        return hdEntries;
      }
      default:
        return [];
    }
  }

  // ── Storage backends ──────────────────────────────────────────────────────

  // local ─────────────────────────────────────────────────────────────────
  function _localLoad(canonicalName) {
    try {
      var v = localStorage.getItem(LOCAL_PREFIX + canonicalName);
      return v === null ? null : String(v);
    } catch (e) { return null; }
  }

  function _localSave(canonicalName, content) {
    try {
      localStorage.setItem(LOCAL_PREFIX + canonicalName,
                           String(content == null ? '' : content));
      return true;
    } catch (e) { return 'Error: Disk Full'; }
  }

  function _localDelete(canonicalName) {
    try { localStorage.removeItem(LOCAL_PREFIX + canonicalName); } catch (e) {}
  }

  // harddrive ─────────────────────────────────────────────────────────────
  async function _ensureHarddrive() {
    if (_harddriveHandle) return true;
    if (typeof window === 'undefined' ||
        typeof window.showDirectoryPicker !== 'function') return false;
    try {
      _harddriveHandle = await window.showDirectoryPicker();
      return true;
    } catch (e) { _harddriveHandle = null; return false; }
  }

  async function _hdLoad(name) {
    if (!(await _ensureHarddrive())) return null;
    try {
      var fh = await _harddriveHandle.getFileHandle(name, { create: false });
      var file = await fh.getFile();
      return await file.text();
    } catch (e) { return null; }
  }

  async function _hdSave(name, content) {
    if (!(await _ensureHarddrive())) return false;
    try {
      var fh = await _harddriveHandle.getFileHandle(name, { create: true });
      var w = await fh.createWritable();
      await w.write(String(content == null ? '' : content));
      await w.close();
      return true;
    } catch (e) { return false; }
  }

  async function _hdDelete(name) {
    if (!_harddriveHandle) return;
    try { await _harddriveHandle.removeEntry(name); } catch (e) {}
  }

  // Dispatch ──────────────────────────────────────────────────────────────
  async function _load(device, canonicalName) {
    switch (device) {
      case 'local':      return _localLoad(canonicalName);
      case 'echo':       return Object.prototype.hasOwnProperty.call(_echoStore, canonicalName) ? _echoStore[canonicalName] : null;
      case 'harddrive':  return await _hdLoad(canonicalName);
      case 'none':       return null;
      default:           return null;
    }
  }

  async function _save(device, canonicalName, content) {
    switch (device) {
      case 'local':     return _localSave(canonicalName, content);
      case 'echo':      _echoStore[canonicalName] = String(content == null ? '' : content); return true;
      case 'harddrive': return await _hdSave(canonicalName, content);
      case 'none':      return true; // silently discard
      default:          return false;
    }
  }

  async function _del(device, canonicalName) {
    switch (device) {
      case 'local':     _localDelete(canonicalName); break;
      case 'echo':      delete _echoStore[canonicalName]; break;
      case 'harddrive': await _hdDelete(canonicalName); break;
    }
  }

  // ── File-picker / save-as helpers ─────────────────────────────────────────
  async function _pickFile() {
    if (typeof window !== 'undefined' &&
        typeof window.showOpenFilePicker === 'function') {
      try {
        var handles = await window.showOpenFilePicker({ multiple: false });
        if (!handles || !handles.length) return null;
        var fh = handles[0];
        var f = await fh.getFile();
        return { name: f.name, text: await f.text() };
      } catch (e) { return null; }
    }
    // Fallback: hidden <input type="file">
    return new Promise(function (resolve) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(inp);
      inp.onchange = function () {
        var f = inp.files && inp.files[0];
        if (!f) { document.body.removeChild(inp); return resolve(null); }
        var reader = new FileReader();
        reader.onload = function (ev) {
          document.body.removeChild(inp);
          resolve({ name: f.name, text: ev.target.result });
        };
        reader.onerror = function () { document.body.removeChild(inp); resolve(null); };
        reader.readAsText(f);
      };
      inp.click();
    });
  }

  async function _saveFileAs(name, content) {
    if (typeof window !== 'undefined' &&
        typeof window.showSaveFilePicker === 'function') {
      try {
        var handle = await window.showSaveFilePicker({ suggestedName: name });
        var w = await handle.createWritable();
        await w.write(String(content == null ? '' : content));
        await w.close();
        return true;
      } catch (e) { /* fall through to anchor download */ }
    }
    var blob = new Blob([String(content == null ? '' : content)],
                       { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    return true;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  global.DOS = true;
  global.DEVICE = global.DEVICE || 'none';

  // dosMount(device)
  global.dosMount = async function (device) {
    if (!device || typeof device !== 'string') return global.DEVICE;
    device = device.trim();
    if (SUPPORTED_DEVICES.indexOf(device) === -1) return 'Error: unsupported device: ' + device;
    if (device === 'harddrive') {
      var ok = await _ensureHarddrive();
      if (!ok) return 'Error: harddrive not available';
    }
    global.DEVICE = device;
    return device;
  };

  // dosFormat(data)
  // No data → export JSON archive of current device.
  // data provided → import JSON archive into current device (clears first).
  global.dosFormat = async function (data) {
    var dev = global.DEVICE;

    if (typeof data === 'undefined') {
      // Export
      var manifest = _loadManifest();
      var files = {};
      for (var i = 0; i < manifest.length; i++) {
        var e = manifest[i];
        if (e.name === MANIFEST_KEY) continue;
        try { files[e.name] = await _load(dev, e.name); } catch (ex) { files[e.name] = null; }
      }
      return JSON.stringify({ device: dev, created: new Date().toISOString(), files: files });
    }

    // Import
    var obj = data;
    if (typeof data === 'string') {
      try { obj = JSON.parse(data); } catch (e) { return 'Error: invalid archive format'; }
    }
    if (!obj || typeof obj !== 'object' || !obj.files) return 'Error: invalid archive';

    // Clear current device files tracked in manifest
    var curManifest = _loadManifest();
    for (var j = 0; j < curManifest.length; j++) {
      if (curManifest[j].name !== MANIFEST_KEY) await _del(dev, curManifest[j].name);
    }
    if (dev === 'echo') _echoStore = Object.create(null);

    // Write new files
    var newManifest = [];
    var keys = Object.keys(obj.files);
    for (var k = 0; k < keys.length; k++) {
      var fname = keys[k];
      if (fname === MANIFEST_KEY) continue;
      var fbase = _baseName(fname);
      var fv = _validateBase(fbase);
      if (!fv.ok) continue;
      var fcontent = String(obj.files[fname] == null ? '' : obj.files[fname]);
      var saveRes = await _save(dev, fname, fcontent);
      if (saveRes === 'Error: Disk Full') return 'Error: Disk Full';
      newManifest.push({ name: fname, size: _utf8len(fcontent), timestamp: _timestamp() });
    }
    var mres = _saveManifest(newManifest);
    if (mres === 'Error: Disk Full') return 'Error: Disk Full';
    return true;
  };

  // dosSave(file, data)
  // ">file" prefix appends; write-protected and system files rejected.
  // dosSave(file, data) — save file TO CURRENT DIRECTORY
  global.dosSave = async function (file, data) {
    var fname = _normName(file);
    var append = false;
    if (fname.charAt(0) === '>') { append = true; fname = fname.substring(1).trimStart(); }
    var cls = _classify(fname);
    if (cls !== 'normal') return 'Error: read only file';
    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return 'Error: ' + fv.reason;
    var dev = global.DEVICE;
    var manifest = _loadManifest();
    var cwd = getCwdSync();
    // Find file in current directory only
    var found = null;
    for (var i = 0; i < manifest.length; i++) {
      var e = manifest[i];
      if (e.name.charAt(0) === '<') continue; // Skip directories
      if (_baseName(e.name).toLowerCase() === fbase.toLowerCase()) {
        var fileDir = _getFileDir(e.name);
        if (fileDir === cwd) {
          found = { index: i, entry: e };
          break;
        }
      }
    }
    if (found && _isProtected(found.entry.name)) return 'Error: read only file';
    // Determine canonical name (with directory path)
    var canonical;
    if (found) {
      canonical = found.entry.name;
    } else {
      // Create file in current directory
      var pathPrefix = cwd === ROOT_SEG ? '' : cwd + SEP;
      canonical = pathPrefix + (_isHidden(fname) ? '_' : '') + fbase + (_isProtected(fname) ? '!' : '');
    }
    var content = String(data == null ? '' : data);
    if (append && found) {
      var existing = await _load(dev, canonical);
      if (existing !== null) content = existing + content;
    }
    var res = await _save(dev, canonical, content);
    if (res === 'Error: Disk Full') return 'Error: Disk Full';
    if (res === false) return 'Error: write failed';
    var size = _utf8len(content);
    var ts = _timestamp();
    if (found) {
      found.entry.size = size;
      found.entry.timestamp = ts;
    } else {
      manifest.push({ name: canonical, size: size, timestamp: ts });
    }
    var mres = _saveManifest(manifest);
    if (mres === 'Error: Disk Full') return 'Error: Disk Full';
    return true;
  };
  
  // dosLoad(file)
  // "dir.txt" → visible filenames; "dir.sys" → manifest-format entries; otherwise normal file.
  // dosLoad(file) — load file FROM CURRENT DIRECTORY
  global.dosLoad = async function (file) {
    var fname = _normName(file);
    var cls = _classify(fname);

    if (cls === 'dir.txt') return global.dosList();
    if (cls === 'dir.sys') return global.dosDir();

    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return null;

    var dev = global.DEVICE;
    var manifest = _loadManifest();
    var cwd = getCwdSync();
  
    // Find file in current directory only
    var found = null;
    for (var i = 0; i < manifest.length; i++) {
      var e = manifest[i];
      if (e.name.charAt(0) === '<') continue; // Skip directories
      if (_baseName(e.name).toLowerCase() === fbase.toLowerCase()) {
        var fileDir = _getFileDir(e.name);
        if (fileDir === cwd) {
          found = { index: i, entry: e };
          break;
        }
      }
    }
    if (!found) return null;
    return await _load(dev, found.entry.name);
  };

  // dosCopy(file, dest)
  // Copies file into internal clipboard; if dest provided, also saves as dest.
  global.dosCopy = async function (file, dest) {
    var dev = global.DEVICE;
    var fname = _normName(file);

    if (_classify(fname) !== 'normal') return 'Error: cannot copy system file';
    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return 'Error: ' + fv.reason;

    var manifest = _loadManifest();
    var found = _findEntry(manifest, fname);
    if (!found) return 'Error: file not found';

    var content = await _load(dev, found.entry.name);
    if (content === null) return 'Error: file not found';

    _clipboard = { name: found.entry.name, content: content };

    if (typeof dest !== 'undefined' && dest !== null && String(dest).trim() !== '') {
      var dname = _normName(String(dest));
      if (_classify(dname) !== 'normal') return 'Error: read only file';
      var dbase = _baseName(dname);
      var dv = _validateBase(dbase);
      if (!dv.ok) return 'Error: invalid destination: ' + dv.reason;
      var destFound = _findEntry(manifest, dname);
      if (destFound) return 'Error: destination file already exists';
      var destCanonical = (_isHidden(dname) ? '_' : '') + dbase + (_isProtected(dname) ? '!' : '');
      var res = await _save(dev, destCanonical, content);
      if (res === 'Error: Disk Full') return 'Error: Disk Full';
      manifest.push({ name: destCanonical, size: _utf8len(content), timestamp: _timestamp() });
      var mres = _saveManifest(manifest);
      if (mres === 'Error: Disk Full') return 'Error: Disk Full';
    }

    return true;
  };

  // dosPaste(dest)
  // Pastes clipboard into dest. ">dest" appends; otherwise errors if dest exists.
  global.dosPaste = async function (dest) {
    var dev = global.DEVICE;
    var content = null;
    if (_clipboard && _clipboard.content !== undefined) {
      content = _clipboard.content;
    } else if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try { content = await navigator.clipboard.readText(); } catch (e) { return 'Error: clipboard read denied'; }
    }
    if (content === null || content === undefined) { return 'Error: clipboard empty'; }
    var append = false;
    var dname = _normName(String(dest));
    if (dname.charAt(0) === '>') { append = true; dname = dname.substring(1).trimStart(); }
    if (_classify(dname) !== 'normal') return 'Error: read only file';
    var dbase = _baseName(dname);
    var dv = _validateBase(dbase);
    if (!dv.ok) return 'Error: ' + dv.reason;
    var manifest = _loadManifest();
    var cwd = getCwdSync();
    // Find file in current directory only
    var destFound = null;
    for (var i = 0; i < manifest.length; i++) {
      var e = manifest[i];
      if (e.name.charAt(0) === '<') continue; // Skip directories
      if (_baseName(e.name).toLowerCase() === dbase.toLowerCase()) {
        var fileDir = _getFileDir(e.name);
        if (fileDir === cwd) {
          destFound = { index: i, entry: e };
          break;
        }
      }
    }
   if (destFound && _isProtected(destFound.entry.name)) return 'Error: read only file';
   // Determine canonical name (with directory path)
   var destCanonical;
   if (destFound) {
     destCanonical = destFound.entry.name;
   } else {
     // Create file in current directory
     var pathPrefix = cwd === ROOT_SEG ? '' : cwd + SEP;
     destCanonical = pathPrefix + (_isHidden(dname) ? '_' : '') + dbase + (_isProtected(dname) ? '!' : '');
   }
   if (append && destFound) {
     var existing = await _load(dev, destCanonical);
     if (existing !== null) content = existing + content;
   } else if (!append && destFound) {
     return 'Error: file already exists';
   }

   var res = await _save(dev, destCanonical, content);
   if (res === 'Error: Disk Full') return 'Error: Disk Full';
   var size = _utf8len(content);
   var ts = _timestamp();
   if (destFound) {
     destFound.entry.size = size;
     destFound.entry.timestamp = ts;
   } else {
     manifest.push({ name: destCanonical, size: size, timestamp: ts });
   }
   var mres = _saveManifest(manifest);
   if (mres === 'Error: Disk Full') return 'Error: Disk Full';
   return 'done';
  };

  // dosRename(file, dest) — rename file in CURRENT DIRECTORY
  global.dosRename = async function (file, dest) {
    var dev = global.DEVICE;
    var fname = _normName(file);
    var dname = _normName(dest);
    if (_classify(fname) !== 'normal') return 'Error: read only file';
    if (_classify(dname) !== 'normal') return 'Error: read only file';
    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return 'Error: ' + fv.reason;
    var dbase = _baseName(dname);
    var dv = _validateBase(dbase);
    if (!dv.ok) return 'Error: invalid destination: ' + dv.reason;
    var manifest = _loadManifest();
    var cwd = getCwdSync();
    // Find source file in current directory only
    var srcFound = null;
    for (var i = 0; i < manifest.length; i++) {
      var e = manifest[i];
      if (e.name.charAt(0) === '<') continue; // Skip directories
      if (_baseName(e.name).toLowerCase() === fbase.toLowerCase()) {
        var fileDir = _getFileDir(e.name);
        if (fileDir === cwd) {
          srcFound = { index: i, entry: e };
          break;
        }
      }
    }
    if (!srcFound) return 'Error: file not found';
    if (_isProtected(srcFound.entry.name)) return 'Error: read only file';
    // Check if destination already exists in current directory
    var destFound = null;
    for (var j = 0; j < manifest.length; j++) {
      var e = manifest[j];
      if (e.name.charAt(0) === '<') continue; // Skip directories
      if (_baseName(e.name).toLowerCase() === dbase.toLowerCase()) {
        var fileDir = _getFileDir(e.name);
        if (fileDir === cwd) {
          destFound = { index: j, entry: e };
          break;
        }
      }
    }
    if (destFound) return 'Error: destination file already exists';
    var content = await _load(dev, srcFound.entry.name);
    if (content === null) return 'Error: file not found';
    // Create destination canonical name with directory path
    var pathPrefix = cwd === ROOT_SEG ? '' : cwd + SEP;
    var destCanonical = pathPrefix + (_isHidden(dname) ? '_' : '') + dbase + (_isProtected(dname) ? '!' : '');
    var res = await _save(dev, destCanonical, content);
    if (res === 'Error: Disk Full') return 'Error: Disk Full';
    await _del(dev, srcFound.entry.name);
    srcFound.entry.name = destCanonical;
    srcFound.entry.timestamp = _timestamp();
    var mres = _saveManifest(manifest);
    if (mres === 'Error: Disk Full') return 'Error: Disk Full';
    return 'done';
  };

  // dosDelete(file) — delete file FROM CURRENT DIRECTORY
  global.dosDelete = async function (file) {
    var dev = global.DEVICE;
    var fname = _normName(file);
    if (_classify(fname) !== 'normal') return 'Error: read only file';
    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return 'Error: ' + fv.reason;
    var manifest = _loadManifest();
    var cwd = getCwdSync();
    // Find file in current directory only
    var found = null;
    for (var i = 0; i < manifest.length; i++) {
      var e = manifest[i];
      if (e.name.charAt(0) === '<') continue; // Skip directories
      if (_baseName(e.name).toLowerCase() === fbase.toLowerCase()) {
        var fileDir = _getFileDir(e.name);
        if (fileDir === cwd) {
          found = { index: i, entry: e };
          break;
        }
      }
    }
    if (!found) return 'Error: file not found';
    if (_isProtected(found.entry.name)) return 'Error: read only file';
    await _del(dev, found.entry.name);
    manifest.splice(found.index, 1);
    var mres = _saveManifest(manifest);
    if (mres === 'Error: Disk Full') return 'Error: Disk Full';
    return 'done';
  };

  // dosExists(file) — synchronous
  global.dosExists = function (file) {
    var fname = _normName(file);
    var cls = _classify(fname);
    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return false;
    var manifest = _loadManifest();
    if (!manifest || (Array.isArray(manifest) && manifest.length === 0)) { return false; }
    return _findEntry(manifest, fname) !== null;
  };  

  // dosDownload(file)
  global.dosDownload = async function (file) {
    var fname = _normName(file);
    var cls = _classify(fname);
    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return 'Error: ' + fv.reason;

    var content;
    if (cls === 'dir.txt') {
      content = await global.dosList();
    } else if (cls === 'dir.sys') {
      content = await global.dosDir();
    } else {
      var dev = global.DEVICE;
      var manifest = _loadManifest();
      var found = _findEntry(manifest, fname);
      if (!found) return 'Error: file not found';
      content = await _load(dev, found.entry.name);
      if (content === null) return 'Error: file not found';
    }

    await _saveFileAs(fbase, content);
    return true;
  };

  // dosUpload(optionalDest)
  global.dosUpload = async function (optionalDest) {
    var picked = await _pickFile();
    if (!picked) return null; // user cancelled

    var dname = (typeof optionalDest === 'string' && optionalDest.trim() !== '')
                ? _normName(optionalDest) : _normName(picked.name);

    if (_classify(dname) !== 'normal') return 'Error: read only file';
    var dbase = _baseName(dname);
    var dv = _validateBase(dbase);
    if (!dv.ok) return 'Error: invalid destination: ' + dv.reason;

    var dev = global.DEVICE;
    var manifest = _loadManifest();
    var found = _findEntry(manifest, dname);
    if (found && _isProtected(found.entry.name)) return 'Error: read only file';

    var destCanonical;
    if (found) {
      destCanonical = found.entry.name;
    } else {
      destCanonical = (_isHidden(dname) ? '_' : '') + dbase + (_isProtected(dname) ? '!' : '');
    }

    var content = String(picked.text);
    var res = await _save(dev, destCanonical, content);
    if (res === 'Error: Disk Full') return 'Error: Disk Full';

    var size = _utf8len(content);
    var ts = _timestamp();
    if (found) {
      found.entry.size = size;
      found.entry.timestamp = ts;
    } else {
      manifest.push({ name: destCanonical, size: size, timestamp: ts });
    }
    var mres = _saveManifest(manifest);
    if (mres === 'Error: Disk Full') return 'Error: Disk Full';
    return destCanonical;
  };

  // dosStash(file) — retrieve file from current device and force-save to localStorage
  global.dosStash = async function (file) {
    var dev = global.DEVICE;
    var fname = _normName(file);
    if (_classify(fname) !== 'normal') return 'Error: read only file';
    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return 'Error: ' + fv.reason;

    var manifest = _loadManifest();
    var found = _findEntry(manifest, fname);
    if (!found) return 'Error: file not found';

    var content = await _load(dev, found.entry.name);
    if (content === null) return 'Error: file not found';

    var res = _localSave(found.entry.name, content);
    if (res === 'Error: Disk Full') return 'Error: Disk Full';

    return true;
  };

  // dosRetrieve(file) — read file from localStorage regardless of current device
  global.dosRetrieve = async function (file) {
    var fname = _normName(file);
    if (_classify(fname) !== 'normal') return null;
    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return null;
    var manifest = _loadManifest();
    var found = _findEntry(manifest, fname);
    if (!found) return null;
    return _localLoad(found.entry.name);
  };

  // dosList() — visible (non-hidden) filenames for current device, newline-separated
  global.dosList = async function () {
    var cwd = getCwdSync();
    var manifest = _loadManifest();
    var out = [];
  
    for (var i = 0; i < manifest.length; i++) {
      var e = manifest[i];
      // Skip hidden files and directory tokens
      if (_isHidden(e.name) || e.name.charAt(0) === '<') continue;
    
      // Skip files not in current directory
      var fileDir = _getFileDir(e.name);
      if (fileDir !== cwd) continue;
    
      // Add the filename
      out.push(_baseName(e.name));
    }
  
    return out.join('\n');
  };

  // dosDir() — all entries in CURRENT DIRECTORY in manifest format
  global.dosDir = async function () {
  	 alert(cwd);
    var cwd = getCwdSync();
    var manifest = _loadManifest();
    var lines = [];
    // First list directories in current location
    for (var i = 0; i < manifest.length; i++) {
      var e = manifest[i];
      // Only show directory tokens for directories directly in cwd
      if (e.name.charAt(0) === '<' && e.name.charAt(e.name.length - 1) === '>') {
        var dirPath = e.name.substring(1, e.name.length - 1);
        // Check if this is a direct child of cwd
        var parentPath = dirPath.substring(0, dirPath.lastIndexOf(SEP));
        if (parentPath === cwd || (parentPath === '' && cwd === ROOT_SEG)) {
          lines.push(e.name + '|' + e.size + '|' + e.timestamp);
        }
      }
    }
  
    // Then list files in current directory
    for (var j = 0; j < manifest.length; j++) {
      var e = manifest[j];
      if (e.name.charAt(0) === '<') continue; // Skip directory tokens
      if (_isHidden(e.name)) continue; // Skip hidden files for dosDir
    
      var fileDir = _getFileDir(e.name);
      if (fileDir === cwd) {
        lines.push(e.name + '|' + e.size + '|' + e.timestamp);
      }
    }
  
    return lines.join('\n');
  };

  // dosShare(file) — copy file from current device into localStorage so guest can access it
  global.dosShare = async function (file) {
    var dev = global.DEVICE;
    if (dev === 'none') return 'Error: no device mounted';

    var fname = _normName(file);
    if (_classify(fname) !== 'normal') return 'Error: read only file';
    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return 'Error: ' + fv.reason;

    // Locate file on current device — try manifest first, then search device directly
    var canonical = null;
    var content = null;
    var manifest = _loadManifest();
    var found = _findEntry(manifest, fname);
    if (found) {
      canonical = found.entry.name;
      content = await _load(dev, canonical);
    }

    // Fallback: search device store directly by base name
    if (content === null) {
      if (dev === 'echo') {
        var eKeys = Object.keys(_echoStore);
        for (var i = 0; i < eKeys.length; i++) {
          var eBase = _baseName(eKeys[i]).toLowerCase();
          if (eBase === fbase.toLowerCase()) {
            canonical = eKeys[i];
            content = _echoStore[canonical];
            break;
          }
        }
      } else if (dev === 'harddrive' && _harddriveHandle) {
        var tries = [fbase, '_' + fbase, fbase + '!', '_' + fbase + '!'];
        for (var j = 0; j < tries.length; j++) {
          var loadedContent = await _hdLoad(tries[j]);
          if (loadedContent !== null) { canonical = tries[j]; content = loadedContent; break; }
        }
      } else if (dev === 'local') {
        try {
          var lsKeys = Object.keys(localStorage);
          for (var k = 0; k < lsKeys.length; k++) {
            var lsKey = lsKeys[k];
            if (lsKey.indexOf(LOCAL_PREFIX) !== 0) continue;
            var lsName = lsKey.substring(LOCAL_PREFIX.length);
            if (lsName === MANIFEST_KEY) continue;
            if (_baseName(lsName).toLowerCase() === fbase.toLowerCase()) {
              canonical = lsName;
              content = _localLoad(canonical);
              break;
            }
          }
        } catch (e) {}
      }
    }

    if (content === null) return 'Error: file not found';

    // Write to localStorage
    var saveRes = _localSave(canonical, content);
    if (saveRes === 'Error: Disk Full') return 'Error: Disk Full';

    // Update localStorage manifest
    var size = _utf8len(content);
    var ts = _timestamp();
    var lsManifest = _loadManifest();
    var lsFound = _findEntry(lsManifest, canonical);
    if (lsFound) {
      lsFound.entry.size = size;
      lsFound.entry.timestamp = ts;
    } else {
      lsManifest.push({ name: canonical, size: size, timestamp: ts });
    }
    var mres = _saveManifest(lsManifest);
    if (mres === 'Error: Disk Full') return 'Error: Disk Full';

    return true;
  };


  // localLoad(file) — load file from localStorage
  global.localLoad = async function (file) {
    var fname = _normName(file);
    var cls = _classify(fname);
    if (cls === 'dir.txt') return await global.localList();
    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return null;
    var manifest = _loadManifest();
    var found = _findEntry(manifest, fname);
    if (!found) return "Error: file not found";
    return _localLoad(found.entry.name);
  };

  // mkdir on localStorage
  global.localMkDir = async function (name) {
    try {
      if (typeof name !== 'string' || String(name).trim() === '') { return 'Error: invalid dir name'; }
      var cwd = getCwdSync();
      var target = resolveDirPath(name, cwd);
      if (!target) return 'Error: invalid dir name';
      // Normalize target (remove trailing separators beyond single root)
      if (target.length > 1) {
        while (target.length > 1 && target.slice(-SEP.length) === SEP) {
          target = target.slice(0, -SEP.length);
        }
      }
      var manifest = _loadManifest() || [];
      var dirToken = '<'+target+'>';
      // detect a file whose base (last segment) would conflict with this new dir
      var parts = target.split(SEP).filter(Boolean);
      var last = parts.length ? parts[parts.length - 1] : '';
      var fileConflict = manifest.some(function (e) {
        if (!e || !e.name) return false;
        // compare base name (strip flags) against last segment
        return _baseName(e.name).toLowerCase() === last.toLowerCase();
      });
      if (fileConflict) return 'Error: dir exists';
      var dirExists = manifest.some(function (e) { return e && e.name === dirToken; });
      if (dirExists) return 'Error: dir already exists';
      if (target !== ROOT_SEG) {
        if (parts.length === 0) return 'Error: invalid dir name';
        parts.pop(); // parent path tokens
        var parent = parts.length ? SEP + parts.join(SEP) : ROOT_SEG;
        var parentToken = '<' + parent + '>';
        var parentExists = (parent === ROOT_SEG) || manifest.some(function (e) { return e && e.name === parentToken; });
        if (!parentExists) return 'Error: parent dir not found';
      }
      manifest.push({ name: dirToken, size: 0, timestamp: _timestamp() });
      var saveRes = _saveManifest(manifest);
      if (saveRes === 'Error: Disk Full') { return 'Error: Disk Full'; }
      setCwdSync(target);
      return "done";
    } catch (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e));
    }
  };

  global.localChDir = async function (name) {
    return new Promise(function (resolve, reject) {
      try {
        var cwd = getCwdSync();
        if (!name || String(name).trim() === '' || name === '.' || name === './') {
          setCwdSync(ROOT_SEG);
          return resolve('done');  // ← resolve() instead of return
        }
        var target = resolveDirPath(name, cwd);
        if (!target) { 
          return resolve('Error: invalid dir name');  // ← resolve() instead of return
        }
        var man = _loadManifest(); 
        if (!manifestHasDir(man, target)) { 
          return resolve('Error: dir not found');  // ← resolve() instead of return
        }
        setCwdSync(target);
        return resolve('done');  // ← resolve() instead of return
      } catch (e) {
        return reject(new Error('Error: ' + (e && e.message ? e.message : String(e))));  // ← reject()
      }
    });
  };

  // rmdir from localStorage
  global.localRmDir = async function (name) {
    try {
      if (typeof name !== 'string' || String(name).trim() === '') { 
        return 'Error: invalid dir name'; 
      }
      var cwd = getCwdSync();
      var target = resolveDirPath(name, cwd);
      if (!target) return 'Error: invalid dir name';
      
      // Normalize target (remove trailing separators beyond single root)
      if (target.length > 1) {
        while (target.length > 1 && target.slice(-SEP.length) === SEP) {
          target = target.slice(0, -SEP.length);
        }
      }
    
      // Cannot remove root directory
      if (target === ROOT_SEG) return 'Error: cannot remove root directory';
    
      var manifest = _loadManifest() || [];
      var dirToken = '<' + target + '>';
    
      // Check if the directory exists
      var dirExists = manifest.some(function (e) { return e && e.name === dirToken; });
      if (!dirExists) return 'Error: dir not found';
    
      // Check if directory is empty by looking for any entries that start with target path
      var isDirEmpty = !manifest.some(function (e) {
        if (!e || !e.name) return false;
        // Check if this entry is inside the target directory
        // Both files and subdirectories will have names that start with target + SEP
        // or are dir tokens like <target/subdir>
        var entryPath = e.name;
        // Remove flags to get the base path
        var baseName = _baseName(entryPath);
      
        // Check if this is a file in the target directory
        if (entryPath.indexOf(target + SEP) === 0) return true;
      
        // Check if this is a subdirectory in the target directory
        if (entryPath.charAt(0) === '<' && entryPath.charAt(entryPath.length - 1) === '>') {
          var subDirPath = entryPath.substring(1, entryPath.length - 1);
          if (subDirPath.indexOf(target + SEP) === 0) return true;
        }
      
        return false;
      });
    
      if (!isDirEmpty) return 'Error: dir not empty';
    
      // Remove the directory token from manifest
      var dirIndex = manifest.findIndex(function (e) { return e && e.name === dirToken; });
      if (dirIndex !== -1) {
        manifest.splice(dirIndex, 1);
      }
    
      // Save the updated manifest
      var saveRes = _saveManifest(manifest);
      if (saveRes === 'Error: Disk Full') { return 'Error: Disk Full'; }
    
      // If we were in the removed directory, change to root
      if (cwd === target || cwd.indexOf(target + SEP) === 0) {
        setCwdSync(ROOT_SEG);
      }
    
      return 'done';
    } catch (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e));
    }
  };

  // localSave(file, text) — save text to localStorage
  // ">file" prefix appends; write-protected and system files rejected.
  // Returns: Promise resolving to true or error message string
  global.localSave = async function (file, text) {
    var fname = _normName(file);
    var append = false;
    if (fname.charAt(0) === '>') { append = true; fname = fname.substring(1).trimStart(); }

    var cls = _classify(fname);
    if (cls !== 'normal') return 'Error: read only file';

    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return 'Error: ' + fv.reason;

    var manifest = _loadManifest();
    var found = _findEntry(manifest, fname);
    if (found && _isProtected(found.entry.name)) return 'Error: read only file';

    var canonical;
    if (found) {
      canonical = found.entry.name;
    } else {
      canonical = (_isHidden(fname) ? '_' : '') + fbase + (_isProtected(fname) ? '!' : '');
    }

    var content = String(text == null ? '' : text);
    if (append && found) {
      var existing = _localLoad(canonical);
      if (existing !== null) content = existing + content;
    }

    var res = _localSave(canonical, content);
    if (res === 'Error: Disk Full') return 'Error: Disk Full';
    if (res === false) return 'Error: write failed';

    var size = _utf8len(content);
    var ts = _timestamp();
    if (found) {
      found.entry.size = size;
      found.entry.timestamp = ts;
    } else {
      manifest.push({ name: canonical, size: size, timestamp: ts });
    }
    var mres = _saveManifest(manifest);
    if (mres === 'Error: Disk Full') return 'Error: Disk Full';
    return true;
  };

  // localDelete(file) — delete file from localStorage in CURRENT DIRECTORY
  // Returns: Promise resolving to true or rejects on error
  global.localDelete = async function (file) {
    var fname = _normName(file);
    if (_classify(fname) !== 'normal') { return 'Error: read only file'; }

  var fbase = _baseName(fname);
  var fv = _validateBase(fbase);
  if (!fv.ok) return "Error: "+fv.reason;

  var manifest = _loadManifest();
  var cwd = getCwdSync();
  
  // Find file in current directory only
  var found = null;
  for (var i = 0; i < manifest.length; i++) {
    var e = manifest[i];
    if (e.name.charAt(0) === '<') continue; // Skip directories
    if (_baseName(e.name).toLowerCase() === fbase.toLowerCase()) {
      var fileDir = _getFileDir(e.name);
      if (fileDir === cwd) {
        found = { index: i, entry: e };
        break;
      }
    }
  }
  
  if (!found) return 'file not found';
  if (_isProtected(found.entry.name)) return 'read only file';

  _localDelete(found.entry.name);
  manifest.splice(found.index, 1);
  var mres = _saveManifest(manifest);
  if (mres === 'Error: Disk Full') return 'Disk Full';
  return true;
};

  // localExists(file) — check if file exists in localStorage
  // Returns: Promise resolving to boolean
  global.localExists = async function (file) {
    var fname = _normName(file);
    var cls = _classify(fname);
    if (cls === 'dir.txt' || cls === 'dir.sys') return true;

    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return false;

    return _findEntry(_loadManifest(), fname) !== null;
  };

  // localDir() — all localStorage entries in manifest format
  // Format: canonical_name|size|timestamp  (one per line, all files including hidden)
  global.localDir = async function () {
    var entries = _loadManifest();
    var lines = [];
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      var bytes=formatFileSize(e.size);	
      lines.push(' '+e.name+' '+bytes);
    }
    return "\n"+lines.join('\n')+"\n";
  };

  function formatFileSize(bytes) {
    bytes = parseInt(bytes, 10) || 0;
    if (bytes === 0) return '0b';
    if (bytes < 1024) return bytes + 'b';
    if (bytes < 1048576) return Math.round(bytes / 1024) + 'k';
    return Math.round(bytes / 1048576) + 'm';
  }

  // localList() — visible (non-hidden) filenames from localStorage, newline-separated
  // Excludes files with a leading _ (hidden flag)
  global.localList = async function () {
    var entries = _loadManifest();
    var out = [];
    for (var i = 0; i < entries.length; i++) {
      if (!_isHidden(entries[i].name)) {
        out.push(" "+_baseName(entries[i].name));
      }
    }
    return "\n"+out.join('\n')+"\n";
  };

  // localRename(file, dest) — rename file in localStorage
  // Returns: Promise resolving to true or rejects on error
  global.localRename = async function (file, dest) {
    var fname = _normName(file);
    var dname = _normName(dest);
    if (_classify(fname) !== 'normal') return 'read only file';
    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return 'Error: '+fv.reason;
    var dbase = _baseName(dname);
    var dv = _validateBase(dbase);
    if (!dv.ok) return 'Error: invalid destination';

    var manifest = _loadManifest();
    var srcFound = _findEntry(manifest, fname);
    if (!srcFound) return 'file not found';
    if (_isProtected(srcFound.entry.name)) return 'read only file';

    var destFound = _findEntry(manifest, dname);
    if (destFound) return 'destination file already exists';

    var content = _localLoad(srcFound.entry.name);
    if (content === null) return 'file not found';

    var destCanonical = (_isHidden(dname) ? '_' : '') + dbase + (_isProtected(dname) ? '!' : '');
    var res = _localSave(destCanonical, content);
    if (res === 'Error: Disk Full') return 'Disk Full';

    _localDelete(srcFound.entry.name);
    srcFound.entry.name = destCanonical;
    srcFound.entry.timestamp = _timestamp();
    var mres = _saveManifest(manifest);
    if (mres === 'Error: Disk Full') return 'Disk Full';
    return true;
  };


  function hasLocalStorage() {
    try {
      if (typeof localStorage === 'undefined' || localStorage === null) return false;
      var _ = localStorage.length;
      return true;
    } catch (e) {
      return false;
    }
  }

  function _calcLocalStorage() {
    try {
      var total = 0;
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        var v = localStorage.getItem(k) || '';
        // estimate bytes as UTF-16 (2 bytes per JS char)
        total += (k.length + v.length) * 2;
      }
      return total;
    } catch (e) {
      return null;
    }
  }

  // public fdisk entry point
  global.dosfdisk = async function () {
    print("\n[-bwhite][black]     localStorage:     [-black][white]\n");
    // Prefer navigator.storage.estimate for better info
    if (typeof navigator !== 'undefined' && navigator.storage && typeof navigator.storage.estimate === 'function') {
      navigator.storage.estimate().then(function(est) {
        var used = (est && est.usage) ? est.usage : null;
        var quota = (est && est.quota) ? est.quota : null;
        var free = Math.max(0, quota - used); 
        print(" size: "+formatFileSize(quota)+"\n used: "+formatFileSize(used)+"\n free: "+formatFileSize(free)+"\n"); 
        dosInstall();
      }).catch(function() {
        var used = _calcLocalStorage();
        print(" size: unknown\nused: "+formatFileSize(used)+"\n");
        dosInstall();
      });
    } else {
    	if (hasLocalStorage) {
        var used = _calcLocalStorageUsage();
        print(" size: unknown\n used: " +formatFileSize(used)+"\n");
        dosInstall();
      } else {
        print("\n This device has no\n localStorage avaialbe.\n\n");
      }
    }
  };

  function getLoadProtocol() { try { var p = (location && location.protocol) ? String(location.protocol) : ''; return p.replace(':', '') || 'unknown'; } catch (e) { return 'unknown'; }}
  function isFileProtocol() { return getLoadProtocol() === 'file'; }
  function isHttpProtocol() { var p = getLoadProtocol(); return p === 'http' || p === 'https'; }
  function getBaseURL() { try { return new URL('.', location.href).href; } catch (e) { return location.href; }}

  async function dosInstallFetch(file) {
    try {
      if (dosExists(file)) {
        print("exists");
      } else {
        const url = new URL(file, location.href).href;
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) {
          return(resp.status);
        } else {
          const text = await resp.text();
          const saveRes = await dosSave(file, text);
          if (saveRes === true) {
            print("installed");
          }
        }
      }
    } catch (err) {
      print(String(err));
    }
  }
 
  window.dosInstall=function() {

    if (!_readManifestRaw()) {
      try {
        localStorage.setItem(LOCAL_PREFIX + MANIFEST_KEY, MANIFEST_KEY+'|27|'+_timestamp()+"\n");
        print("\nlocalStorage has been formated\n");
      } catch (e) {
        return 'Error: Disk Full';
      }
    }

  	 if (isHttpProtocol() == true) {
  	   print("\nInstalling Qandy: \n");
  	   print("\n  ansi.js: "); dosInstallFetch("ansi.js");
      print("\n  ascii.js: "); dosInstallFetch("ascii.js");
      print("\n  keydown.js: "); dosInstallFetch("keydown.js");
      print("\n  piano.js: "); dosInstallFetch("piano.js");
      print("\n  svga.js: "); dosInstallFetch("svga.js");
      print("\nInstallation Complete.\n\n");
      return;
    }
    print("\ncannot install from file://\n");
    print("use DOS to copy .js files to\nlocalStorage.\n\n");
  }

  if (dosExists("dir.sys")) {} else {  
    print("localStorage not formated,\n");
    print("input \'fdisk\' to install.\n\n");
  }

})(window);
