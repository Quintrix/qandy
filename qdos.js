/**
 * qdos.js — guest-side DOS operations
 *
 * The guest iframe runs in a sandboxed blob: URL and cannot directly access
 * the host's localStorage.  Every DOS operation is routed through
 * window.parent.postMessage() as a 'guest-action' request and the host
 * replies with an 'action-result' message containing the result.
 *
 * Exposed globals (all return Promises):
 *   dosMount(device)        — set/get the active device on the host
 *   dosList()               — newline-separated list of filenames
 *   dosSave(file, data)     — save file; '>' prefix appends
 *   dosLoad(file)           — returns file content string or null
 *   dosDelete(file)         — delete file
 *   dosExists(file)         — returns boolean
 *   dosRename(file, dest)   — rename file
 *   dosType(file)           — print file content via global print()
 *   dosFormat(data)         — export (no arg) or import (JSON/object) archive
 */

(function (global) {
  'use strict';

  var VALID_NAME_RE = /^(?!\.)[A-Za-z0-9 \-_.()+=]+$/;
  var MAX_NAME_BYTES = 255;

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

  // Pending response map: reqId -> { resolve, reject, timer }
  var _pending = Object.create(null);
  var _reqCounter = 0;

  function _nextId() {
    _reqCounter += 1;
    return 'qdos_' + Date.now() + '_' + _reqCounter;
  }

  // Listen for action-result messages from the host
  global.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.type !== 'action-result') return;
    var id = d.id;
    if (!id || !_pending[id]) return;
    var entry = _pending[id];
    clearTimeout(entry.timer);
    delete _pending[id];
    if (d.success) {
      entry.resolve(d.result !== undefined ? d.result : true);
    } else {
      entry.reject(new Error(d.error || 'DOS operation failed'));
    }
  }, false);

  // Send a guest-action message to the host and return a Promise for the result
  function _sendDosAction(action, payload, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!global.parent || global.parent === global) {
        return reject(new Error('qdos: no host parent frame available'));
      }
      var id = _nextId();
      var msg = { type: 'guest-action', action: action, id: id };
      if (payload) {
        var keys = Object.keys(payload);
        for (var i = 0; i < keys.length; i++) msg[keys[i]] = payload[keys[i]];
      }
      var timer = setTimeout(function () {
        delete _pending[id];
        reject(new Error('qdos: timeout waiting for host response to ' + action));
      }, timeoutMs || 8000);
      _pending[id] = { resolve: resolve, reject: reject, timer: timer };
      try {
        global.parent.postMessage(msg, '*');
      } catch (e) {
        clearTimeout(timer);
        delete _pending[id];
        reject(e);
      }
    });
  }

  // Public API -------------------------------------------------------

  // dosMount(device) — set/get active device on host
  function dosMount(device) {
    var dev = (device == null) ? undefined : String(device);
    return _sendDosAction('dos-mount', { device: dev });
  }

  // dosList() — newline-separated list of filenames
  function dosList() {
    return _sendDosAction('dos-list', {});
  }

  // dosSave(file, data) — save file; '>' prefix appends
  function dosSave(file, data) {
    if (typeof file !== 'string' || file.length === 0) return Promise.reject(new Error('dosSave: file required'));
    var append = false;
    var fname = file;
    if (fname.charAt(0) === '>') { append = true; fname = fname.substring(1); }
    var v = _validateName(fname);
    if (!v.ok) return Promise.reject(new Error('dosSave: invalid filename (' + v.reason + ')'));
    return _sendDosAction('dos-save', { file: v.name, data: (data == null ? '' : String(data)), append: append });
  }

  // dosLoad(file) — returns file content string or null
  function dosLoad(file) {
    if (typeof file !== 'string' || file.length === 0) return Promise.reject(new Error('dosLoad: file required'));
    var v = _validateName(file);
    if (!v.ok) return Promise.reject(new Error('dosLoad: invalid filename (' + v.reason + ')'));
    return _sendDosAction('dos-load', { file: v.name });
  }

  // dosDelete(file) — delete file
  function dosDelete(file) {
    if (typeof file !== 'string' || file.length === 0) return Promise.reject(new Error('dosDelete: file required'));
    var v = _validateName(file);
    if (!v.ok) return Promise.reject(new Error('dosDelete: invalid filename (' + v.reason + ')'));
    return _sendDosAction('dos-delete', { file: v.name });
  }

  // dosExists(file) — returns boolean
  function dosExists(file) {
    if (typeof file !== 'string' || file.length === 0) return Promise.resolve(false);
    var v = _validateName(file);
    if (!v.ok) return Promise.resolve(false);
    return _sendDosAction('dos-exists', { file: v.name });
  }

  // dosRename(file, dest) — rename file (error if dest already exists)
  function dosRename(file, dest) {
    if (typeof file !== 'string' || file.length === 0) return Promise.reject(new Error('dosRename: file required'));
    if (typeof dest !== 'string' || dest.length === 0) return Promise.reject(new Error('dosRename: dest required'));
    var vsrc = _validateName(file);
    if (!vsrc.ok) return Promise.reject(new Error('dosRename: invalid src (' + vsrc.reason + ')'));
    var vdst = _validateName(dest);
    if (!vdst.ok) return Promise.reject(new Error('dosRename: invalid dest (' + vdst.reason + ')'));
    return _sendDosAction('dos-rename', { file: vsrc.name, dest: vdst.name });
  }

  // dosType(file) — print file content to display
  function dosType(file) {
    return dosLoad(file).then(function (content) {
      if (content === null) throw new Error('dosType: file not found');
      if (typeof global.print === 'function') {
        global.print(String(content));
      } else {
        try {
          var el = document.getElementById('txt');
          if (el) el.textContent += String(content);
          else console.log(String(content));
        } catch (e) { console.log(String(content)); }
      }
      return true;
    });
  }

  // dosFormat(data) — export archive (no arg) or import archive (JSON/object)
  function dosFormat(data) {
    var payload = (typeof data === 'undefined') ? { data: null } : { data: data };
    return _sendDosAction('dos-format', payload, 15000);
  }

  // Expose to global
  global.dosMount  = dosMount;
  global.dosList   = dosList;
  global.dosSave   = dosSave;
  global.dosLoad   = dosLoad;
  global.dosDelete = dosDelete;
  global.dosExists = dosExists;
  global.dosRename = dosRename;
  global.dosType   = dosType;
  global.dosFormat = dosFormat;

}(window));