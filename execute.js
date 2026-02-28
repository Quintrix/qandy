/**
 * execute.js
 *
 * High-level command parser and guest/runtime bootstrap for Qandy.
 *
 * Exports: window.execute
 *
 * Notes:
 * - This version avoids embedding a literal </script> sequence inside the outer script
 *   by splitting that token so the browser won't prematurely terminate the outer script.
 * - If you still see syntax errors after replacing this file, clear the browser cache or
 *   load with a version query (execute.js?v=2).
 */
(function (global) {
  'use strict';

  var defaultConfig = {
    guestUrl: null,            // if null => use sandboxed srcdoc runner; else URL string for guest runtime page
    guestOrigin: '*',          // expected origin of guest messages; use exact origin in production
    sandboxed: true,           // use sandboxed iframe when guestUrl is null
    rs232: (global.rs232 || null),
    createHidden: true         // when true, guest iframe is display:none
  };

  var cfg = Object.assign({}, defaultConfig);
  var guestFrame = null;
  var guestReady = false;

  function log() { if (console && console.log) console.log.apply(console, arguments); }

  // Build a safe srcdoc string without an inline "</script>" token.
  function _guestSrcdoc() {
    var pieces = [];
    pieces.push('<!doctype html><html><head><meta charset="utf-8"></head><body>');
    pieces.push('<script>');
    pieces.push('(function(){');
    pieces.push('  function post(type,payload){ parent.postMessage({ __qandy:true, type:type, payload: payload }, \"*\"); }');
    pieces.push('  // notify host we are ready');
    pieces.push('  post(\"guest.ready\", {});');
    pieces.push('  window.addEventListener(\"message\", async function(ev){');
    pieces.push('    var m = ev.data; if(!m||!m.__qandy) return; ');
    pieces.push('    if (m.type === \"host.req\") {');
    pieces.push('      var p = m.payload || {}; var id = p.id; var method = p.method; var args = p.args || [];');
    pieces.push('      try {');
    pieces.push('        if (method === \"exec\") {');
    pieces.push('          var code = args[0] || \"\";');
    pieces.push('          var print = function(t){ parent.postMessage({ __qandy:true, type: \"guest.print\", payload: String(t) }, \"*\"); };');
    pieces.push('          var rs232proxy = function(cmd){');
    pieces.push('            return new Promise(function(resolve, reject){');
    pieces.push('              var rid = Math.floor(Math.random()*1e9);');
    pieces.push('              function onMsg(e){ var mm = e.data; if(!mm||!mm.__qandy) return; if(mm.type===\"host.res\" && mm.payload && mm.payload.id===rid){ window.removeEventListener(\"message\", onMsg); if(mm.payload.ok) resolve(mm.payload.result); else reject(new Error(mm.payload.error||\"guest-rs232-error\")); } }');
    pieces.push('              window.addEventListener(\"message\", onMsg);');
    pieces.push('              parent.postMessage({ __qandy:true, type: \"guest.req\", payload: { id: rid, method: (cmd && cmd.method) ? cmd.method : cmd, args: (cmd && cmd.args) ? cmd.args : [] } }, \"*\");');
    pieces.push('            });');
    pieces.push('          };');
    pieces.push('          try {');
    pieces.push('            var fn = new Function(\"print\", \"rs232\", code);');
    pieces.push('            var result = fn(print, rs232proxy);');
    pieces.push('            if (result && typeof result.then === \"function\") result = await result;');
    pieces.push('            parent.postMessage({ __qandy:true, type: \"guest.res\", payload: { id:id, ok:true, result: result } }, \"*\");');
    pieces.push('          } catch (err) {');
    pieces.push('            parent.postMessage({ __qandy:true, type: \"guest.res\", payload: { id:id, ok:false, error: String(err) } }, \"*\");');
    pieces.push('          }');
    pieces.push('        } else if (method === \"loadScriptText\") {');
    pieces.push('          try { (new Function(args[0] || \"\"))(); parent.postMessage({ __qandy:true, type: \"guest.res\", payload: { id: p.id, ok:true, result:true } }, \"*\"); } catch(e){ parent.postMessage({ __qandy:true, type: \"guest.res\", payload: { id: p.id, ok:false, error: String(e) } }, \"*\"); }');
    pieces.push('        } else {');
    pieces.push('          parent.postMessage({ __qandy:true, type: \"guest.res\", payload: { id:id, ok:false, error: \"unknown-method\" } }, \"*\");');
    pieces.push('        }');
    pieces.push('      } catch (err) {');
    pieces.push('        parent.postMessage({ __qandy:true, type: \"guest.res\", payload: { id:id, ok:false, error: String(err) } }, \"*\");');
    pieces.push('      }');
    pieces.push('    }');
    pieces.push('  });');
    pieces.push('})();');
    // avoid literal "</script>" by splitting the token
    pieces.push('</' + 'script>');
    pieces.push('</body></html>');
    return pieces.join('');
  }

  // Create guest iframe and wait for guest.ready via postMessage
  function createGuestIframe() {
    return new Promise(function (resolve, reject) {
      if (guestFrame && guestReady) return resolve(guestFrame);

      guestReady = false;

      guestFrame = document.createElement('iframe');
      guestFrame.sandbox = cfg.sandboxed ? 'allow-scripts' : '';
      if (cfg.createHidden) guestFrame.style.display = 'none';

      if (cfg.guestUrl) {
        guestFrame.src = cfg.guestUrl;
      } else {
        guestFrame.srcdoc = _guestSrcdoc();
      }

      function onMessage(ev) {
        var m = ev.data;
        if (!m || typeof m !== 'object' || !m.__qandy) return;
        if (cfg.guestOrigin && cfg.guestOrigin !== '*' && ev.origin !== cfg.guestOrigin) {
          return;
        }
        if (m.type === 'guest.ready') {
          guestReady = true;
          window.removeEventListener('message', onMessage);
          // connect rs232 if available
          try {
            if (cfg.rs232 && typeof cfg.rs232.connectGuest === 'function') {
              cfg.rs232.connectGuest(guestFrame.contentWindow, cfg.guestOrigin || '*');
            } else if (global.rs232 && typeof global.rs232.connectGuest === 'function') {
              global.rs232.connectGuest(guestFrame.contentWindow, cfg.guestOrigin || '*');
            }
          } catch (e) {
            log('execute.createGuestIframe: rs232.connectGuest failed', e);
          }
          setTimeout(function () { resolve(guestFrame); }, 0);
        } else if (m.type === 'guest.print') {
          if (typeof global.print === 'function') global.print(String(m.payload) + '\n'); else log('GUEST:', m.payload);
        }
      }

      window.addEventListener('message', onMessage, false);
      document.body.appendChild(guestFrame);

      // fallback: if guest never posts ready, connect after timeout
      setTimeout(function () {
        if (!guestReady) {
          window.removeEventListener('message', onMessage);
          try {
            if (cfg.rs232 && typeof cfg.rs232.connectGuest === 'function') {
              cfg.rs232.connectGuest(guestFrame.contentWindow, cfg.guestOrigin || '*');
            } else if (global.rs232 && typeof global.rs232.connectGuest === 'function') {
              global.rs232.connectGuest(guestFrame.contentWindow, cfg.guestOrigin || '*');
            }
          } catch (e) {}
          guestReady = true;
          resolve(guestFrame);
        }
      }, 4000);
    });
  }

function createGuestIframe() {
  return new Promise(function (resolve, reject) {
    if (guestFrame && guestReady) return resolve(guestFrame);

    guestReady = false;

    guestFrame = document.createElement('iframe');
    guestFrame.sandbox = cfg.sandboxed ? 'allow-scripts' : '';
    if (cfg.createHidden) guestFrame.style.display = 'none';

    if (cfg.guestUrl) {
      guestFrame.src = cfg.guestUrl;
    } else {
      guestFrame.srcdoc = _guestSrcdoc();
    }

    function onMessage(ev) {
      var m = ev.data;
      if (!m || typeof m !== 'object' || !m.__qandy) return;
      if (cfg.guestOrigin && cfg.guestOrigin !== '*' && ev.origin !== cfg.guestOrigin) {
        return;
      }

      if (m.type === 'guest.ready') {
        guestReady = true;
        window.removeEventListener('message', onMessage);

        // Ensure Qandy screen is initialized so print() has its buffers available
        try {
          if (typeof cls === 'function') {
            // use cls() to initialize display buffers
            cls();
            console.log('[execute] cls() called to initialize screen');
          } else if (typeof clearScreen === 'function') {
            clearScreen();
            console.log('[execute] clearScreen() called to initialize screen');
          }
        } catch (e) {
          console.warn('[execute] screen init failed', e);
        }

        // connect rs232 if available
        try {
          if (cfg.rs232 && typeof cfg.rs232.connectGuest === 'function') {
            cfg.rs232.connectGuest(guestFrame.contentWindow, cfg.guestOrigin || '*');
          } else if (global.rs232 && typeof global.rs232.connectGuest === 'function') {
            global.rs232.connectGuest(guestFrame.contentWindow, cfg.guestOrigin || '*');
          }
          console.log('[execute] rs232.connectGuest() invoked');
        } catch (e) {
          log('execute.createGuestIframe: rs232.connectGuest failed', e);
        }

        // small defer then resolve
        setTimeout(function () { resolve(guestFrame); }, 0);
        return;
      }

      // guest.print handler: print to Qandy and refresh UI
      if (m.type === 'guest.print') {
        try {
          var txt = String(m.payload || '');
          if (typeof global.print === 'function') {
            global.print(txt + '\n');
          } else {
            console.log('GUEST:', txt);
          }
          // Ask Qandy to refresh the display if possible
          if (typeof pokeRefresh === 'function') {
            try { pokeRefresh(); } catch (e) { console.warn('pokeRefresh failed', e); }
          }
          console.log('[guest.print]', txt);
        } catch (e) {
          console.warn('guest.print handler error', e);
        }
      }
    }

    window.addEventListener('message', onMessage, false);
    document.body.appendChild(guestFrame);

    // fallback: if guest never posts ready, connect after timeout
    setTimeout(function () {
      if (!guestReady) {
        window.removeEventListener('message', onMessage);
        try {
          if (cfg.rs232 && typeof cfg.rs232.connectGuest === 'function') {
            cfg.rs232.connectGuest(guestFrame.contentWindow, cfg.guestOrigin || '*');
          } else if (global.rs232 && typeof global.rs232.connectGuest === 'function') {
            global.rs232.connectGuest(guestFrame.contentWindow, cfg.guestOrigin || '*');
          }
        } catch (e) {}
        guestReady = true;
        resolve(guestFrame);
      }
    }, 4000);
  });
}


  async function execInGuest(code, opts) {
    opts = opts || {};
    if (!guestFrame) await createGuestIframe();
    if (cfg.rs232 && typeof cfg.rs232.sendRequest === 'function') {
      return cfg.rs232.sendRequest('exec', [code], opts);
    } else {
      return new Promise(function (resolve, reject) {
        var id = Math.floor(Math.random() * 1e9);
        function onMsg(ev) {
          var m = ev.data;
          if (!m || !m.__qandy) return;
          if (m.type === 'guest.res' && m.payload && m.payload.id === id) {
            window.removeEventListener('message', onMsg);
            if (m.payload.ok) resolve(m.payload.result); else reject(new Error(m.payload.error || 'guest error'));
          } else if (m.type === 'guest.print') {
            if (typeof global.print === 'function') global.print(String(m.payload) + '\n'); else log('GUEST:', m.payload);
          }
        }
        window.addEventListener('message', onMsg);
        try {
          guestFrame.contentWindow.postMessage({ __qandy: true, type: 'host.req', payload: { id: id, method: 'exec', args: [code] } }, cfg.guestOrigin || '*');
        } catch (e) {
          window.removeEventListener('message', onMsg);
          reject(e);
        }
      });
    }
  }

// Replace the existing loadScriptIntoGuest (and add helpers) with this code.

async function _fetchText(url) {
  // fetch with same-origin credentials by default
  var res = await fetch(url, { credentials: 'same-origin' });
  if (!res.ok) throw new Error('fetch failed: ' + res.status);
  return await res.text();
}
// Normalize device path and detect prefixes.
// Accept forms:
//   "qandy:ascii.js"            -> { device: 'qandy', filename: 'ascii.js' }
//   "device://qandy/ascii.js"   -> { device: 'qandy', filename: 'ascii.js' }
//   "ascii.js"                  -> { device: null, filename: 'ascii.js' }
//   "https://..."               -> { url: 'https://...' }
function _parseScriptSpecifier(spec) {
  if (!spec) return { filename: '' };
  spec = String(spec || '').trim();
  // absolute URL?
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(spec)) return { url: spec };

  // device://dev/path or device:filename
  var m = spec.match(/^(?:device:\/\/)?([A-Za-z0-9_\-]+)\/(.+)$/);
  if (m) return { device: m[1], filename: m[2] };

  m = spec.match(/^([A-Za-z0-9_\-]+)\:(.+)$/);
  if (m) return { device: m[1], filename: m[2] };

  // no device specified
  return { device: null, filename: spec };
}

// Try to load the script text from a device using dosLoad.
// Resolution policy:
//  - If device provided: try dosLoad(device + ':' + filename) or try dosLoad(filename) after switching context if your dosLoad expects a device param.
//  - If no device provided: try dosLoad(filename) which should use global.DEVICE (host dos implementation).
// This function should return the text or null if not found.
async function loadFromDeviceMaybe(parsed) {
  // If no dosLoad present we can't read from device
  if (typeof dosLoad !== 'function') return null;

  try {
    // If explicit device was given, try a couple of canonical forms.
    if (parsed.device) {
      // Form 1: "device:filename"
      try {
        var name1 = parsed.device + ':' + parsed.filename;
        var t1 = await dosLoad(name1);
        if (t1 !== null && typeof t1 !== 'undefined') return String(t1);
      } catch (e) { /* ignore */ }

      // Form 2: some dosLoad implementations expect separate context; try a file path like "device/filename" or just filename
      try {
        var name2 = parsed.device + '/' + parsed.filename;
        var t2 = await dosLoad(name2);
        if (t2 !== null && typeof t2 !== 'undefined') return String(t2);
      } catch (e) { /* ignore */ }

      // Form 3: maybe the device needs to be mounted as global.DEVICE — attempt temporary mount if dosMount exists
      try {
        if (typeof dosMount === 'function') {
          // Attempt to mount/ensure device (this may prompt user; wrap in try/catch)
          try { await dosMount(parsed.device); } catch (e) {}
        }
        // Try plain filename now (assuming dosLoad consults global.DEVICE)
        var t3 = await dosLoad(parsed.filename);
        if (t3 !== null && typeof t3 !== 'undefined') return String(t3);
      } catch (e) { /* ignore */ }
      return null;
    }

    // No explicit device: try the filename using current device or global.DEVICE
    try {
      var t = await dosLoad(parsed.filename);
      if (t !== null && typeof t !== 'undefined') return String(t);
    } catch (e) { /* ignore */ }

    // Maybe the system device (read-only packaged) is available under a reserved name 'qandy'
    try {
      var sysName = 'qandy:' + parsed.filename;
      var ts = await dosLoad(sysName);
      if (ts !== null && typeof ts !== 'undefined') return String(ts);
    } catch (e) { /* ignore */ }

    return null;
  } catch (err) {
    return null;
  }
}

// New loadScriptIntoGuest that tries device first, then network fetch
async function loadScriptIntoGuest(spec, opts) {
  opts = opts || {};
  var parsed = _parseScriptSpecifier(spec);

  // 1) if parsed.url, always fetch from network
  if (parsed.url) {
    var txt = await _fetchText(parsed.url);
    // deliver to guest as before
    if (cfg.rs232 && typeof cfg.rs232.sendRequest === 'function') {
      return cfg.rs232.sendRequest('loadScriptText', [txt], opts);
    }
    // fallback direct postMessage branch (existing behavior)
    return new Promise(function (resolve, reject) {
      var id = Math.floor(Math.random() * 1e9);
      function onMsg(ev) {
        var m = ev.data;
        if (!m || !m.__qandy) return;
        if (m.type === 'guest.res' && m.payload && m.payload.id === id) {
          window.removeEventListener('message', onMsg);
          if (m.payload.ok) resolve(m.payload.result); else reject(new Error(m.payload.error || 'guest error'));
        }
      }
      window.addEventListener('message', onMsg);
      try {
        guestFrame.contentWindow.postMessage({ __qandy: true, type: 'host.req', payload: { id: id, method: 'loadScriptText', args: [txt] } }, cfg.guestOrigin || '*');
      } catch (e) { window.removeEventListener('message', onMsg); reject(e); }
    });
  }

  // 2) Try device load
  var deviceText = null;
  try {
    deviceText = await loadFromDeviceMaybe(parsed);
  } catch (e) {
    deviceText = null;
  }

  if (deviceText !== null) {
    // optional: audit/log where it came from
    try { if (typeof cfg.rs232 === 'object' && typeof cfg.rs232.auditLog === 'function') cfg.rs232.auditLog('loadScript.device', { spec: spec }); } catch (e) {}
    // send to guest the same way as fetched text
    if (cfg.rs232 && typeof cfg.rs232.sendRequest === 'function') {
      return cfg.rs232.sendRequest('loadScriptText', [deviceText], opts);
    } else {
      // existing fallback
      return new Promise(function (resolve, reject) {
        var id = Math.floor(Math.random() * 1e9);
        function onMsg(ev) {
          var m = ev.data;
          if (!m || !m.__qandy) return;
          if (m.type === 'guest.res' && m.payload && m.payload.id === id) {
            window.removeEventListener('message', onMsg);
            if (m.payload.ok) resolve(m.payload.result); else reject(new Error(m.payload.error || 'guest error'));
          }
        }
        window.addEventListener('message', onMsg);
        try {
          guestFrame.contentWindow.postMessage({ __qandy: true, type: 'host.req', payload: { id: id, method: 'loadScriptText', args: [deviceText] } }, cfg.guestOrigin || '*');
        } catch (e) { window.removeEventListener('message', onMsg); reject(e); }
      });
    }
  }

  // 3) fallback: fetch from network using specified filename as a relative URL
  // construct a relative URL: if spec doesn't include slash, treat as root relative or same directory
  var urlCandidate = spec;
  try {
    var txt = await _fetchText(urlCandidate);
    if (cfg.rs232 && typeof cfg.rs232.sendRequest === 'function') {
      return cfg.rs232.sendRequest('loadScriptText', [txt], opts);
    } else {
      // fallback direct postMessage as above
      return new Promise(function (resolve, reject) {
        var id = Math.floor(Math.random() * 1e9);
        function onMsg(ev) {
          var m = ev.data;
          if (!m || !m.__qandy) return;
          if (m.type === 'guest.res' && m.payload && m.payload.id === id) {
            window.removeEventListener('message', onMsg);
            if (m.payload.ok) resolve(m.payload.result); else reject(new Error(m.payload.error || 'guest error'));
          }
        }
        window.addEventListener('message', onMsg);
        try {
          guestFrame.contentWindow.postMessage({ __qandy: true, type: 'host.req', payload: { id: id, method: 'loadScriptText', args: [txt] } }, cfg.guestOrigin || '*');
        } catch (e) { window.removeEventListener('message', onMsg); reject(e); }
      });
    }
  } catch (e) {
    throw new Error('script not found on device or network: ' + spec + ' (' + e.message + ')');
  }
}







  async function handleSystemCommand(lineOrParts) {
    if (typeof global.executeSystemCommand === 'function') {
      try {
        return await global.executeSystemCommand(lineOrParts);
      } catch (e) {
        return { ok: false, error: String(e) };
      }
    }
    try {
      var str = (typeof lineOrParts === 'string') ? lineOrParts.trim() : '';
      if (!str) return { ok: false, error: 'empty' };
      if (/^cls$/i.test(str)) {
        if (typeof global.cls === 'function') { global.cls(); return { ok: true, result: 'cleared' }; }
        if (typeof global.initScreen === 'function') { global.initScreen(); return { ok: true, result: 'cleared' }; }
        return { ok: false, error: 'no-cls' };
      }
      var m = str.match(/^([A-Za-z]+)(?:\s+(.*))?$/);
      if (m) {
        var word = m[1];
        var rest = m[2] || '';
        var SYS_WORDS = ['dosList','list','dosSave','dosLoad','dosDelete','dosMount','dosUpload','dosDownload'];
        if (SYS_WORDS.indexOf(word) !== -1 || ['list','cls'].indexOf(word) !== -1) {
          if (typeof global[word] === 'function') {
            var args = rest ? rest.split(/\s+/) : [];
            try {
              var res = await global[word].apply(null, args);
              return { ok: true, result: res };
            } catch (e) {
              return { ok: false, error: String(e) };
            }
          }
        }
      }
      return { ok: false, error: 'unknown-system-cmd' };
    } catch (e) {
      return { ok: false, error: String(e) };
    }
  }

  async function executeLine(line) {
    line = String(line || '').trim();
    if (!line) return;
    var lower = line.toLowerCase();
    if (lower.endsWith('.js')) {
      var url = line;
      try {
        await loadScriptIntoGuest(url);
        return;
      } catch (e) {
        throw new Error('loadScript failed: ' + String(e));
      }
    }
    var sysMatch = line.match(/^([A-Za-z]+)(?:\s+(.*))?$/);
    if (sysMatch) {
      var word = sysMatch[1];
      var rest = sysMatch[2] || '';
      var SYS_WORDS = ['cls','list','dosList','dosSave','dosLoad','dosDelete','dosMount','dosUpload','dosDownload'];
      if (SYS_WORDS.indexOf(word) !== -1) {
        var res = await handleSystemCommand(line);
        if (!res.ok) throw new Error(res.error || 'system-cmd-failed');
        if (res.result && typeof res.result === 'string') {
          if (typeof global.print === 'function') global.print(res.result + '\n'); else log(res.result);
        }
        return;
      }
    }
    try {
      await execInGuest(line);
      return;
    } catch (e) {
      throw e;
    }
  }

  async function shutdown() {
    try {
      if (cfg.rs232 && typeof cfg.rs232.disconnectGuest === 'function') {
        try { cfg.rs232.disconnectGuest(); } catch (e) {}
      } else if (global.rs232 && typeof global.rs232.disconnectGuest === 'function') {
        try { global.rs232.disconnectGuest(); } catch (e) {}
      }
    } catch (e) {}
    try { if (guestFrame && guestFrame.parentNode) guestFrame.parentNode.removeChild(guestFrame); } catch (e) {}
    guestFrame = null;
    guestReady = false;
  }

  function init(options) {
    options = options || {};
    cfg.guestUrl = typeof options.guestUrl === 'string' ? options.guestUrl : cfg.guestUrl;
    cfg.guestOrigin = typeof options.guestOrigin === 'string' ? options.guestOrigin : cfg.guestOrigin;
    cfg.sandboxed = options.sandboxed === false ? false : true;
    cfg.rs232 = options.rs232 || (global.rs232 || null);
    cfg.createHidden = options.createHidden !== undefined ? !!options.createHidden : cfg.createHidden;
    return cfg;
  }

  var api = {
    init: init,
    createGuestIframe: createGuestIframe,
    execInGuest: execInGuest,
    loadScriptIntoGuest: loadScriptIntoGuest,
    executeLine: executeLine,
    shutdown: shutdown,
    config: cfg
  };

  try { global.execute = api; } catch (e) { console.warn('execute export failed', e); }

})(window);