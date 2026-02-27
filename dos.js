// Qandy DOS - dos.js
// User-facing global commands (promise-returning):
//   mount(device)           -- set or show current DEVICE
//   format(data)            -- export/import device as JSON archive
//   save(name, data)        -- save (">name" prefix appends)
//   load(name)              -- load file content (string or null)
//   del(name) / delete(name) / rm(name)
//   ls() / dir()            -- newline-separated file list
//   exists(name)            -- boolean if file exists
//
// Devices supported: 'local', 'harddrive', 'upload', 'qandy', 'echo', 'none'
// - local:     localStorage, prefixed keys
// - harddrive: File System Access API (user must Approve via centered modal)
// - upload:    per-file browser upload/save dialogs (works everywhere)
// - qandy:     REST endpoint at QANDY_URL (override global.QANDY_URL)
// - echo:      ephemeral in-memory map
// - none:      noop
//
// Filenames: max 255 bytes UTF-8, allowed chars: A-Z a-z 0-9 space (trimmed),
//   -_.()+=  (dot not allowed as first character)
// Data: plain UTF-8 text (use base64 for binary).
//
// This implementation keeps emulator UI (the harddrive approval modal) separate
// from the Qandy display (it injects a small centered DOM dialog).

(function (global) {
  'use strict';

  if (global.dos && global.dos._installed) return;
  // Public active device name
  global.DEVICE = global.DEVICE || 'local';

  // Config / prefixes
  var QANDY_URL = global.QANDY_URL || '/qandy/files';
  var LOCAL_PREFIX = 'qandy_file:';
  var LOCAL_MAN_KEY = 'qandy_manifest_local';
  var MAX_NAME_BYTES = 255;

  // In-memory state
  var localManifest = null;
  var echoStore = Object.create(null);
  var harddriveHandle = null; // DirectoryHandle from showDirectoryPicker (session only)

  // filename validation
  var VALID_NAME_RE = /^(?!\.)[A-Za-z0-9 \-_.()+=]+$/;
  function _utf8len(s) {
    try { return (new TextEncoder()).encode(String(s)).length; } catch (e) { return String(s).length; }
  }
  function _norm(name) { return (typeof name === 'string') ? name.trim() : String(name == null ? '' : name).trim(); }
  function _validate(name) {
    var n = _norm(name);
    if (!n) return { ok: false, reason: 'empty' };
    if (!_isByteOk(n)) return { ok: false, reason: 'too-long' };
    if (!VALID_NAME_RE.test(n)) return { ok: false, reason: 'invalid-chars-or-leading-dot' };
    return { ok: true, name: n };
  }
  function _isByteOk(name) { return _utf8len(name) <= MAX_NAME_BYTES; }

  // manifest helpers
  function _loadLocalManifest() {
    if (localManifest !== null) return Promise.resolve(localManifest);
    try {
      var raw = localStorage.getItem(LOCAL_MAN_KEY);
      if (raw) localManifest = JSON.parse(raw);
      else {
        localManifest = [];
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(LOCAL_PREFIX) === 0) localManifest.push(k.substring(LOCAL_PREFIX.length));
        }
        try { localStorage.setItem(LOCAL_MAN_KEY, JSON.stringify(localManifest)); } catch (e) {}
      }
    } catch (e) { localManifest = []; }
    return Promise.resolve(localManifest);
  }
  function _persistLocalManifest() {
    try { localStorage.setItem(LOCAL_MAN_KEY, JSON.stringify(localManifest || [])); } catch (e) {}
    return Promise.resolve();
  }

  // small helper to join lines
  function _joinLines(arr) { return (arr && arr.length) ? arr.join('\n') : ''; }

  // Qandy REST backend (simple)
  var qandyBackend = {
    list: async function () {
      var r = await fetch(QANDY_URL, { method: 'GET' });
      if (!r.ok) return [];
      return r.json();
    },
    load: async function (name) {
      var r = await fetch(QANDY_URL + '/' + encodeURIComponent(name));
      if (!r.ok) return null;
      return r.text();
    },
    save: async function (name, content) {
      var r = await fetch(QANDY_URL + '/' + encodeURIComponent(name), { method: 'PUT', body: String(content == null ? '' : content) });
      if (!r.ok) throw new Error('qandy save failed');
    },
    delete: async function (name) {
      var r = await fetch(QANDY_URL + '/' + encodeURIComponent(name), { method: 'DELETE' });
      if (!r.ok) throw new Error('qandy delete failed');
    }
  };

  // Harddrive FS API helpers (use window.showDirectoryPicker)
  async function _hd_list() {
    if (!harddriveHandle) return [];
    var out = [];
    try {
      for await (const [name, handle] of harddriveHandle.entries()) {
        if (handle.kind === 'file') out.push(name);
      }
    } catch (e) { /* ignore */ }
    return out;
  }
  async function _hd_load(name) {
    if (!harddriveHandle) return null;
    try {
      var fh = await harddriveHandle.getFileHandle(name, { create: false });
      var file = await fh.getFile();
      return await file.text();
    } catch (e) { return null; }
  }
  async function _hd_save(name, content) {
    if (!harddriveHandle) return Promise.reject(new Error('harddrive not mounted'));
    var fh = await harddriveHandle.getFileHandle(name, { create: true });
    var w = await fh.createWritable();
    await w.write(String(content == null ? '' : content));
    await w.close();
  }
  async function _hd_delete(name) {
    if (!harddriveHandle) return Promise.reject(new Error('harddrive not mounted'));
    try { await harddriveHandle.removeEntry(name); } catch (e) { /* ignore */ }
  }

  // Upload device helpers: per-file pick and save-as fallback
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
    // fallback input element
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

  async function _upload_saveFileAs(name, content) {
    // prefer showSaveFilePicker if available
    if (typeof window.showSaveFilePicker === 'function') {
      try {
        var opts = { suggestedName: name };
        var handle = await window.showSaveFilePicker(opts);
        var w = await handle.createWritable();
        await w.write(String(content == null ? '' : content));
        await w.close();
        return;
      } catch (e) {
        // fall through to anchor download
      }
    }
    // anchor download fallback
    var blob = new Blob([String(content == null ? '' : content)], { type: 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  // Back-end dispatchers
  async function _backend_list(device) {
    device = device || global.DEVICE;
    switch (device) {
      case 'local': await _loadLocalManifest(); return (localManifest || []).slice();
      case 'echo': return Object.keys(echoStore).slice();
      case 'none': return [];
      case 'harddrive': return await _hd_list();
      case 'upload': return []; // upload device has no persistent manifest
      case 'qandy': return await qandyBackend.list();
      default: return [];
    }
  }
  async function _backend_load(device, name) {
    device = device || global.DEVICE;
    switch (device) {
      case 'local': return (localStorage.getItem(LOCAL_PREFIX + name) === null) ? null : String(localStorage.getItem(LOCAL_PREFIX + name));
      case 'echo': return echoStore.hasOwnProperty(name) ? echoStore[name] : null;
      case 'none': return null;
      case 'harddrive': return await _hd_load(name);
      case 'upload': {
        var picked = await _upload_pickFile();
        return picked ? picked.text : null;
      }
      case 'qandy': return await qandyBackend.load(name);
      default: return null;
    }
  }
  async function _backend_save(device, name, content) {
    device = device || global.DEVICE;
    switch (device) {
      case 'local':
        try {
          localStorage.setItem(LOCAL_PREFIX + name, String(content == null ? '' : content));
          if (!localManifest) localManifest = [];
          if (localManifest.indexOf(name) === -1) localManifest.push(name);
          _persistLocalManifest();
          return;
        } catch (e) { throw e; }
      case 'echo':
        echoStore[name] = String(content == null ? '' : content);
        return;
      case 'none':
        return;
      case 'harddrive':
        return await _hd_save(name, content);
      case 'upload':
        return await _upload_saveFileAs(name, content);
      case 'qandy':
        return await qandyBackend.save(name, content);
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
          if (localManifest) { var i = localManifest.indexOf(name); if (i !== -1) { localManifest.splice(i, 1); _persistLocalManifest(); } }
        } catch (e) {}
        return;
      case 'echo':
        delete echoStore[name];
        return;
      case 'none':
        return;
      case 'harddrive':
        return await _hd_delete(name);
      case 'upload':
        // nothing to delete for per-file upload device
        return;
      case 'qandy':
        return await qandyBackend.delete(name);
      default:
        return;
    }
  }

  // Centered modal for harddrive approval (emulator overlay)
  function _showHarddriveApprovalModal() {
    return new Promise(function (resolve) {
      // create overlay
      var overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.left = '0';
      overlay.style.top = '0';
      overlay.style.right = '0';
      overlay.style.bottom = '0';
      overlay.style.background = 'rgba(0,0,0,0.4)';
      overlay.style.zIndex = 10000;
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';

      var box = document.createElement('div');
      box.style.background = '#fff';
      box.style.color = '#000';
      box.style.padding = '16px';
      box.style.borderRadius = '6px';
      box.style.minWidth = '300px';
      box.style.maxWidth = '80%';
      box.style.boxShadow = '0 4px 14px rgba(0,0,0,0.4)';
      box.style.fontFamily = 'monospace';
      box.style.fontSize = '14px';
      box.style.textAlign = 'center';

      var msg = document.createElement('div');
      msg.textContent = 'Grant qandy.js access to hard drive?';
      msg.style.marginBottom = '12px';
      box.appendChild(msg);

      var info = document.createElement('div');
      info.textContent = 'Approve to choose a folder the emulator can read/write for this session.';
      info.style.fontSize = '12px';
      info.style.color = '#333';
      info.style.marginBottom = '12px';
      box.appendChild(info);

      var btnRow = document.createElement('div');
      btnRow.style.display = 'flex';
      btnRow.style.justifyContent = 'center';
      btnRow.style.gap = '8px';

      var cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.padding = '6px 10px';
      var acceptBtn = document.createElement('button');
      acceptBtn.textContent = 'Approve';
      acceptBtn.style.padding = '6px 10px';

      btnRow.appendChild(cancelBtn);
      btnRow.appendChild(acceptBtn);
      box.appendChild(btnRow);
      overlay.appendChild(box);
      document.body.appendChild(overlay);

      function cleanup() { try { document.body.removeChild(overlay); } catch (e) { } }

      cancelBtn.onclick = function () { cleanup(); resolve(false); };
      acceptBtn.onclick = function () { cleanup(); resolve(true); };

      // Focus accept by default for keyboard users
      acceptBtn.focus();
    });
  }

  // Export/import format: JSON archive { device, created, files: {name:content, ...} }
  async function format(data) {
    var dev = global.DEVICE || 'local';
    if (typeof data === 'undefined') {
      var files = {};
      var list = await _backend_list(dev);
      for (var i = 0; i < list.length; i++) {
        var n = list[i];
        try { var c = await _backend_load(dev, n); files[n] = (c === null ? null : String(c)); } catch (e) { files[n] = null; }
      }
      return JSON.stringify({ device: dev, created: (new Date()).toISOString(), files: files });
    } else {
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
        var v = _validate(nm);
        if (!v.ok) continue;
        await _backend_save(dev, v.name, val == null ? '' : String(val));
      }
      return Promise.resolve(true);
    }
  }

  // mount(device) - if omitted returns current device; validates supported devices
  async function mount(device) {
    if (typeof device === 'undefined' || device === null || String(device).trim() === '') return Promise.resolve(global.DEVICE || 'none');

    if (typeof device !== 'string') return Promise.reject(new Error('device must be string'));
    device = device.trim();
    if (!device) return Promise.reject(new Error('device required'));

    var SUPPORTED = ['local', 'harddrive', 'upload', 'qandy', 'echo', 'none'];
    if (SUPPORTED.indexOf(device) === -1) return Promise.reject(new Error('unsupported device: ' + device));

    // special handling for harddrive: prompt user (centered modal) and then call showDirectoryPicker
    if (device === 'harddrive') {
      // If we already have a handle, accept and set DEVICE
      if (harddriveHandle) {
        global.DEVICE = 'harddrive';
        return Promise.resolve('harddrive');
      }
      // show emulator modal; if approved, call native picker
      var ok = await _showHarddriveApprovalModal();
      if (!ok) return Promise.reject(new Error('user denied harddrive permission'));
      if (typeof window.showDirectoryPicker !== 'function') return Promise.reject(new Error('File System Access API not available'));
      try {
        harddriveHandle = await window.showDirectoryPicker();
        global.DEVICE = 'harddrive';
        return Promise.resolve('harddrive');
      } catch (e) {
        harddriveHandle = null;
        return Promise.reject(e);
      }
    }

    // otherwise just set device
    global.DEVICE = device;
    return Promise.resolve(device);
  }

  // save(name,data) - '>' prefix for append
  async function save(name, data) {
    if (typeof name !== 'string' || name.length === 0) return Promise.reject(new Error('save: name required'));
    var append = false;
    if (name.charAt(0) === '>') { append = true; name = name.substring(1); }
    var v = _validate(name);
    if (!v.ok) return Promise.reject(new Error('save: invalid filename (' + v.reason + ')'));
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

  // load(name)
  async function load(name) {
    if (typeof name !== 'string' || name.length === 0) return Promise.reject(new Error('load: name required'));
    var v = _validate(name);
    if (!v.ok) return Promise.reject(new Error('load: invalid filename (' + v.reason + ')'));
    var dev = global.DEVICE || 'local';

    // For harddrive device, if no handle present, ask the user modal and picker (so mount() not strictly required)
    if (dev === 'harddrive' && !harddriveHandle) {
      try {
        var ok = await _showHarddriveApprovalModal();
        if (!ok) return Promise.resolve(null); // user cancelled
        if (typeof window.showDirectoryPicker !== 'function') return Promise.resolve(null);
        harddriveHandle = await window.showDirectoryPicker();
      } catch (e) {
        harddriveHandle = null;
        return Promise.resolve(null);
      }
    }

    // If device is upload, open file picker and return user's chosen file
    if (dev === 'upload') {
      var picked = await _upload_pickFile();
      return picked ? picked.text : null;
    }

    // default dispatch
    return await _backend_load(dev, v.name);
  }

  // delete/del/rm
  async function _delImpl(name) {
    if (typeof name !== 'string' || name.length === 0) return Promise.reject(new Error('del: name required'));
    var v = _validate(name);
    if (!v.ok) return Promise.reject(new Error('del: invalid filename (' + v.reason + ')'));
    var dev = global.DEVICE || 'local';
    await _backend_delete(dev, v.name);
    return Promise.resolve(true);
  }
  var del = _delImpl;
  var deleteFn = _delImpl;
  var rm = _delImpl;

  // ls/dir
  async function ls() {
    var dev = global.DEVICE || 'local';
    var arr = await _backend_list(dev);
    return _joinLines(arr);
  }
  var dir = ls;

  // exists(name)
  async function exists(name) {
    if (typeof name !== 'string' || name.length === 0) return Promise.resolve(false);
    var v = _validate(name);
    if (!v.ok) return Promise.resolve(false);
    var dev = global.DEVICE || 'local';
    var arr = await _backend_list(dev);
    return arr.indexOf(v.name) !== -1;
  }

  // Expose globals
  global.mount = mount;
  global.format = format;
  global.save = save;
  global.load = load;
  global.del = del;
  global["delete"] = deleteFn;
  global.rm = rm;
  global.ls = ls;
  global.dir = dir;
  global.exists = exists;

  // expose some internals for debugging (optional)
  global.dos = global.dos || {};
  global.dos._installed = true;
  global.dos._internal = {
    _backend_list: _backend_list,
    _backend_load: _backend_load,
    _backend_save: _backend_save,
    _backend_delete: _backend_delete,
    _validate: _validate,
    _setHarddriveHandle: function (h) { harddriveHandle = h; }
  };

  // default device remains whatever DEVICE was set (default 'local')
  global.DEVICE = global.DEVICE || 'local';

})(window);