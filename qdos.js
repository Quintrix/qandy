/**
 * qdos.js — DOS operations for both HOST and GUEST environments
 *
 * The guest iframe runs in a sandboxed blob: URL and cannot directly access
 * the host's localStorage.  Every DOS operation is routed through
 * window.parent.postMessage() as a 'guest-action' request and the host
 * replies with an 'action-result' message containing the result.
 *
 * Wrapper functions (work transparently on HOST and GUEST):
 *   hostScript(name)        — load and execute a .js script file
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
 *
 * Simple relay functions (never return objects — only strings or booleans):
 *   localLoad(file)         — returns file contents string or error message
 *   localSave(file, text)   — saves text to file; returns true or error message
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

  // Pending response map for dos-response messages: reqId -> { handler, timer }
  var _dosResPending = Object.create(null);

  // Listen for dos-response messages from the host (used by localLoad / localSave)
  global.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || typeof d !== 'object') return;
    if (d.type !== 'dos-response') return;
    var id = d.id;
    if (!id || !_dosResPending[id]) return;
    var entry = _dosResPending[id];
    clearTimeout(entry.timer);
    delete _dosResPending[id];
    entry.handler(d);
  }, false);

  // _sendDosMessage(type, payload, timeoutMs, handler) — send a simple relay message and call
  // handler(d) with the dos-response.  Never rejects; the handler is responsible
  // for calling resolve with a string or boolean.
  function _sendDosMessage(type, payload, timeoutMs, handler) {
    return new Promise(function (resolve) {
      if (!global.parent || global.parent === global) {
        return resolve(type + ': no host parent frame available');
      }
      var id = _nextId();
      var msg = { type: type, id: id };
      if (payload) {
        var keys = Object.keys(payload);
        for (var i = 0; i < keys.length; i++) msg[keys[i]] = payload[keys[i]];
      }
      var timer = setTimeout(function () {
        delete _dosResPending[id];
        resolve(type + ': timeout waiting for host response');
      }, timeoutMs || 8000);
      _dosResPending[id] = {
        handler: function (d) { handler(d, resolve); },
        timer: timer
      };
      try {
        global.parent.postMessage(msg, '*');
      } catch (e) {
        clearTimeout(timer);
        delete _dosResPending[id];
        resolve(String(e));
      }
    });
  }

  // localLoad(file) — returns Promise resolving to file contents string or error message
  function localLoad(file) {
    return _sendDosMessage('dosLoad', { file: file }, 8000, function (d, resolve) {
      if (d.success) {
        resolve(d.data !== undefined && d.data !== null ? String(d.data) : '');
      } else {
        resolve(String(d.error || 'localLoad: operation failed'));
      }
    });
  }

  // localSave(file, text) — returns Promise resolving to true or error message string
  function localSave(file, text) {
    return _sendDosMessage('dosSave', { file: file, data: (text == null ? '' : String(text)) }, 8000, function (d, resolve) {
      if (d.success) {
        resolve(true);
      } else {
        resolve(String(d.error || 'localSave: operation failed'));
      }
    });
  }

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

  // hostScript(name) — load and execute a named .js script on both HOST and GUEST.
  // On HOST (no parent frame): injects a <script> element directly.
  // On GUEST (sandboxed iframe): requests the script content from the host via
  // postMessage('request-script') and evaluates the response inline.
  function hostScript(name) {
    if (!name || typeof name !== 'string') return;
    name = name.trim();
    if (!/^[A-Za-z0-9.\-]+\.js$/i.test(name)) return;
    if (/^[.\-]/.test(name) || /[.\-]$/.test(name)) return;
    if (/\.\./.test(name)) return;
    if (name.length > 16) return;

    if (!window.parent || window.parent === window) {
      // HOST: inject script tag directly
      try {
        var prg = document.createElement('script');
        prg.src = name;
        prg.onerror = function() { try { global.print('File Error\n'); } catch (e) {} };
        document.head.appendChild(prg);
      } catch (e) {
        try { global.print('Error inserting script: ' + String(e) + '\n'); } catch (ee) {}
      }
    } else {
      // GUEST: request script content from host via postMessage
      var scriptName = name;
      var _scriptResponseHandler = function(ev) {
        if (ev.source !== window.parent) return;
        var d = ev.data || {};
        if (d && d.type === 'script-response' && d.id === scriptName) {
          clearTimeout(_scriptTimer);
          window.removeEventListener('message', _scriptResponseHandler);
          if (!d.success) {
            try { global.print((d.error || 'Error loading script') + '\n'); } catch (e) {}
          } else {
            try {
              // eslint-disable-next-line no-eval
              (0, eval)(String(d.content) + '\n//# sourceURL=' + scriptName);
            } catch (e) {
              try { global.print('Error running ' + scriptName + ': ' + String(e) + '\n'); } catch (ee) {}
            }
          }
        }
      };
      var _scriptTimer = setTimeout(function() {
        window.removeEventListener('message', _scriptResponseHandler);
        try { global.print('Timeout loading: ' + scriptName + '\n'); } catch (e) {}
      }, 10000);
      window.addEventListener('message', _scriptResponseHandler, false);
      try {
        window.parent.postMessage({ type: 'request-script', id: scriptName, name: scriptName }, '*');
      } catch (e) {
        clearTimeout(_scriptTimer);
        window.removeEventListener('message', _scriptResponseHandler);
        try { global.print('Error requesting script: ' + String(e) + '\n'); } catch (ee) {}
      }
    }
  }

  // Expose to global
  global.dosMount    = dosMount;
  global.dosList     = dosList;
  global.dosSave     = dosSave;
  global.dosLoad     = dosLoad;
  global.dosDelete   = dosDelete;
  global.dosExists   = dosExists;
  global.dosRename   = dosRename;
  global.dosType     = dosType;
  global.dosFormat   = dosFormat;
  global.localLoad   = localLoad;
  global.localSave   = localSave;
  global.hostScript  = hostScript;

}(window));