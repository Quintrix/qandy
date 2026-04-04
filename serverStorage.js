
//
// ──── serverStorage.js ───────────────────────────────────────────────────────────────
// Clean JavaScript API for qandyland.js server interaction.
// Provides server* functions as window globals for scripts to use directly,
// and exposes qdosServer* wrappers (moved from qandy-command.js) for reference.
//

(function (global) {
  'use strict';

  // ── Internal helpers (self-contained copies; originals are private in qandy-dos.js) ──

  var ROOT_SEG = '/';
  var MAX_NAME_BYTES = 255;
  var VALID_NAME_RE = /^(?!\\.)[A-Za-z0-9 \-_.()+=!]+$/;

  function _utf8len(s) {
    try { return (new TextEncoder()).encode(String(s)).length; } catch (e) { return String(s).length; }
  }

  function _normName(n) {
    return (typeof n === 'string') ? n.trim() : String(n == null ? '' : n).trim();
  }

  function _baseName(name) {
    var n = _normName(name);
    var lastSlash = n.lastIndexOf('/');
    if (lastSlash >= 0) n = n.substring(lastSlash + 1);
    if (n.charAt(0) === '_') n = n.substring(1);
    if (n.length > 0 && n.charAt(n.length - 1) === '!') n = n.substring(0, n.length - 1);
    return n;
  }

  function _validateBase(name) {
    var n = _normName(name);
    if (!n) return { ok: false, reason: 'empty filename' };
    if (!VALID_NAME_RE.test(n)) return { ok: false, reason: 'invalid characters in filename' };
    if (_utf8len(n) > MAX_NAME_BYTES) return { ok: false, reason: 'filename exceeds 255 bytes' };
    return { ok: true, name: n };
  }

  function _timestamp() {
    var d = new Date();
    var p = function (n) { return String(n).padStart(2, '0'); };
    return '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate())
              + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  // ── Server storage state ──────────────────────────────────────────────────────────

  var _serverUrl = 'http://localhost:8080/qandyland.js';
  var _registryUrl = 'https://qandy.vercel.app/api/servers';
  var _serverCwd = ROOT_SEG;
  var _serverDrive = null;

  function getServerCwd() { return _serverCwd || ROOT_SEG; }
  function setServerCwd(p) {
    _serverCwd = (typeof p === 'string' && p.length) ? String(p) : ROOT_SEG;
  }

  // ── HTTP communication with qandyland.js server ───────────────────────────────────

  async function _serverRequest(method, params, timeoutMs) {
    var timeout = timeoutMs || 10000;
    var payload = {
      method: method,
      drive: _serverDrive,
      cwd: getServerCwd(),
      timestamp: _timestamp(),
      // Context: 'sysop' for the host machine, 'user' for the guest iframe.
      context: (typeof HOST !== 'undefined' && HOST) ? 'sysop' : 'user',
      // Owner label: the name of the currently running script (RUN= variable).
      owner: (typeof RUN !== 'undefined' && RUN) ? String(RUN) : ''
    };

    if (params && typeof params === 'object') {
      var keys = Object.keys(params);
      for (var i = 0; i < keys.length; i++) {
        payload[keys[i]] = params[keys[i]];
      }
    }

    try {
      var response = await fetch(_serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout ? AbortSignal.timeout(timeout) : undefined
      });

      if (!response.ok) {
        return { success: false, error: 'Server responded with ' + response.status };
      }

      var result = await response.json();
      return result;
    } catch (e) {
      if (e.name === 'AbortError') {
        return { success: false, error: 'Request timeout' };
      }
      return { success: false, error: 'Network error: ' + (e.message || String(e)) };
    }
  }

  // ── Server storage functions ──────────────────────────────────────────────────────
  // Moved from qandy-dos.js. Exposed as window globals for script use and for
  // compatibility with message handlers during gradual migration to new API calls.

  global.serverCreate = async function(driveName, options) {
    return 'Error: Drive creation restricted to server administrator. Use the server console.';
  };

  global.serverMount = async function(driveName) {
    var name = _normName(driveName);
    if (!name) return 'Error: invalid drive name';

    var result = await _serverRequest('mount', { name: name });

    if (!result.success) {
      return 'Error: ' + (result.error || 'mount failed');
    }

    _serverDrive = name;
    _serverCwd = ROOT_SEG;

    return 'server://' + name + '/';
  };

  global.serverMkDir = async function(name, options) {
    if (!_serverDrive) return 'Error: no server drive mounted';

    var dirName = _normName(name);
    if (!dirName) return 'Error: invalid directory name';

    var fv = _validateBase(dirName);
    if (!fv.ok) return 'Error: ' + fv.reason;

    var result = await _serverRequest('mkdir', { name: dirName, options: options });

    if (!result.success) {
      return 'Error: ' + (result.error || 'mkdir failed');
    }

    return result.result || 'done';
  };

  global.serverChDir = async function(name, options) {
    if (!_serverDrive) return 'Error: no server drive mounted';

    var dirName = String(name || '').trim();

    if (!dirName) {
      return 'server://' + _serverDrive + getServerCwd();
    }

    var result = await _serverRequest('chdir', { name: dirName, options: options });

    if (!result.success) {
      return 'Error: ' + (result.error || 'chdir failed');
    }

    if (result.cwd) {
      setServerCwd(result.cwd);
    }

    return 'server://' + _serverDrive + getServerCwd();
  };

  global.serverRmDir = async function(name, options) {
    if (!_serverDrive) return 'Error: no server drive mounted';

    var dirName = _normName(name);
    if (!dirName) return 'Error: invalid directory name';

    var fv = _validateBase(dirName);
    if (!fv.ok) return 'Error: ' + fv.reason;

    var result = await _serverRequest('rmdir', { name: dirName, options: options });

    if (!result.success) {
      return 'Error: ' + (result.error || 'rmdir failed');
    }

    return result.result || 'done';
  };

  global.serverSave = async function(name, data) {
    if (!_serverDrive) return 'Error: no server drive mounted';

    var fname = _normName(name);
    if (!fname) return 'Error: invalid filename';

    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return 'Error: ' + fv.reason;

    var content = String(data == null ? '' : data);

    var result = await _serverRequest('save', {
      name: fname,
      content: content,
      size: _utf8len(content)
    });

    if (!result.success) {
      return 'Error: ' + (result.error || 'save failed');
    }

    return result.result || true;
  };

  global.serverLoad = async function(name) {
    if (!_serverDrive) return 'Error: no server drive mounted';

    var fname = _normName(name);
    if (!fname) return 'Error: invalid filename';

    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return null;

    var result = await _serverRequest('load', { name: fname });

    if (!result.success) {
      if (result.error && result.error.indexOf('not found') !== -1) {
        return null;
      }
      return 'Error: ' + (result.error || 'load failed');
    }

    return result.content || '';
  };

  global.serverDelete = async function(name) {
    if (!_serverDrive) return 'Error: no server drive mounted';

    var fname = _normName(name);
    if (!fname) return 'Error: invalid filename';

    var fbase = _baseName(fname);
    var fv = _validateBase(fbase);
    if (!fv.ok) return 'Error: ' + fv.reason;

    var result = await _serverRequest('delete', { name: fname });

    if (!result.success) {
      return 'Error: ' + (result.error || 'delete failed');
    }

    return result.result || 'done';
  };

  global.serverRename = async function(name, dest) {
    if (!_serverDrive) return 'Error: no server drive mounted';

    var fname = _normName(name);
    var dname = _normName(dest);

    if (!fname || !dname) return 'Error: invalid filename';

    var fv = _validateBase(_baseName(fname));
    var dv = _validateBase(_baseName(dname));
    if (!fv.ok) return 'Error: ' + fv.reason;
    if (!dv.ok) return 'Error: invalid destination: ' + dv.reason;

    var result = await _serverRequest('rename', { name: fname, dest: dname });

    if (!result.success) {
      return 'Error: ' + (result.error || 'rename failed');
    }

    return result.result || 'done';
  };

  global.serverExists = async function(name) {
    if (!_serverDrive) return false;

    var fname = _normName(name);
    if (!fname) return false;

    var fv = _validateBase(_baseName(fname));
    if (!fv.ok) return false;

    var result = await _serverRequest('exists', { name: fname });

    if (!result.success) {
      return false;
    }

    return Boolean(result.exists);
  };

  global.serverDir = async function(pattern, switches) {
    if (!_serverDrive) return 'Error: no server drive mounted';

    var result = await _serverRequest('dir', {
      pattern: pattern || '',
      switches: switches || ''
    });

    if (!result.success) {
      return 'Error: ' + (result.error || 'dir failed');
    }

    return result.listing || 'empty\n';
  };

  global.serverList = async function(pattern) {
    if (!_serverDrive) return 'Error: no server drive mounted';

    var result = await _serverRequest('list', { pattern: pattern || '' });

    if (!result.success) {
      return 'Error: ' + (result.error || 'list failed');
    }

    return result.listing || '';
  };

  global.serverSetUrl = function(url) {
    if (typeof url === 'string' && url.trim()) {
      _serverUrl = url.trim();
      return _serverUrl;
    }
    return _serverUrl;
  };

  global.serverSetRegistry = function(url) {
    if (typeof url === 'string' && url.trim()) {
      _registryUrl = url.trim();
      return _registryUrl;
    }
    return _registryUrl;
  };

  global.serverDiscovery = async function() {
    var url = _registryUrl;
    if (!url) return 'Error: no registry URL configured';
    try {
      var response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        return 'Error: registry responded with ' + response.status;
      }
      var data = await response.json();
      if (!data.success) {
        return 'Error: ' + (data.error || 'registry request failed');
      }
      var list = data.servers || [];
      if (list.length === 0) return 'No servers available\n';
      var out = 'Available Servers:\n';
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        var drives = (s.drives && s.drives.length) ? s.drives.join(',') : 'none';
        out += '- ' + s.name + ' (' + s.host + ':' + s.port + ')' +
               ' - ' + drives + '\n';
      }
      return out;
    } catch (e) {
      return 'Error: ' + (e.message || String(e));
    }
  };

  global.serverConnect = async function(serverName) {
    var url = _registryUrl;
    if (!url) return 'Error: no registry URL configured';
    try {
      var response = await fetch(url, { method: 'GET' });
      if (!response.ok) {
        return 'Error: registry responded with ' + response.status;
      }
      var data = await response.json();
      if (!data.success) {
        return 'Error: ' + (data.error || 'registry request failed');
      }
      var list = data.servers || [];
      if (!serverName || !String(serverName).trim()) {
        if (list.length === 0) return 'No servers available\n';
        var out = 'Available Servers:\n';
        for (var i = 0; i < list.length; i++) {
          var s = list[i];
          var drives = (s.drives && s.drives.length) ? s.drives.join(',') : 'none';
          out += '- ' + s.name + ' (' + s.host + ':' + s.port + ')' +
                 ' - ' + drives + '\n';
        }
        return out;
      }
      var target = String(serverName).trim().toLowerCase();
      var found = null;
      for (var i = 0; i < list.length; i++) {
        if (list[i].name && list[i].name.toLowerCase() === target) {
          found = list[i];
          break;
        }
      }
      if (!found) return 'Error: server "' + serverName + '" not found\n';
      var proto = 'http';
      try { proto = new URL(_registryUrl).protocol.replace(':', ''); } catch (e) {}
      _serverUrl = proto + '://' + found.host + ':' + found.port + '/qandyland.js';
      return 'Connected to ' + found.name + ' at ' + found.host + ':' + found.port + '\n';
    } catch (e) {
      return 'Error: ' + (e.message || String(e));
    }
  };

  global.serverStatus = function() {
    var info = {
      serverUrl:   _serverUrl,
      registryUrl: _registryUrl,
      drive:       _serverDrive,
      cwd:         getServerCwd(),
      path:        _serverDrive ? ('server://' + _serverDrive + getServerCwd()) : 'none'
    };
    var out = 'Server Status:\n';
    out += '  URL:      ' + info.serverUrl + '\n';
    out += '  Registry: ' + info.registryUrl + '\n';
    out += '  Drive:    ' + (info.drive || 'none') + '\n';
    out += '  Path:     ' + info.path + '\n';
    return out;
  };

  global.serverInfo = function() {
    return {
      url: _serverUrl,
      drive: _serverDrive,
      cwd: getServerCwd(),
      path: _serverDrive ? ('server://' + _serverDrive + getServerCwd()) : 'none'
    };
  };

  global.serverDrives = async function() {
    var url = _registryUrl;
    if (!url) return 'Error: no registry URL configured';
    try {
      var response = await fetch(url, { method: 'GET' });
      if (!response.ok) return 'Error: registry responded with ' + response.status;
      var data = await response.json();
      if (!data.success) return 'Error: ' + (data.error || 'registry request failed');
      var list = data.servers || [];
      var out = 'Available drives:\n';
      var found = false;
      var _regProto = 'http';
      try { _regProto = new URL(_registryUrl).protocol.replace(':', ''); } catch (e) {}
      for (var i = 0; i < list.length; i++) {
        var s = list[i];
        var sUrl = _regProto + '://' + s.host + ':' + s.port + '/qandyland.js';
        if (sUrl === _serverUrl) {
          var drives = s.drives || [];
          if (drives.length === 0) { out += '  (no drives)\n'; }
          else {
            for (var j = 0; j < drives.length; j++) { out += '  - ' + drives[j] + '\n'; }
          }
          found = true;
          break;
        }
      }
      if (!found) out += '  (server not found in registry)\n';
      return out;
    } catch (e) {
      return 'Error: ' + (e.message || String(e));
    }
  };

  // ── qdosServer* wrappers ──────────────────────────────────────────────────────────
  // Moved from qandy-command.js for reference.
  // HOST: calls server* functions above directly.
  // GUEST: sends message to host message handler via qdosXmitDos.

  function _qdosServerValidateDrive(name) {
    if (typeof name !== 'string' && typeof name !== 'number') return null;
    var s = String(name).trim();
    if (!s || s.length > 64) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
    return s;
  }

  function _qdosNormalizeResult(res) {
    if (typeof window._normalizeResult === 'function') return window._normalizeResult(res);
    if (Array.isArray(res)) return res.join('\n');
    if (res === null || res === undefined) return '';
    if (typeof res === 'object') { try { return JSON.stringify(res); } catch (e) { return String(res); } }
    return String(res);
  }

  function _qdosXmit(command, params, timeoutMs) {
    if (typeof window.qdosXmitDos === 'function') return window.qdosXmitDos(command, params, timeoutMs);
    return Promise.reject(new Error('qdosXmitDos not available - ensure qandy-command.js is loaded'));
  }

  function _qdosValidateFilename(name) {
    if (typeof window.qdosValidateFilename === 'function') return window.qdosValidateFilename(name);
    if (typeof name !== 'string' && typeof name !== 'number') return null;
    var s = String(name).trim();
    if (!s || s.length > 128) return null;
    if (/[\/\\]/.test(s) || /\.\./.test(s)) return null;
    if (!/^[A-Za-z0-9 _.\-!]+$/.test(s)) return null;
    return s;
  }

  global.qdosServerCreate = async function(driveName, options) {
    return 'Error: Drive creation restricted to server administrator. Use the server console.\n';
  };

  global.qdosServerMount = async function(driveName) {
    var name = _qdosServerValidateDrive(driveName);
    if (!name) return 'Error: invalid drive name\n';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverMount(name);
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverMount', { name: name }).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerMkDir = async function(name, options) {
    var valid = _qdosValidateFilename(name);
    if (!valid) return 'Error: invalid directory name\n';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverMkDir(valid, options);
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverMkDir', { name: valid, options: options }).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerChDir = async function(name) {
    var valid = (name === '..' || name === '') ? (name || '') : _qdosValidateFilename(name);
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverChDir(valid || '');
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverChDir', { name: valid || '' }).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerRmDir = async function(name) {
    var valid = _qdosValidateFilename(name);
    if (!valid) return 'Error: invalid directory name\n';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverRmDir(valid);
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverRmDir', { name: valid }).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerSave = async function(filename, data) {
    var valid = _qdosValidateFilename(filename);
    if (!valid) return 'Error: invalid filename\n';
    var content = String(data == null ? '' : data);
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverSave(valid, content);
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverSave', { name: valid, content: content }).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerLoad = async function(filename, timeoutMs) {
    var valid = _qdosValidateFilename(filename);
    if (!valid) return Promise.reject(new Error('invalid filename'));
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverLoad(valid);
        return _qdosNormalizeResult(res);
      } catch (e) {
        return Promise.reject(new Error((e && e.message) ? e.message : String(e)));
      }
    }
    return _qdosXmit('serverLoad', { name: valid }, timeoutMs).then(function (result) {
      return _qdosNormalizeResult(result);
    });
  };

  global.qdosServerDelete = async function(filename) {
    var valid = _qdosValidateFilename(filename);
    if (!valid) return 'Error: invalid filename\n';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverDelete(valid);
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverDelete', { name: valid }).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerRename = async function(file, dest) {
    var validSrc = _qdosValidateFilename(file);
    var validDest = _qdosValidateFilename(dest);
    if (!validSrc || !validDest) return 'Error: invalid filename(s)\n';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverRename(validSrc, validDest);
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverRename', { name: validSrc, dest: validDest }).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerExists = async function(filename) {
    var valid = _qdosValidateFilename(filename);
    if (!valid) return false;
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverExists(valid);
        return !!res;
      } catch (e) {
        return false;
      }
    }
    return _qdosXmit('serverExists', { name: valid }).then(function (result) {
      if (typeof result === 'boolean') return result;
      if (typeof result === 'string') { var s = result.trim().toLowerCase(); return s === 'true' || s === '1'; }
      return !!result;
    }).catch(function () { return false; });
  };

  global.qdosServerDir = async function(pattern, switches) {
    var validPattern = (typeof pattern === 'string') ? pattern.trim() : '';
    var validSwitches = (typeof switches === 'string') ? switches.trim() : '';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverDir(validPattern, validSwitches);
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverDir', { pattern: validPattern, switches: validSwitches }).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerList = async function(pattern) {
    var validPattern = (typeof pattern === 'string') ? pattern.trim() : '';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverList(validPattern);
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverList', { pattern: validPattern }).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerDiscovery = async function() {
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverDiscovery();
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverDiscovery', {}).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerConnect = async function(serverName) {
    var name = (typeof serverName === 'string') ? serverName.trim() : '';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await global.serverConnect(name);
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverConnect', { name: name }).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerStatus = async function() {
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = (typeof global.serverStatus === 'function')
          ? global.serverStatus()
          : ((typeof global.serverInfo === 'function') ? JSON.stringify(global.serverInfo(), null, 2) : 'unavailable');
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverStatus', {}).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerInfo = async function() {
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = (typeof global.serverInfo === 'function') ? global.serverInfo() : 'unavailable';
        if (typeof res === 'object' && res !== null) {
          var out = 'Server Info:\n';
          out += '  URL:   ' + (res.url   || 'none') + '\n';
          out += '  Drive: ' + (res.drive || 'none') + '\n';
          out += '  Path:  ' + (res.path  || 'none') + '\n';
          return out;
        }
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverInfo', {}).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerDrives = async function() {
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = (typeof global.serverDrives === 'function') ? await global.serverDrives() : 'unavailable';
        return _qdosNormalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return _qdosXmit('serverDrives', {}).then(function (result) {
      return _qdosNormalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  };

  global.qdosServerSetUrl = async function(url) {
    var newUrl = (typeof url === 'string') ? url.trim() : '';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = (typeof global.serverSetUrl === 'function') ? global.serverSetUrl(newUrl) : newUrl;
        return _qdosNormalizeResult(res);
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e));
      }
    }
    return _qdosXmit('serverSetUrl', { url: newUrl }).then(function (result) {
      return _qdosNormalizeResult(result);
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e));
    });
  };

  // In GUEST mode, expose server* globals as aliases to qdosServer* wrappers
  // so scripts can call serverMount(), serverSave(), etc. directly.
  if (typeof GUEST !== 'undefined' && GUEST) {
    global.serverCreate = global.qdosServerCreate;
    global.serverMount = global.qdosServerMount;
    global.serverMkDir = global.qdosServerMkDir;
    global.serverChDir = global.qdosServerChDir;
    global.serverRmDir = global.qdosServerRmDir;
    global.serverSave = global.qdosServerSave;
    global.serverLoad = global.qdosServerLoad;
    global.serverDelete = global.qdosServerDelete;
    global.serverRename = global.qdosServerRename;
    global.serverExists = global.qdosServerExists;
    global.serverDir = global.qdosServerDir;
    global.serverList = global.qdosServerList;
    global.serverDiscovery = global.qdosServerDiscovery;
    global.serverConnect = global.qdosServerConnect;
    global.serverStatus = global.qdosServerStatus;
    global.serverSetUrl = global.qdosServerSetUrl;
    global.serverInfo = global.qdosServerInfo;
    global.serverDrives = global.qdosServerDrives;
  }

})(window);
