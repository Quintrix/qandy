/**
 * Exposed globals (async functions returning Promises unless noted):
 *  - dosMount(device)
 *  - dosFormat(data)
 *  - dosList()
 *  - dosSave(file, data)
 *  - dosLoad(file)
 *  - dosCopy(file, dest)
 *  - dosPaste(dest)
 *  - dosRename(file, dest)
 *  - dosType(file)
 *  - dosDownload(file)
 *  - dosUpload(optionalDest)
 *  - dosDelete(file)
 *  - dosExists(file)
 */

var DEVICE = "local";  // default device, browser localStorage

(function (global) {
  'use strict';

  // Public device var
  global.DEVICE = global.DEVICE || 'local';

  // Config / constants
  var LOCAL_PREFIX = 'qandy_file:';
  var LOCAL_MAN_KEY = 'qandy_manifest_local';
  var MAX_NAME_BYTES = 255;
  var VALID_NAME_RE = /^(?!\.)[A-Za-z0-9 \-_.()+=]+$/;
  var SUPPORTED_DEVICES = ['local', 'harddrive', 'server', 'echo', 'none'];

  // Internal state
  var _localManifest = null; // array of filenames for local
  var _echoStore = Object.create(null); // in-memory echo device
  var _harddriveHandle = null; // DirectoryHandle from showDirectoryPicker
  var DOS_CLIPBOARD = null; // { name, content, device, size, createdAt }

  // Helpers --------------------------------------------------------

  function _utf8len(s) {
    try { return (new TextEncoder()).encode(String(s)).length; } catch (e) { return String(s).length; }
  }
  function _normName(n) { return (typeof n === 'string') ? n.trim() : String(n == null ? '' : n).trim(); }
  function _validateName(name) {
    var n = _normName(name);
    if (!n) return { ok: false, reason: 'empty' };
    if (_utf8len(n) > MAX_NAME_BYTES) return { ok: false, reason: 'too-long' };
    if (!VALID_NAME_RE.test(n)) return { ok: false, reason: 'invalid-chars-or-leading-dot' };
    return { ok: true, name: n };
  }

  // Local manifest handling (localStorage-backed)
  async function _loadLocalManifest() {
    if (_localManifest !== null) return _localManifest;
    try {
      var raw = localStorage.getItem(LOCAL_MAN_KEY);
      if (raw) {
        _localManifest = JSON.parse(raw);
        if (!Array.isArray(_localManifest)) _localManifest = [];
      } else {
        // build manifest by scanning keys
        _localManifest = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(LOCAL_PREFIX) === 0) _localManifest.push(k.substring(LOCAL_PREFIX.length));
        }
        try { localStorage.setItem(LOCAL_MAN_KEY, JSON.stringify(_localManifest)); } catch (e) {}
      }
    } catch (e) { _localManifest = []; }
    return _localManifest;
  }
  async function _persistLocalManifest() {
    try { localStorage.setItem(LOCAL_MAN_KEY, JSON.stringify(_localManifest || [])); } catch (e) {}
  }
  function _localHas(name) {
    return (_localManifest && _localManifest.indexOf(name) !== -1);
  }
  function _localAdd(name) {
    if (!_localManifest) _localManifest = [];
    if (_localManifest.indexOf(name) === -1) { _localManifest.push(name); _persistLocalManifest(); }
  }
  function _localRemove(name) {
    if (!_localManifest) return;
    var i = _localManifest.indexOf(name);
    if (i !== -1) { _localManifest.splice(i, 1); _persistLocalManifest(); }
  }

  // Upload picker helper (returns { name, text } or null)
  async function _upload_pickFile() {
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        var handles = await window.showOpenFilePicker({ multiple: false });
        if (!handles || !handles.length) return null;
        var fh = handles[0];
        var file = await fh.getFile();
        return { name: file.name, text: await file.text() };
      } catch (e) { return null; }
    }
    // fallback to input element
    return new Promise(function (resolve) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.style.position = 'fixed';
      inp.style.left = '-9999px';
      document.body.appendChild(inp);
      inp.onchange = async function () {
        var f = inp.files && inp.files[0];
        if (!f) { document.body.removeChild(inp); return resolve(null); }
        var t = await f.text();
        document.body.removeChild(inp);
        resolve({ name: f.name, text: t });
      };
      inp.click();
    });
  }

  // Save-as helper for download / saving to file system via save picker
  async function _saveFileAs(name, content) {
    // prefer showSaveFilePicker
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        var opts = { suggestedName: name };
        var handle = await window.showSaveFilePicker(opts);
        var w = await handle.createWritable();
        await w.write(String(content == null ? '' : content));
        await w.close();
        return true;
      } catch (e) {
        // fall through to anchor download
      }
    }
    var blob = new Blob([String(content == null ? '' : content)], { type: 'text/plain;charset=utf-8' });
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

  // Harddrive helpers (DirectoryHandle based)
  async function _hd_list() {
    if (!(_harddriveHandle)) return [];
    var out = [];
    try {
      for await (const [name, handle] of _harddriveHandle.entries()) {
        if (handle.kind === 'file') out.push(name);
      }
    } catch (e) { /* ignore */ }
    return out;
  }
  async function _hd_load(name) {
    if (!(_harddriveHandle)) return null;
    try {
      var fh = await _harddriveHandle.getFileHandle(name, { create: false });
      var file = await fh.getFile();
      return await file.text();
    } catch (e) { return null; }
  }
  async function _hd_save(name, content) {
    if (!(_harddriveHandle)) return Promise.reject(new Error('harddrive not mounted'));
    var fh = await _harddriveHandle.getFileHandle(name, { create: true });
    var w = await fh.createWritable();
    await w.write(String(content == null ? '' : content));
    await w.close();
  }
  async function _hd_delete(name) {
    if (!(_harddriveHandle)) return Promise.reject(new Error('harddrive not mounted'));
    try { await _harddriveHandle.removeEntry(name); } catch (e) { /* ignore */ }
  }

  // Backend dispatchers ------------------------------------------------

  async function _backend_list(device) {
    device = device || global.DEVICE;
    switch (device) {
      case 'local': await _loadLocalManifest(); return (_localManifest || []).slice();
      case 'echo': return Object.keys(_echoStore).slice();
      case 'none': return [];
      case 'harddrive': return await _hd_list();
      case 'server': // not implemented, return empty
        return [];
      default: return [];
    }
  }

  async function _backend_load(device, name) {
    device = device || global.DEVICE;
    switch (device) {
      case 'local':
        var v = localStorage.getItem(LOCAL_PREFIX + name);
        return (v === null) ? null : String(v);
      case 'echo':
        return _echoStore.hasOwnProperty(name) ? _echoStore[name] : null;
      case 'none':
        return null;
      case 'harddrive':
        return await _hd_load(name);
      case 'server':
        // server not implemented in this rewrite
        return null;
      default:
        return null;
    }
  }

  async function _backend_save(device, name, content) {
    device = device || global.DEVICE;
    switch (device) {
      case 'local':
        try {
          localStorage.setItem(LOCAL_PREFIX + name, String(content == null ? '' : content));
          await _loadLocalManifest();
          _localAdd(name);
          return;
        } catch (e) { throw e; }
      case 'echo':
        _echoStore[name] = String(content == null ? '' : content);
        return;
      case 'none':
        return;
      case 'harddrive':
        return await _hd_save(name, content);
      case 'server':
        // server not implemented
        throw new Error('server device not implemented');
      default:
        return;
    }
  }

  async function _backend_delete(device, name) {
    device = device || global.DEVICE;
    switch (device) {
      case 'local':
        try {
          localStorage.removeItem(LOCAL_PREFIX + name);
          await _loadLocalManifest();
          _localRemove(name);
        } catch (e) {}
        return;
      case 'echo':
        delete _echoStore[name];
        return;
      case 'none':
        return;
      case 'harddrive':
        return await _hd_delete(name);
      case 'server':
        // not implemented
        throw new Error('server device not implemented');
      default:
        return;
    }
  }

  async function _backend_exists(device, name) {
    device = device || global.DEVICE;
    var arr = await _backend_list(device);
    return arr.indexOf(name) !== -1;
  }

  // Public API implementations ---------------------------------------

  // dosMount(device) - sets active device; if omitted returns current device
  async function dosMount(device) {
    if (typeof device === 'undefined' || device === null || String(device).trim() === '') {
      return Promise.resolve(global.DEVICE || 'none');
    }
    if (typeof device !== 'string') return Promise.reject(new Error('device must be string'));
    device = device.trim();
    if (SUPPORTED_DEVICES.indexOf(device) === -1) return Promise.reject(new Error('unsupported device: ' + device));

    // special handling for harddrive: ask user to pick a directory
    if (device === 'harddrive') {
      // if already have handle, accept
      if (_harddriveHandle) {
        global.DEVICE = 'harddrive';
        return Promise.resolve('harddrive');
      }
      if (typeof window.showDirectoryPicker !== 'function') return Promise.reject(new Error('File System Access API not available'));
      try {
        _harddriveHandle = await window.showDirectoryPicker();
        global.DEVICE = 'harddrive';
        return Promise.resolve('harddrive');
      } catch (e) {
        _harddriveHandle = null;
        return Promise.reject(e);
      }
    }

    // otherwise set device
    global.DEVICE = device;
    return Promise.resolve(device);
  }

  // dosFormat(data) - if data omitted, export JSON archive of device; if provided (JSON or object), import into device (overwrite)
  async function dosFormat(data) {
    var dev = global.DEVICE || 'local';
    if (typeof data === 'undefined') {
      // export
      var files = {};
      var list = await _backend_list(dev);
      for (var i = 0; i < list.length; i++) {
        var n = list[i];
        try { var c = await _backend_load(dev, n); files[n] = (c === null ? null : String(c)); } catch (e) { files[n] = null; }
      }
      return JSON.stringify({ device: dev, created: (new Date()).toISOString(), files: files });
    } else {
      // import
      var obj = data;
      if (typeof data === 'string') {
        try { obj = JSON.parse(data); } catch (e) { return Promise.reject(new Error('format: data must be JSON or object')); }
      }
      if (!obj || typeof obj !== 'object' || !obj.files) return Promise.reject(new Error('format: invalid archive'));
      var cur = await _backend_list(dev);
      for (var j = 0; j < cur.length; j++) await _backend_delete(dev, cur[j]);
      var keys = Object.keys(obj.files || {});
      for (var k = 0; k < keys.length; k++) {
        var nm = keys[k]; var val = obj.files[nm];
        var v = _validateName(nm);
        if (!v.ok) continue;
        await _backend_save(dev, v.name, val == null ? '' : String(val));
      }
      return Promise.resolve(true);
    }
  }

  // dosList() - returns newline-separated list of filenames
  async function dosList() {
    var dev = global.DEVICE || 'local';
    var arr = await _backend_list(dev);
    return (arr && arr.length) ? arr.join('\n') : '';
  }

  // dosSave(file, data) - '>' prefix appends
  async function dosSave(file, data) {
    if (typeof file !== 'string' || file.length === 0) return Promise.reject(new Error('dosSave: file required'));
    var append = false;
    var fname = file;
    if (fname.charAt(0) === '>') { append = true; fname = fname.substring(1); }
    var v = _validateName(fname);
    if (!v.ok) return Promise.reject(new Error('dosSave: invalid filename (' + v.reason + ')'));
    var dev = global.DEVICE || 'local';
    if (append) {
      var existing = await _backend_load(dev, v.name);
      var newContent = (existing === null ? '' : String(existing)) + (data == null ? '' : String(data));
      await _backend_save(dev, v.name, newContent);
      return Promise.resolve(true);
    } else {
      await _backend_save(dev, v.name, data == null ? '' : String(data));
      return Promise.resolve(true);
    }
  }

  // dosLoad(file) - returns file content string or null
  async function dosLoad(file) {
    if (typeof file !== 'string' || file.length === 0) return Promise.reject(new Error('dosLoad: file required'));
    var v = _validateName(file);
    if (!v.ok) return Promise.reject(new Error('dosLoad: invalid filename (' + v.reason + ')'));
    var dev = global.DEVICE || 'local';

    // For harddrive, if handle missing, prompt user so load may succeed without explicit mount
    if (dev === 'harddrive' && !_harddriveHandle) {
      try {
        if (typeof window.showDirectoryPicker !== 'function') return Promise.resolve(null);
        _harddriveHandle = await window.showDirectoryPicker();
      } catch (e) { _harddriveHandle = null; return Promise.resolve(null); }
    }

    return await _backend_load(dev, v.name);
  }

  // dosCopy(file, dest) - copy into clipboard; if dest provided, also save as dest (error if dest exists)
  async function dosCopy(file, dest) {
    if (typeof file !== 'string' || file.length === 0) return Promise.reject(new Error('dosCopy: file required'));
    var v = _validateName(file);
    if (!v.ok) return Promise.reject(new Error('dosCopy: invalid filename (' + v.reason + ')'));
    var dev = global.DEVICE || 'local';

    // load source (may prompt for upload during load if device requires)
    var content = await _backend_load(dev, v.name);
    if (content === null) return Promise.reject(new Error('dosCopy: source not found or user cancelled'));

    // store in clipboard
    var size;
    try { size = _utf8len(content); } catch (e) { size = String(content).length; }
    DOS_CLIPBOARD = { name: v.name, content: String(content), device: dev, size: size, createdAt: Date.now() };

    // if dest provided, write immediately but error if dest exists
    if (typeof dest !== 'undefined' && dest !== null && String(dest).trim() !== '') {
      var vd = _validateName(dest);
      if (!vd.ok) return Promise.reject(new Error('dosCopy: invalid dest (' + vd.reason + ')'));
      var exists = await _backend_exists(dev, vd.name);
      if (exists) return Promise.reject(new Error('dosCopy: destination exists'));
      await _backend_save(dev, vd.name, DOS_CLIPBOARD.content);
      return Promise.resolve(true);
    }

    return Promise.resolve(true);
  }

  // dosPaste(dest) - paste clipboard to dest, error if dest exists
  async function dosPaste(dest) {
    if (!DOS_CLIPBOARD) return Promise.reject(new Error('dosPaste: clipboard is empty'));
    if (typeof dest !== 'string' || dest.length === 0) return Promise.reject(new Error('dosPaste: dest required'));
    var vd = _validateName(dest);
    if (!vd.ok) return Promise.reject(new Error('dosPaste: invalid dest (' + vd.reason + ')'));
    var dev = global.DEVICE || 'local';
    var exists = await _backend_exists(dev, vd.name);
    if (exists) return Promise.reject(new Error('dosPaste: destination exists'));
    await _backend_save(dev, vd.name, DOS_CLIPBOARD.content);
    return Promise.resolve(true);
  }

  // dosRename(file, dest) - rename file to dest (error if dest exists)
  async function dosRename(file, dest) {
    if (typeof file !== 'string' || file.length === 0) return Promise.reject(new Error('dosRename: file required'));
    if (typeof dest !== 'string' || dest.length === 0) return Promise.reject(new Error('dosRename: dest required'));
    var vsrc = _validateName(file); if (!vsrc.ok) return Promise.reject(new Error('dosRename: invalid src (' + vsrc.reason + ')'));
    var vdst = _validateName(dest); if (!vdst.ok) return Promise.reject(new Error('dosRename: invalid dest (' + vdst.reason + ')'));
    var dev = global.DEVICE || 'local';
    var content = await _backend_load(dev, vsrc.name);
    if (content === null) return Promise.reject(new Error('dosRename: source not found'));
    var exists = await _backend_exists(dev, vdst.name);
    if (exists) return Promise.reject(new Error('dosRename: destination exists'));
    await _backend_save(dev, vdst.name, content);
    await _backend_delete(dev, vsrc.name);
    return Promise.resolve(true);
  }

  // dosType(file) - print file contents to display (uses global.print if present)
  async function dosType(file) {
    if (typeof file !== 'string' || file.length === 0) return Promise.reject(new Error('dosType: file required'));
    var v = _validateName(file);
    if (!v.ok) return Promise.reject(new Error('dosType: invalid filename (' + v.reason + ')'));
    var dev = global.DEVICE || 'local';
    var content = await _backend_load(dev, v.name);
    if (content === null) return Promise.reject(new Error('dosType: file not found'));
    if (typeof global.print === 'function') {
      global.print(String(content));
    } else {
      // fallback to appending to #txt if present, else console
      try {
        var el = document.getElementById('txt');
        if (el) { el.textContent += String(content); }
        else console.log(String(content));
      } catch (e) { console.log(String(content)); }
    }
    return Promise.resolve(true);
  }

  // dosDownload(file) - trigger browser save-as for the file
  async function dosDownload(file) {
    if (typeof file !== 'string' || file.length === 0) return Promise.reject(new Error('dosDownload: file required'));
    var v = _validateName(file);
    if (!v.ok) return Promise.reject(new Error('dosDownload: invalid filename (' + v.reason + ')'));
    var dev = global.DEVICE || 'local';
    var content = await _backend_load(dev, v.name);
    if (content === null) return Promise.reject(new Error('dosDownload: file not found'));
    await _saveFileAs(v.name, content);
    return Promise.resolve(true);
  }

  // dosUpload(optionalDest) - open file picker and save chosen file into current device
  // returns the filename saved or null if cancelled
  async function dosUpload(optionalDest) {
    var picked = await _upload_pickFile();
    if (!picked) return Promise.resolve(null); // user cancelled
    var destName = (typeof optionalDest === 'string' && optionalDest.trim() !== '') ? optionalDest.trim() : picked.name;
    var v = _validateName(destName);
    if (!v.ok) return Promise.reject(new Error('dosUpload: invalid destination name (' + v.reason + ')'));
    var dev = global.DEVICE || 'local';
    // if dest exists, overwrite (design choice) - to prevent accidental overwrite, caller should check dosExists first
    await _backend_save(dev, v.name, String(picked.text));
    return Promise.resolve(v.name);
  }

  // dosDelete(file) - delete filename
  async function dosDelete(file) {
    if (typeof file !== 'string' || file.length === 0) return Promise.reject(new Error('dosDelete: file required'));
    var v = _validateName(file);
    if (!v.ok) return Promise.reject(new Error('dosDelete: invalid filename (' + v.reason + ')'));
    var dev = global.DEVICE || 'local';
    await _backend_delete(dev, v.name);
    return Promise.resolve(true);
  }

  // dosExists(file) - returns boolean
  async function dosExists(file) {
    if (typeof file !== 'string' || file.length === 0) return Promise.resolve(false);
    var v = _validateName(file);
    if (!v.ok) return Promise.resolve(false);
    var dev = global.DEVICE || 'local';
    return await _backend_exists(dev, v.name);
  }

  // Expose public functions to global
  global.dosMount = dosMount;
  global.dosFormat = dosFormat;
  global.dosList = dosList;
  global.dosSave = dosSave;
  global.dosLoad = dosLoad;
  global.dosCopy = dosCopy;
  global.dosPaste = dosPaste;
  global.dosRename = dosRename;
  global.dosType = dosType;
  global.dosDownload = dosDownload;
  global.dosUpload = dosUpload;
  global.dosDelete = dosDelete;
  global.dosExists = dosExists;

  // Small convenience: expose internal clipboard inspector (read-only)
  global.dosClipboardInfo = function () {
    if (!DOS_CLIPBOARD) return null;
    return { name: DOS_CLIPBOARD.name, device: DOS_CLIPBOARD.device, size: DOS_CLIPBOARD.size, createdAt: new Date(DOS_CLIPBOARD.createdAt) };
  };

  // Internal debug helpers (non-enumerable)
  try { Object.defineProperty(global, '__dos_internal', { value: { _backend_list, _backend_load, _backend_save, _backend_delete }, writable: false }); } catch (e) { /* ignore */ }

})(window);