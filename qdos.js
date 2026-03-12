var VALID_NAME_RE = /^(?!\.)[A-Za-z0-9 \-_.()+=]+$/;
var MAX_NAME_BYTES = 255;

function _utf8len(s) { try { return (new TextEncoder()).encode(String(s)).length; } catch (e) { return String(s).length; }}
function _normName(n) { return (typeof n === 'string') ? n.trim() : String(n == null ? '' : n).trim(); }
function _validateName(name) { var n = _normName(name); if (!n) return { ok: false, reason: 'empty' }; if (_utf8len(n) > MAX_NAME_BYTES) return { ok: false, reason: 'too-long' }; if (!VALID_NAME_RE.test(n)) return { ok: false, reason: 'invalid-chars-or-leading-dot' }; return { ok: true, name: n }; }
function _nextId() { _reqCounter += 1; return 'qdos_' + Date.now() + '_' + _reqCounter; }

var _pending = Object.create(null);
var _reqCounter = 0;

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
    if (!global.parent || global.parent === global) { return reject(new Error('Error: no <host>')); }
    var id = _nextId();
    var msg = { type: 'guest-action', action: action, id: id };
    if (payload) { var keys = Object.keys(payload); for (var i = 0; i < keys.length; i++) msg[keys[i]] = payload[keys[i]]; }
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

function qdosScript(cmd) {
  var name = String(cmd || '').trim();
  if (!name) return Promise.resolve('Error: filename required');
  if (!/^[A-Za-z0-9.\-]+\.js$/i.test(name)) return Promise.resolve('Error: invalid filename');
  if (/^[.\-]/.test(name) || /[.\-]$/.test(name)) return Promise.resolve('Error: invalid filename');
  if (/\.\./.test(name)) return Promise.resolve('Error: invalid filename');
  if (name.length > 64) return Promise.resolve('Error: filename too long');

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
    return;
  }
  // post message requesting script 
}

function qdosDir() {
  if (global.HOST) {
  	  dosDir();
  	  return;
  } 
  return _sendDosAction('localDir').then(function (result) {
    return String(result) + '\n';
  }).catch(function (e) {
    return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
  });
}

  function qdosMount(device) {
    if (global.HOST) {
      if (typeof global.dosMount !== 'function') { return 'Error: no dosMount()\n'; }
      print(dosMount(device)); return;
    }
    print("localhost");
  }

  function qdosDelete(file) {
    if (global.HOST) {
      if (typeof global.dosDelete !== 'function') { return 'Error: DOS not available\n'; }
      print(dosMount(device)); return;
    }
    return _sendDosAction('localDelete', { file: file }).then(function () {
      return 'done\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  function qdosExists(file) {
    if (!file) return Promise.resolve('Error: filename required\n');
    if (global.HOST) {
      if (typeof global.dosExists !== 'function') { return 'Error: no dosExists()\n'; }
     	return dosExists(file);
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
  // HOST: calls dosLoad(file) and returns content as string.
  // GUEST: requests localLoad from host via postMessage.
  function qdosLoad(file) {
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

  global.qdosScript  = qdosScript;
  global.qdosDir     = qdosDir;
  //global.qdosMount   = qdosMount;
  global.qdosDelete  = qdosDelete;
  global.qdosExists  = qdosExists;
  global.qdosRename  = qdosRename;
  global.qdosType    = qdosType;
  global.qdosLoad    = qdosLoad;

}(window));