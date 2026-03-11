/**
 * qdos.js — DOS operations for both HOST and GUEST environments
 *
 * The guest iframe runs in a sandboxed blob: URL and cannot directly access
 * the host's localStorage.  Every DOS operation is routed through
 * window.parent.postMessage() as a 'guest-action' request and the host
 * replies with an 'action-result' message containing the result.
 *
 * Wrapper functions (work transparently on HOST and GUEST):
 *   qdosScript(filename)     — execute a .js file (HOST: inject tag, GUEST: postMessage)
 *   qdosDir()                — directory listing
 *   qdosMount(device)        — mount device (e.g. "local")
 *   qdosDelete(filename)     — delete a file
 *   qdosExists(filename)     — returns "true" or "false" string
 *   qdosRename(oldname, newname) — rename a file
 *   qdosType(filename)       — display file contents
 *   qdosLoad(filename)       — load and display file contents
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
        return reject(new Error('Error: no <host>'));
      }
      var id = _nextId();
      var msg = { type: 'guest-action', action: action, id: id };
      if (payload) {
        var keys = Object.keys(payload);
        for (var i = 0; i < keys.length; i++) msg[keys[i]] = payload[keys[i]];
      }
      var timer = setTimeout(function () {
        delete _pending[id];
        reject(new Error('Error: timeout ' + action));
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

  // ── qdos wrapper functions ────────────────────────────────────────────
  // Each function accepts the full command string, parses parameters
  // internally, and returns a Promise that resolves to a plain text string
  // (never an object).  Scripts resolve to boolean true on success.
  // Errors resolve to a string beginning with "Error:".
  //
  // Branching uses the global HOST variable (HOST=1 on host, HOST=0 on guest).

  // qdosScript(cmd) — execute a .js file.
  // HOST: injects a <script> element directly.
  // GUEST: requests the script content from the host via postMessage and evals it inline.
  function qdosScript(cmd) {
    var name = String(cmd || '').trim();
    if (!name) return Promise.resolve('Error: filename required');
    if (!/^[A-Za-z0-9.\-]+\.js$/i.test(name)) return Promise.resolve('Error: invalid filename');
    if (/^[.\-]/.test(name) || /[.\-]$/.test(name)) return Promise.resolve('Error: invalid filename');
    if (/\.\./.test(name)) return Promise.resolve('Error: invalid filename');
    if (name.length > 64) return Promise.resolve('Error: filename too long');

    return new Promise(function (resolve) {
      if (global.HOST) {
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

  async function qdosDir() {
    if (global.HOST) {
      if (typeof global.dosDir !== 'function') return 'Error: no dosDir()\n';
      try { return await dosDir(); } catch (e) { return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n'; }
    }
    return _sendDosAction('localDir').catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  //function qdosMount(device) {
  //  if (global.HOST) {
  //    if (typeof global.dosMount !== 'function') return Promise.resolve('Error: no dosMount()\n');
  //    print(await dosDir());
  //    return;
  //  }
  //  print(await localDir());
  //}

  // qdosDelete(file) — delete a file.
  // HOST: calls dosDelete(file) and returns result as string.
  // GUEST: calls localDelete(file) and returns result as string.
  function qdosDelete(file) {
    if (!file) return Promise.resolve('Error: filename required\n');
    if (global.HOST) {
      if (typeof global.dosDelete !== 'function') return Promise.resolve('Error: DOS not available\n');
      return Promise.resolve(global.dosDelete(file)).then(function (result) {
        return (typeof result === 'string') ? result + '\n' : result;
      }).catch(function (e) {
      var msg = (e && e.message ? e.message : String(e));
      return 'Error: ' + msg + '\n';
      });


    }
    return _sendDosAction('localDelete', { file: file }).then(function () {
      return 'Deleted: ' + file + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  // qdosExists(file) — check whether a file exists; resolves to "true" or "false".
  // HOST: calls dosExists(file) and returns result as string.
  // GUEST: calls localExists(file) and returns result as string.
  function qdosExists(file) {
    if (!file) return Promise.resolve('Error: filename required\n');
    if (global.HOST) {
      if (typeof global.dosExists !== 'function') return Promise.resolve('Error: DOS not available\n');
      return Promise.resolve(global.dosExists(file)).then(function (result) {
        return (result ? 'true' : 'false') + '\n';
      }).catch(function (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      });
    }
    return _sendDosAction('localExists', { file: file }).then(function (result) {
      return (result ? 'true' : 'false') + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  // qdosRename(src, dst) — rename a file.
  // HOST: calls dosRename(src, dst) and returns result as string.
  // GUEST: calls localRename(src, dst) and returns result as string.
  function qdosRename(src, dst) {
    if (!src || !dst) return Promise.resolve('Error: usage: rename <old> / <new>\n');
    if (global.HOST) {
      if (typeof global.dosRename !== 'function') return Promise.resolve('Error: DOS not available\n');
      return Promise.resolve(global.dosRename(src, dst)).then(function () {
        return 'Renamed: ' + src + ' -> ' + dst + '\n';
      }).catch(function (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      });
    }
    return _sendDosAction('localRename', { file: src, dest: dst }).then(function () {
      return 'Renamed: ' + src + ' -> ' + dst + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  // qdosType(file) — display the contents of a file.
  // HOST: calls dosLoad(file) and returns content as string.
  // GUEST: calls localLoad(file) and returns content as string.
  function qdosType(file) {
    if (!file) return Promise.resolve('Error: filename required\n');
    if (global.HOST) {
      if (typeof global.dosLoad !== 'function') return Promise.resolve('Error: DOS not available\n');
      return Promise.resolve(global.dosLoad(file)).then(function (content) {
        if (content === null || content === undefined) return 'Error: file not found\n';
        return String(content) + '\n';
      }).catch(function (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      });
    }
    return _sendDosAction('localLoad', { file: file }).then(function (content) {
      if (content === null || content === undefined) return 'Error: file not found\n';
      return String(content) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  // qdosLoad(file) — load and display file contents.
  // Delegates to qdosType with the filename directly.
  function qdosLoad(file) {
    return qdosType(file);
  }

  global.qdosScript  = qdosScript;
  global.qdosDir     = qdosDir;
  //global.qdosMount   = qdosMount;
  global.qdosDelete  = qdosDelete;
  global.qdosExists  = qdosExists;
  global.qdosRename  = qdosRename;
  global.qdosType    = qdosType;
  global.qdosLoad    = qdosLoad;

}(window));