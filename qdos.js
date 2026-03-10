/**
 * qdos.js — DOS operations for both HOST and GUEST environments
 *
 * The guest iframe runs in a sandboxed blob: URL and cannot directly access
 * the host's localStorage.  Every DOS operation is routed through
 * window.parent.postMessage() as a 'guest-action' request and the host
 * replies with an 'action-result' message containing the result.
 *
 * Wrapper functions (work transparently on HOST and GUEST):
 *   qdosScript(cmd)         — execute a .js file (HOST: inject tag, GUEST: postMessage)
 *   qdosDir(cmd)            — formatted directory listing
 *   qdosMount(cmd)          — mount device (e.g. "mount local")
 *   qdosDelete(cmd)         — delete a file (e.g. "delete foo.txt")
 *   qdosExists(cmd)         — returns "true" or "false" string
 *   qdosRename(cmd)         — rename (e.g. "rename old.txt / new.txt")
 *   qdosType(cmd)           — display file contents (e.g. "type foo.txt")
 *   qdosLoad(cmd)           — load and display file contents (e.g. "load foo.txt")
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

  // ── HOST/GUEST detection ───────────────────────────────────────────────
  // Returns true when running as the HOST (top-level page or HOST=1 is set).
  // Uses the global HOST variable when available; otherwise falls back to
  // checking whether this window has a parent frame.
  function _isHost() {
    if (typeof global.HOST !== 'undefined') return !!global.HOST;
    return !global.parent || global.parent === global;
  }

  // ── Formatting helpers for qdosDir ────────────────────────────────────

  // Format a yyyymmddhhmmss timestamp string.
  // Returns HH:MM:SS if the file is less than 24 h old, MM/DD/YYYY otherwise.
  function _formatTimestamp(ts) {
    if (!ts || ts.length < 14) return '';
    var yr = parseInt(ts.substr(0, 4), 10);
    var mo = parseInt(ts.substr(4, 2), 10);
    var dy = parseInt(ts.substr(6, 2), 10);
    var hh = parseInt(ts.substr(8, 2), 10);
    var mm = parseInt(ts.substr(10, 2), 10);
    var ss = parseInt(ts.substr(12, 2), 10);
    var fileDate = new Date(yr, mo - 1, dy, hh, mm, ss);
    var age = Date.now() - fileDate.getTime();
    if (age < 86400000) {
      return (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss;
    }
    return (mo < 10 ? '0' : '') + mo + '/' + (dy < 10 ? '0' : '') + dy + '/' + yr;
  }

  // Format a byte count as human-readable (e.g. "123b" or "456k").
  function _formatSize(size) {
    var n = parseInt(size, 10);
    if (isNaN(n)) return '';
    return n >= 1024 ? Math.round(n / 1024) + 'k' : n + 'b';
  }

  // Format a single dir.sys entry (name|size|timestamp) as two display lines.
  // Line 1: " <name padded to 30>   <size right-justified>"
  // Line 2: "                       <timestamp right-justified>"
  function _formatDirEntry(name, size, ts) {
    var sizeStr = _formatSize(size);
    var tsStr = _formatTimestamp(ts);
    var WIDTH = 38;
    var dispName = name.length > 30 ? name.substr(0, 30) : name;
    var line1 = ' ' + dispName;
    while (line1.length < WIDTH - sizeStr.length) line1 += ' ';
    line1 += sizeStr + '\n';
    var line2 = '';
    if (tsStr) {
      var pad = '';
      while (pad.length < WIDTH - tsStr.length) pad += ' ';
      line2 = pad + tsStr + '\n';
    }
    return line1 + line2;
  }

  // Format a complete dir.sys string (one "name|size|timestamp" per line).
  function _formatDirOutput(raw) {
    if (!raw || !raw.trim()) return ' (empty)\n';
    var lines = raw.trim().split('\n');
    var out = '';
    for (var i = 0; i < lines.length; i++) {
      var parts = lines[i].split('|');
      if (parts[0]) out += _formatDirEntry(parts[0], parts[1] || '', parts[2] || '');
    }
    return out || ' (empty)\n';
  }

  // ── Comprehensive qdos wrapper functions ──────────────────────────────
  // Each function accepts the full command string, parses parameters
  // internally, and returns a Promise that resolves to a plain text string
  // (never an object).  Scripts resolve to boolean true on success.
  // Errors resolve to a string beginning with "Error:".

  // Validate a .js script filename.  Returns null on success or an error string.
  function _validateScriptName(name) {
    if (!name) return 'Error: filename required';
    if (!/^[A-Za-z0-9.\-]+\.js$/i.test(name)) return 'Error: invalid filename';
    if (/^[.\-]/.test(name) || /[.\-]$/.test(name)) return 'Error: invalid filename';
    if (/\.\./.test(name)) return 'Error: invalid filename';
    if (name.length > 64) return 'Error: filename too long';
    return null;
  }

  // Convert a newline-separated list of bare filenames into dir.sys manifest format
  // (name||, with empty size and timestamp fields) for use with _formatDirOutput.
  function _normalizeListing(raw) {
    return (raw || '').split('\n').filter(Boolean).map(function (f) { return f + '||'; }).join('\n');
  }

  // qdosScript(cmd) — execute a .js file.
  // HOST: injects a <script> element directly.
  // GUEST: requests the script content from the host via postMessage and evals it inline.
  function qdosScript(cmd) {
    var name = String(cmd || '').trim();
    var err = _validateScriptName(name);
    if (err) return Promise.resolve(err);

    return new Promise(function (resolve) {
      if (_isHost()) {
        try {
          var prg = document.createElement('script');
          prg.src = name;
          prg.onload = function () { resolve(true); };
          prg.onerror = function () { resolve('Error: file not found'); };
          document.head.appendChild(prg);
        } catch (e) {
          resolve('Error: ' + String(e));
        }
      } else {
        var reqId = _nextId();
        var timer = setTimeout(function () {
          global.removeEventListener('message', handler);
          resolve('Error: timeout loading ' + name);
        }, 10000);
        function handler(ev) {
          if (ev.source !== global.parent) return;
          var d = ev.data || {};
          if (d.type === 'script-response' && d.id === name) {
            clearTimeout(timer);
            global.removeEventListener('message', handler);
            if (!d.success) {
              resolve(String(d.error || 'Error loading script'));
            } else {
              try {
                // eslint-disable-next-line no-eval
                (0, eval)(String(d.content) + '\n//# sourceURL=' + name);
                resolve(true);
              } catch (e) {
                resolve('Error: ' + String(e));
              }
            }
          }
        }
        global.addEventListener('message', handler, false);
        try {
          global.parent.postMessage({ type: 'request-script', id: name, name: name }, '*');
        } catch (e) {
          clearTimeout(timer);
          global.removeEventListener('message', handler);
          resolve('Error: ' + String(e));
        }
      }
    });
  }

  // qdosDir(cmd) — display formatted directory listing.
  // HOST: calls dosDir() / dosList() directly.
  // GUEST: fetches the file list via the dos-list guest-action.
  function qdosDir(cmd) {
    if (_isHost()) {
      var listFn = global.dosDir || global.dosList;
      if (typeof listFn !== 'function') return Promise.resolve('Error: DOS not available\n');
      return Promise.resolve(listFn()).then(function (raw) {
        if (global.dosList && !global.dosDir) {
          raw = _normalizeListing(raw);
        }
        return _formatDirOutput(raw || '');
      }).catch(function (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      });
    }
    return _sendDosAction('dos-list', {}).then(function (result) {
      return _formatDirOutput(_normalizeListing(result));
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  // qdosMount(cmd) — mount a device (e.g. "mount local").
  // HOST: calls dosMount() directly.
  // GUEST: always reports "localStorage" (the only device available to guests).
  function qdosMount(cmd) {
    var device = String(cmd || '').replace(/^mount\s*/i, '').trim() || null;
    if (_isHost()) {
      if (typeof global.dosMount !== 'function') return Promise.resolve('Error: DOS not available\n');
      return Promise.resolve(global.dosMount(device)).then(function (result) {
        return (result || 'local') + '\n';
      }).catch(function (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      });
    }
    return Promise.resolve('localStorage\n');
  }

  // qdosDelete(cmd) — delete a file (e.g. "delete foo.txt").
  function qdosDelete(cmd) {
    var file = String(cmd || '').replace(/^delete\s+/i, '').trim();
    if (!file) return Promise.resolve('Error: filename required\n');
    if (_isHost()) {
      if (typeof global.dosDelete !== 'function') return Promise.resolve('Error: DOS not available\n');
      return Promise.resolve(global.dosDelete(file)).then(function () {
        return 'Deleted: ' + file + '\n';
      }).catch(function (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      });
    }
    var v = _validateName(file);
    if (!v.ok) return Promise.resolve('Error: invalid filename (' + v.reason + ')\n');
    return _sendDosAction('dos-delete', { file: v.name }).then(function () {
      return 'Deleted: ' + file + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  // qdosExists(cmd) — check whether a file exists; resolves to "true" or "false".
  function qdosExists(cmd) {
    var file = String(cmd || '').replace(/^exists\s+/i, '').trim();
    if (!file) return Promise.resolve('Error: filename required\n');
    if (_isHost()) {
      if (typeof global.dosExists !== 'function') return Promise.resolve('Error: DOS not available\n');
      return Promise.resolve(global.dosExists(file)).then(function (result) {
        return (result ? 'true' : 'false') + '\n';
      }).catch(function (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      });
    }
    var v = _validateName(file);
    if (!v.ok) return Promise.resolve('Error: invalid filename (' + v.reason + ')\n');
    return _sendDosAction('dos-exists', { file: v.name }).then(function (result) {
      return (result ? 'true' : 'false') + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  // qdosRename(cmd) — rename a file (syntax: "rename old.txt / new.txt").
  function qdosRename(cmd) {
    var args = String(cmd || '').replace(/^rename\s+/i, '').trim();
    var parts = args.split(/\s*\/\s*/);
    var src = (parts[0] || '').trim();
    var dst = (parts[1] || '').trim();
    if (!src || !dst) return Promise.resolve('Error: usage: rename <old> / <new>\n');
    if (_isHost()) {
      if (typeof global.dosRename !== 'function') return Promise.resolve('Error: DOS not available\n');
      return Promise.resolve(global.dosRename(src, dst)).then(function () {
        return 'Renamed: ' + src + ' -> ' + dst + '\n';
      }).catch(function (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      });
    }
    var vsrc = _validateName(src);
    if (!vsrc.ok) return Promise.resolve('Error: invalid filename (' + vsrc.reason + ')\n');
    var vdst = _validateName(dst);
    if (!vdst.ok) return Promise.resolve('Error: invalid filename (' + vdst.reason + ')\n');
    return _sendDosAction('dos-rename', { file: vsrc.name, dest: vdst.name }).then(function () {
      return 'Renamed: ' + src + ' -> ' + dst + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  // qdosType(cmd) — display the contents of a file (e.g. "type foo.txt").
  function qdosType(cmd) {
    var file = String(cmd || '').replace(/^type\s+/i, '').trim();
    if (!file) return Promise.resolve('Error: filename required\n');
    if (_isHost()) {
      if (typeof global.dosLoad !== 'function') return Promise.resolve('Error: DOS not available\n');
      return Promise.resolve(global.dosLoad(file)).then(function (content) {
        if (content === null || content === undefined) return 'Error: file not found\n';
        return String(content) + '\n';
      }).catch(function (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      });
    }
    var v = _validateName(file);
    if (!v.ok) return Promise.resolve('Error: invalid filename (' + v.reason + ')\n');
    return _sendDosAction('dos-load', { file: v.name }).then(function (content) {
      if (content === null || content === undefined) return 'Error: file not found\n';
      return String(content) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  // qdosLoad(cmd) — load and display file contents (e.g. "load foo.txt").
  // Alias for qdosType with a different command prefix.
  function qdosLoad(cmd) {
    return qdosType(String(cmd || '').replace(/^load\s+/i, 'type '));
  }

  // Expose to global.  Guest-side dos* aliases are only installed when not
  // running as HOST so they do not shadow the real dos.js implementations.
  if (!_isHost()) {
    global.dosMount  = dosMount;
    global.dosList   = dosList;
    global.dosSave   = dosSave;
    global.dosLoad   = dosLoad;
    global.dosDelete = dosDelete;
    global.dosExists = dosExists;
    global.dosRename = dosRename;
    global.dosType   = dosType;
    global.dosFormat = dosFormat;
  }
  global.localLoad   = localLoad;
  global.localSave   = localSave;
  global.qdosScript  = qdosScript;
  global.qdosDir     = qdosDir;
  global.qdosMount   = qdosMount;
  global.qdosDelete  = qdosDelete;
  global.qdosExists  = qdosExists;
  global.qdosRename  = qdosRename;
  global.qdosType    = qdosType;
  global.qdosLoad    = qdosLoad;

}(window));