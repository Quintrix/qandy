/* Qandy DOS - ground-up rewrite
 *
 * Requirements implemented:
 * - fresh implementation, no backwards compatibility
 * - local DEVICE variable, local DOS flag
 * - only supported devices: 'local', 'echo', 'none' (future: harddrive/server opt-in)
 * - manifest of filenames+filesizes kept as "dos.sys" (read-only for users)
 * - dosConfirm() must be called by user to enable DOS operations
 * - all public DOS functions check DOS === true before acting
 *
 * Public functions (global):
 *  dosConfirm()
 *  dosMount(device)
 *  dosBackup(data)
 *  dosList()
 *  dosSave(file,data)
 *  dosLoad(file)
 *  dosCopy(file, dest)
 *  dosPaste(dest)
 *  dosRename(file, dest)
 *  dosType(file)
 *  dosDelete(file)
 *  dosExists(file)
 *  dosErase()            // convenience: remove all Qandy files from local device
 *
 * Notes:
 *  - Storage keys for local files: LOCAL_PREFIX + filename
 *  - Manifest file stored at LOCAL_PREFIX + 'dos.sys' and kept authoritative by this module.
 *  - The manifest file is NOT writable by user calls to dosSave; the module updates it.
 *  - Filenames are validated to the spec in the instructions.
 */

(function () {
  'use strict';

  // Local runtime flags (per instructions)
  var DOS = false;              // if true, user has confirmed DOS install
  var DEVICE = 'local';         // default device, browser localStorage

  // Storage/config
  var LOCAL_PREFIX = 'qandy:file:'; // keys in localStorage for files
  var MANIFEST_NAME = 'dos.sys';    // filename of manifest (read-only)
  var MANIFEST_KEY = LOCAL_PREFIX + MANIFEST_NAME;

  // Allowed devices (only these are permitted by default)
  var SUPPORTED_DEVICES = ['local', 'echo', 'none'];

  // In-memory structures
  var _manifest = null;           // array of { name: string, size: number } for active local device
  var _echoStore = Object.create(null); // in-memory echo device store
  var _clipboard = null;          // { name, content } for dosCopy/dosPaste

  // Validation rules
  var MAX_NAME_BYTES = 255;
  var VALID_NAME_RE = /^(?!\.)[A-Za-z0-9 \-_.()+=]+$/; // allowed chars, not starting with '.'

  // UTF-8 byte length helper
  function _utf8len(s) {
    try { return (new TextEncoder()).encode(String(s)).length; } catch (e) { return String(s).length; }
  }

  // Normalize & validate name
  function _normName(n) {
    if (typeof n !== 'string') n = String(n == null ? '' : n);
    return n.trim();
  }
  function _validateName(n) {
    var name = _normName(n);
    if (!name) return { ok: false, reason: 'empty' };
    if (!_isValidChars(name)) return { ok: false, reason: 'invalid-chars-or-leading-dot' };
    if (_utf8len(name) > MAX_NAME_BYTES) return { ok: false, reason: 'too-long' };
    return { ok: true, name: name };
  }
  function _isValidChars(name) {
    return VALID_NAME_RE.test(name);
  }

  // Manifest helpers ------------------------------------------------

  // Load manifest into _manifest (array of {name,size}).
  // If manifest file exists in localStorage, parse it; otherwise build by scanning localStorage.
  function _loadManifest() {
    if (_manifest !== null) return _manifest;
    _manifest = [];
    try {
      var raw = localStorage.getItem(MANIFEST_KEY);
      if (raw !== null) {
        // manifest stored as plain text lines like: "123 filename\n"
        var lines = String(raw).split(/\r?\n/);
        for (var i = 0; i < lines.length; i++) {
          var ln = lines[i].trim();
          if (!ln) continue;
          // split on first whitespace
          var sp = ln.indexOf(' ');
          if (sp === -1) continue;
          var sizeStr = ln.substring(0, sp);
          var fname = ln.substring(sp + 1);
          var size = parseInt(sizeStr, 10);
          if (!isNaN(size) && fname) {
            // ensure filename valid to avoid manifest poisoning
            var vn = _validateName(fname);
            if (vn.ok && fname !== MANIFEST_NAME) _manifest.push({ name: fname, size: size });
          }
        }
        // manifest loaded; but ensure any missing actual files are ignored and any files without manifest should be added below
      }
    } catch (e) {
      _manifest = [];
    }

    // Ensure manifest reflects actual keys in localStorage (scan & merge)
    try {
      for (var j = 0; j < localStorage.length; j++) {
        var k = localStorage.key(j);
        if (!k) continue;
        if (k.indexOf(LOCAL_PREFIX) !== 0) continue;
        var fname = k.substring(LOCAL_PREFIX.length);
        if (fname === MANIFEST_NAME) continue; // skip system manifest file itself
        // check if present in _manifest
        var found = false;
        for (var m = 0; m < _manifest.length; m++) {
          if (_manifest[m].name === fname) { found = true; break; }
        }
        if (!found) {
          var v = localStorage.getItem(k);
          var sz = (v === null) ? 0 : _utf8len(v);
          _manifest.push({ name: fname, size: sz });
        }
      }
    } catch (e) {
      // ignore scanning errors
    }

    // Persist canonical manifest into dos.sys so it's always correct on disk
    _persistManifest();
    return _manifest;
  }

  // Persist _manifest into MANIFEST_KEY as text lines "size filename\n"
  function _persistManifest() {
    if (!_manifest) _manifest = [];
    // sort manifest by name for stable ordering
    _manifest.sort(function (a, b) { return a.name.localeCompare(b.name); });
    var lines = [];
    for (var i = 0; i < _manifest.length; i++) {
      lines.push(String(_manifest[i].size) + ' ' + _manifest[i].name);
    }
    var txt = lines.join('\n');
    try {
      // write the manifest file; this is the only code allowed to write MANIFEST_KEY
      localStorage.setItem(MANIFEST_KEY, txt);
    } catch (e) {
      // ignore write errors (quota, private mode)
    }
  }

  function _findManifestIndex(name) {
    if (!_manifest) return -1;
    for (var i = 0; i < _manifest.length; i++) if (_manifest[i].name === name) return i;
    return -1;
  }

  function _manifestAddOrUpdate(name, size) {
    if (!_manifest) _manifest = [];
    var idx = _findManifestIndex(name);
    if (idx === -1) {
      _manifest.push({ name: name, size: size });
    } else {
      _manifest[idx].size = size;
    }
    _persistManifest();
  }

  function _manifestRemove(name) {
    if (!_manifest) return;
    var idx = _findManifestIndex(name);
    if (idx !== -1) {
      _manifest.splice(idx, 1);
      _persistManifest();
    }
  }

  // Backend helpers --------------------------------------------------

  function _deviceIsLocal() { return DEVICE === 'local'; }
  function _deviceIsEcho() { return DEVICE === 'echo'; }
  function _deviceIsNone() { return DEVICE === 'none'; }

  // public API helpers ------------------------------------------------

  function _ensureDOS() {
    if (!DOS) {
      print('DOS not installed. To enable, run: dosConfirm()\n');
      return false;
    }
    return true;
  }

  // Public API --------------------------------------------------------

  // Note: instructions asked for dosConfirm(); use this exact name.
  function dosConfirm() {
    if (DOS) {
      print('DOS already confirmed.\n');
      return true;
    }
    DOS = true;
    // Ensure manifest loaded for device local
    if (_deviceIsLocal()) _loadManifest();
    print('\nQandy DOS installed. Use dosMount(device) to change storage device (local, echo, none).\n');
    print('Available commands: dosBackup, dosList, dosSave, dosLoad, dosCopy, dosPaste,\n');
    print('                    dosRename, dosType, dosDelete, dosExists, dosErase\n\n');
    return true;
  }

  function dosMount(device) {
    if (!_ensureDOS()) return null;
    if (typeof device === 'undefined' || device === null || String(device).trim() === '') {
      return DEVICE;
    }
    if (typeof device !== 'string') {
      print('dosMount: device must be string\n');
      return null;
    }
    device = device.trim();
    if (SUPPORTED_DEVICES.indexOf(device) === -1) {
      print('dosMount: unsupported device: ' + device + '\n');
      return null;
    }
    DEVICE = device;
    // ensure manifest present if switching to local
    if (_deviceIsLocal()) _loadManifest();
    return DEVICE;
  }

  // dosBackup(data) - if data omitted, export JSON archive of device; if provided (JSON or object), import into device (overwrite)
  function dosBackup(data) {
    if (!_ensureDOS()) return null;
    var dev = DEVICE || 'local';
    if (typeof data === 'undefined') {
      // export synchronously
      var files = {};
      if (dev === 'local') {
        _loadManifest();
        for (var i = 0; i < _manifest.length; i++) {
          var n = _manifest[i].name;
          try { var c = localStorage.getItem(LOCAL_PREFIX + n); files[n] = (c === null ? null : String(c)); } catch (e) { files[n] = null; }
        }
      } else if (dev === 'echo') {
        var ek = Object.keys(_echoStore);
        for (var j = 0; j < ek.length; j++) files[ek[j]] = _echoStore[ek[j]];
      } else if (dev === 'none') {
        // no files
      }
      return JSON.stringify({ device: dev, created: (new Date()).toISOString(), files: files });
    } else {
      // import
      var obj = data;
      if (typeof data === 'string') {
        try { obj = JSON.parse(data); } catch (e) { print('dosBackup: data must be JSON or object\n'); return false; }
      }
      if (!obj || typeof obj !== 'object' || !obj.files) { print('dosBackup: invalid archive\n'); return false; }
      // overwrite current device
      if (dev === 'local') {
        // delete current qandy files
        _loadManifest();
        var cur = _manifest.slice().map(function(it){ return it.name; });
        for (var k = 0; k < cur.length; k++) {
          try { localStorage.removeItem(LOCAL_PREFIX + cur[k]); } catch (e) {}
        }
        _manifest = [];
        // write new files
        var keys = Object.keys(obj.files || {});
        for (var m = 0; m < keys.length; m++) {
          var nm = keys[m];
          var val = obj.files[nm];
          var v = _validateName(nm);
          if (!v.ok) continue;
          try {
            localStorage.setItem(LOCAL_PREFIX + v.name, val == null ? '' : String(val));
            _manifestAddOrUpdate(v.name, _utf8len(val == null ? '' : val));
          } catch (e) { /* ignore write error */ }
        }
        _persistManifest();
        return true;
      } else if (dev === 'echo') {
        _echoStore = Object.create(null);
        var ek2 = Object.keys(obj.files || {});
        for (var eidx = 0; eidx < ek2.length; eidx++) {
          var en = ek2[eidx];
          _echoStore[en] = obj.files[en] == null ? '' : String(obj.files[en]);
        }
        return true;
      } else {
        print('dosBackup: import not supported for device: ' + dev + '\n');
        return false;
      }
    }
  }

  // dosList() — returns string with list of files separated by new lines (does NOT include dos.sys)
  function dosList() {
    if (!_ensureDOS()) return '';
    var dev = DEVICE || 'local';
    if (dev === 'local') {
      _loadManifest();
      if (!_manifest || !_manifest.length) return '';
      return _manifest.map(function (it) { return it.name; }).join('\n');
    } else if (dev === 'echo') {
      var ek = Object.keys(_echoStore || {});
      return ek.length ? ek.join('\n') : '';
    } else {
      return '';
    }
  }

  // dosSave(file,data) — saves data as filename; if filename begins with > append to existing file
  function dosSave(file, data) {
    if (!_ensureDOS()) return false;
    if (typeof file !== 'string' || file.length === 0) { print('dosSave: file required\n'); return false; }
    var append = false;
    var fname = file;
    if (fname.charAt(0) === '>') { append = true; fname = fname.substring(1); }
    var v = _validateName(fname);
    if (!v.ok) { print('dosSave: invalid filename (' + v.reason + ')\n'); return false; }
    if (v.name === MANIFEST_NAME) { print('dosSave: "' + MANIFEST_NAME + '" is read-only\n'); return false; }
    var content = (data == null) ? '' : String(data);
    if (_deviceIsLocal()) {
      try {
        if (append) {
          var cur = localStorage.getItem(LOCAL_PREFIX + v.name) || '';
          content = cur + content;
        }
        localStorage.setItem(LOCAL_PREFIX + v.name, content);
        _loadManifest();
        _manifestAddOrUpdate(v.name, _utf8len(content));
        return true;
      } catch (e) { print('dosSave: failed to save (' + e + ')\n'); return false; }
    } else if (_deviceIsEcho()) {
      if (append) {
        _echoStore[v.name] = (_echoStore[v.name] || '') + content;
      } else {
        _echoStore[v.name] = content;
      }
      return true;
    } else {
      print('dosSave: device "' + DEVICE + '" does not support saving\n');
      return false;
    }
  }

  // dosLoad(file) — returns contents of filename from active device as string (returns null if missing)
  function dosLoad(file) {
    if (!_ensureDOS()) return null;
    if (typeof file !== 'string' || file.length === 0) { print('dosLoad: file required\n'); return null; }
    var v = _validateName(file);
    if (!v.ok) { print('dosLoad: invalid filename (' + v.reason + ')\n'); return null; }
    if (v.name === MANIFEST_NAME) {
      // return manifest content (always up-to-date)
      _loadManifest();
      // build manifest text "size filename\n"
      var lines = (_manifest || []).map(function (it) { return String(it.size) + ' ' + it.name; });
      return lines.join('\n');
    }
    if (_deviceIsLocal()) {
      var val = localStorage.getItem(LOCAL_PREFIX + v.name);
      return (val === null) ? null : String(val);
    } else if (_deviceIsEcho()) {
      return _echoStore.hasOwnProperty(v.name) ? _echoStore[v.name] : null;
    } else {
      return null;
    }
  }

  // dosCopy(file, dest) — copies file into clipboard; if dest provided also copies into dest file (error if dest exists)
  function dosCopy(file, dest) {
    if (!_ensureDOS()) return false;
    if (typeof file !== 'string' || file.length === 0) { print('dosCopy: file required\n'); return false; }
    var v = _validateName(file);
    if (!v.ok) { print('dosCopy: invalid filename (' + v.reason + ')\n'); return false; }
    // do not allow copying system file into clipboard by user
    if (v.name === MANIFEST_NAME) { print('dosCopy: "' + MANIFEST_NAME + '" is system file\n'); return false; }
    var content = dosLoad(v.name);
    if (content === null) { print('dosCopy: source file not found\n'); return false; }
    _clipboard = { name: v.name, content: content };
    if (typeof dest !== 'undefined' && dest !== null && String(dest).trim() !== '') {
      var dv = _validateName(dest);
      if (!dv.ok) { print('dosCopy: invalid dest filename (' + dv.reason + ')\n'); return false; }
      if (dv.name === MANIFEST_NAME) { print('dosCopy: cannot write to system file\n'); return false; }
      if (dosExists(dv.name)) { print('dosCopy: dest already exists\n'); return false; }
      return dosSave(dv.name, content);
    }
    return true;
  }

  // dosPaste(dest) — pastes clipboard contents into dest (error if dest exists)
  function dosPaste(dest) {
    if (!_ensureDOS()) return false;
    if (!_clipboard) { print('dosPaste: clipboard empty\n'); return false; }
    if (typeof dest !== 'string' || dest.length === 0) { print('dosPaste: dest required\n'); return false; }
    var dv = _validateName(dest);
    if (!dv.ok) { print('dosPaste: invalid dest filename (' + dv.reason + ')\n'); return false; }
    if (dv.name === MANIFEST_NAME) { print('dosPaste: cannot write to system file\n'); return false; }
    if (dosExists(dv.name)) { print('dosPaste: dest already exists\n'); return false; }
    return dosSave(dv.name, _clipboard.content);
  }

  // dosRename(file, dest) — renames file to dest (error if dest exists)
  function dosRename(file, dest) {
    if (!_ensureDOS()) return false;
    if (typeof file !== 'string' || file.length === 0) { print('dosRename: file required\n'); return false; }
    if (typeof dest !== 'string' || dest.length === 0) { print('dosRename: dest required\n'); return false; }
    var v = _validateName(file);
    var dv = _validateName(dest);
    if (!v.ok) { print('dosRename: invalid filename (' + v.reason + ')\n'); return false; }
    if (!dv.ok) { print('dosRename: invalid dest (' + dv.reason + ')\n'); return false; }
    if (v.name === MANIFEST_NAME || dv.name === MANIFEST_NAME) { print('dosRename: cannot rename system file\n'); return false; }
    if (!dosExists(v.name)) { print('dosRename: source file not found\n'); return false; }
    if (dosExists(dv.name)) { print('dosRename: dest already exists\n'); return false; }

    var content = dosLoad(v.name);
    if (content === null) { print('dosRename: failed to read source\n'); return false; }

    // write dest then delete source (atomic-ish)
    var saved = dosSave(dv.name, content);
    if (!saved) { print('dosRename: failed to write dest\n'); return false; }
    var deleted = dosDelete(v.name);
    if (!deleted) { print('dosRename: failed to delete source after rename\n'); return false; }
    return true;
  }

  // dosType(file) — print() file to display screen
  function dosType(file) {
    if (!_ensureDOS()) return false;
    if (typeof file !== 'string' || file.length === 0) { print('dosType: file required\n'); return false; }
    var v = _validateName(file);
    if (!v.ok) { print('dosType: invalid filename (' + v.reason + ')\n'); return false; }
    var content = dosLoad(v.name);
    if (content === null) { print('dosType: file not found\n'); return false; }
    print(String(content) + '\n');
    return true;
  }

  // dosDelete(file) — deletes filename from active device
  function dosDelete(file) {
    if (!_ensureDOS()) return false;
    if (typeof file !== 'string' || file.length === 0) { print('dosDelete: file required\n'); return false; }
    var v = _validateName(file);
    if (!v.ok) { print('dosDelete: invalid filename (' + v.reason + ')\n'); return false; }
    if (v.name === MANIFEST_NAME) { print('dosDelete: cannot delete system file\n'); return false; }

    if (_deviceIsLocal()) {
      try {
        localStorage.removeItem(LOCAL_PREFIX + v.name);
        _manifestRemove(v.name);
        return true;
      } catch (e) { print('dosDelete: failed (' + e + ')\n'); return false; }
    } else if (_deviceIsEcho()) {
      if (_echoStore.hasOwnProperty(v.name)) {
        delete _echoStore[v.name];
        return true;
      }
      return false;
    } else {
      print('dosDelete: device "' + DEVICE + '" does not support deletion\n');
      return false;
    }
  }

  // dosExists(file) — returns true if filename exists
  function dosExists(file) {
    if (!_ensureDOS()) return false;
    if (typeof file !== 'string' || file.length === 0) { return false; }
    var v = _validateName(file);
    if (!v.ok) return false;
    if (v.name === MANIFEST_NAME) {
      // manifest always 'exists' if device is local (may be empty)
      return _deviceIsLocal();
    }
    if (_deviceIsLocal()) {
      return localStorage.getItem(LOCAL_PREFIX + v.name) !== null;
    } else if (_deviceIsEcho()) {
      return _echoStore.hasOwnProperty(v.name);
    } else {
      return false;
    }
  }

  // dosErase() — convenience: erase all Qandy files for the active local device (keeps other origins' keys)
  // This deletes only keys under LOCAL_PREFIX and clears manifest. Protected by DOS check.
  function dosErase() {
    if (!_ensureDOS()) return false;
    if (!_deviceIsLocal()) { print('dosErase: only supported for local device\n'); return false; }
    // list current files then delete them
    _loadManifest();
    var cur = (_manifest || []).slice().map(function(it){ return it.name; });
    for (var i = 0; i < cur.length; i++) {
      try { localStorage.removeItem(LOCAL_PREFIX + cur[i]); } catch (e) {}
    }
    // remove manifest key and clear in-memory
    try { localStorage.removeItem(MANIFEST_KEY); } catch (e) {}
    _manifest = [];
    return true;
  }

  // expose global functions (use exact names from spec)
  window.dosConfirm = dosConfirm;
  window.dosMount = dosMount;
  window.dosBackup = dosBackup;
  window.dosList = dosList;
  window.dosSave = dosSave;
  window.dosLoad = dosLoad;
  window.dosCopy = dosCopy;
  window.dosPaste = dosPaste;
  window.dosRename = dosRename;
  window.dosType = dosType;
  window.dosDelete = dosDelete;
  window.dosExists = dosExists;
  window.dosErase = dosErase;

  // Initial printed notice (must instruct dosConfirm() per your requirement)
  print("\nQandy Disk Operating System:\n");
  print("\nThese functions save and load files to your brower's localStorage.\n");
  print("\nDo not use Qandy DOS to store sensitive information such as names and passwords.\n");
  print("\nThe Qandy Pocket Computer's security is limited to your browser's security, we do the best we can with what we have to work with.\n");
  print("\nTo complete installation, input:\n  dosConfirm()\n\n");

}());