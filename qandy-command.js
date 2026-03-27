///
// ──── Qandy Command ──────────────────────────────────────────────────────────────────
//

function command_js() {
  window.command=async function(cmd) {
    if (RUN != "qandy.js") {
      print("\n");
      try { input(cmd); } catch (e) { /* ignore */ }
      // this needs testing AFTER run command works
      LINE = ""; CURP = 0; LINEX = CURX; LINEY = CURY;
      return;
    }
    // system commands
    print("\n");
    cmd=String(cmd || '').trim();
    switch (cmd) {
      case 'cls':
        cls(); return;
      case 'whoami':
        var context = HOST ? "HOST (sysop access)" : "GUEST (user sandbox)";
        print("\n"+context+"\n"); print("URL:"+window.location.href+"\n");
        print("localStorage: " + (typeof localStorage !== 'undefined' ? "yes" : "no") + "\n\n");
        return;
      case 'hostname':
        print("\nHOST=" + HOST + "\n");
        print("GUEST=" + GUEST + "\n");
        print("RUN=" + RUN + "\n");
        print("Parent is: " + (window.parent === window ? "self" : "parent iframe") + "\n\n");
        return;
      case 'sysop':
        if (GUEST) {
          try {
            window.parent.postMessage({ type: 'guest-action', action: 'sysop', success: true }, '*');
          } catch (e) {
            print("Error: " + String(e) + "\n");
          }
        }
        return;
      case 'user':
        if (HOST) {
          try {
            var hostEl = document.getElementById('txt');
            var hostKb = document.getElementById('host-keyboard');
            var guestKb = document.getElementById('guest-keyboard');
            var vm = document.getElementById('vm-container') || window._vmContainer || null;
            var iframe = document.getElementById('vm-iframe') || window._vmIframe || null;
            if (hostEl) { hostEl.style.display = 'none'; hostEl.style.visibility = 'hidden'; hostEl.style.pointerEvents = 'none'; }
            if (hostKb) { hostKb.style.display = 'none'; hostKb.style.visibility = 'hidden'; hostKb.style.pointerEvents = 'none'; }
            // Show guest container / iframe and bring it to front
            if (vm) {
              vm.style.display = 'block';
              vm.style.visibility = 'visible';
              vm.style.pointerEvents = 'auto';
              // ensure vm is above host
              try {
                vm.style.position = vm.style.position || 'absolute';
                vm.style.zIndex = String(Math.max(parseInt(vm.style.zIndex || 0, 10) || 100, 1000));
              } catch (e) {}
            }
            if (iframe) {
              iframe.style.display = 'block';
              iframe.style.visibility = 'visible';
              iframe.style.pointerEvents = 'auto';
              try { iframe.style.zIndex = vm && vm.style && vm.style.zIndex ? String(parseInt(vm.style.zIndex,10) + 1) : '1001'; } catch (e) {}
            }
            if (guestKb) {
              guestKb.style.display = 'block';
              guestKb.style.visibility = 'visible';
              guestKb.style.pointerEvents = 'auto';
              try {
                guestKb.style.position = guestKb.style.position || 'absolute';
                // put guest keyboard above vm-container
                var vmZ = vm && vm.style && vm.style.zIndex ? parseInt(vm.style.zIndex,10) : 1000;
                guestKb.style.zIndex = String(Math.max(parseInt(guestKb.style.zIndex || 0,10) || (vmZ + 1), vmZ + 1));
              } catch (e) {}
              break;
            }
            if (hostEl) { hostEl.style.pointerEvents = 'none'; }
            if (hostKb) { hostKb.style.pointerEvents = 'none'; hostKb.style.visibility = 'hidden'; }
            try {
              if (iframe) {
                iframe.setAttribute && iframe.setAttribute('tabindex', '0'); // make focusable
                try { iframe.focus(); } catch (e) { console.warn('iframe.focus failed', e); }
                try { if (iframe.contentWindow && typeof iframe.contentWindow.focus === 'function') iframe.contentWindow.focus(); } catch (e) { console.warn('iframe.contentWindow.focus failed', e); }
                try { 
                 break;     var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
                  if (doc && doc.body && typeof doc.body.focus === 'function') doc.body.focus();
                } catch (e) { /* cross-origin or not accessible; ignore */ }
                setTimeout(function() {
                  try { iframe.focus(); } catch (e) {}
                  try { if (iframe.contentWindow && typeof iframe.contentWindow.focus === 'function') iframe.contentWindow.focus(); } catch (e) {}
                }, 50);
              }
            } catch (errFocus) {
              console.warn('focus restore attempted but failed', errFocus);
            }
            console.log('Attempted to focus guest iframe; activeElement is:', document.activeElement);
          } catch (err) {
            console.error('focusGuestIframe failed', err);
          }
        }
        return;
        
      default:
        break;
    }

    // DOS commands — parameter extraction before calling qdos* wrappers.
    var parts=extractCmdParts(cmd);
    var c=parts.cmd.toLowerCase();
    var args=parts.args; // array of args

    var tokens = parseArgs(cmd);
    var c=(tokens[0] || '').toLowerCase();
    var args=tokens.slice(1); 
    var f = ''; var d = '';
    if (args.length > 0) {
      var slashIndex = args.findIndex(function(t) { return t === '='; });
      if (slashIndex !== -1) {
        f = args.slice(0, slashIndex).join(' ').trim();
        d = args.slice(slashIndex + 1).join(' ').trim();
      } else {
        if (args.length === 1 && args[0].indexOf('=') !== -1) {
          var parts = args[0].split('=');
          f = (parts.shift() || '').trim();
          d = parts.join('=').trim();
        } else {
          f = (args[0] || '').trim();
          d = (args[1] || '').trim();
        }
        f = f.replace(/\s+/g, ' ').trim();
        d = d.replace(/\s+/g, ' ').trim();
      }
    }
    
    f=f.replace(/\s+/g, ' ').trim();
    d=d.replace(/\s+/g, ' ').trim();

    if (c.endsWith('.js')) {
      if (HOST) {
        print("Input \'user\' to execute scripts");
        return;
      }
      var res = await qdosScript(c);
      if (res === true) {} else {
        print(String(res) + "\n");
      } 
      return;
    }

    switch (c) {
      case "dir":
        print(await qdosDir(f, d));
        return;
      case "list":
        print(await qdosList()); 
        return;
      case "ls": 
        print(await qdosList()); 
        return;
      case "load":
        print(await qdosLoad(f));
        return;
      case "delete":
        print(await qdosDelete(f)+"\n"); 
        return;
      case "del":
        print(await qdosDelete(f)+"\n");
        return;
      case "rm":
        print(await qdosDelete(f)+"\n");
        return;
      case "rename":
        print(await qdosRename(f,d)+"\n");
        return; 
      case "ren":
        print(await qdosRename(f,d)+"\n");
        return; 
      case "mount":
        print(await qdosMount(f)+"\n");
        return;
      case "qpaste":
        print(await qdosPaste(f)+"\n");
        return;
      case "qcopy":
        print(await qdosCopy(f)+"\n");
        return;
      case "mkdir":
        print(await qdosMkDir(f)+"\n");
        return;     
      case "md":
        print(await qdosMkDir(f)+"\n");
        return;     
      case "chdir":
        print(await qdosChDir(f)+"\n");
        return;     
      case "cd":
        print(await qdosChDir(f)+"\n");
        return;     
      case "rmdir":
        print(await qdosRmDir(f)+"\n");
        return;     
      case "rd":
        print(await qdosRmDir(f)+"\n");
        return;     
      case "exists":
        print(await qdosExists(f)+"\n");
        return;
      case "fdisk":
        if (HOST) {
          print(await dosfdisk()+"\n");
        } else {
          print("Input \'sysop\' for access\n");
        }
        return;
      default:
        if (GUEST) {
          evalCode(cmd);
          pokeCursorOn();
          LINE=""; CURP = 0;
          LINEX = CURX; LINEY = CURY;
          return;
        }
    }
  }

  function parseArgs(cmd) {
    var re = /"([^"]+)"|'([^']+)'|(\S+)/g; var m, out = [];
    while ((m = re.exec(String(cmd || ''))) !== null) { out.push(m[1] || m[2] || m[3]); }
    return out;
  }
  
  
  function extractCmdParts(cmd) {
    var tokens=parseArgs(String(cmd || '').trim());
    var c=tokens.length > 0 ? tokens[0] : '';
    var args=tokens.slice(1); // positional args
    return { cmd: c, args: args, rawTokens: tokens };
  }  

//
// ──── Qandy DOS Commands─────────────────────────────────────────────────────────────
//

  window.__qandy_pending = window.__qandy_pending || Object.create(null);
  window.__qandy_reqCounter = window.__qandy_reqCounter || 0;
  var _pending = window.__qandy_pending;

  async function qdosScript(name) {
    if (typeof HOST !== 'undefined' && HOST) { return "Error: input 'user' to run scripts"; }
    var nm = (typeof name === 'string') ? name.trim() : '';
    if (!nm) return "Error: invalid filename";
    function _isValid(n) {
      if (typeof validateSystemFilename === 'function') return !!validateSystemFilename(n);
      if (typeof n !== 'string') return false;
      if (n.length === 0 || n.length > 128) return false;
      if (n.indexOf('..') !== -1) return false;
      return /^[A-Za-z0-9 _.\-\/]+$/.test(n);
    }
    if (!_isValid(nm)) return "Error: invalid filename";
    var content;
    try {
      content = await qdosXmitDos('localLoad', { file: nm });
    } catch (e) {
      return "Error: load failed: " + ((e && e.message) ? e.message : String(e));
    }
    content = (content === null || typeof content === 'undefined') ? '' : String(content);
    // sanitize BOM / shebang
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    content = content.replace(/^\s*#!.*\r?\n/, '');
    // Eval the script in global scope via indirect eval and capture errors
    var evalError = null;
    try {
      (0, eval)(content + "\n\n//# sourceURL=" + nm);
      // success
      return true;
    } catch (e) {
      evalError = e;
      // Attempt to extract line/column from stack or error properties
      var line = null, column = null;
      try {
        var stack = e && e.stack ? String(e.stack) : '';
        if (stack) {
          var stackLines = stack.split('\n');
          for (var i = 0; i < stackLines.length; i++) {
            var sl = stackLines[i].trim();
            var m = sl.match(/:(\d+):(\d+)\)?\s*$/);
            if (m) { line = parseInt(m[1], 10); column = parseInt(m[2], 10); break; }
            m = sl.match(/\((?:.*):(\d+):(\d+)\)/);
            if (m) { line = parseInt(m[1], 10); column = parseInt(m[2], 10); break; }
          }
        }
        if (!line) {
          if (typeof e.lineNumber === 'number') line = e.lineNumber;
          else if (typeof e.lineno === 'number') line = e.lineno;
          if (typeof e.columnNumber === 'number') column = e.columnNumber;
          else if (typeof e.colno === 'number') column = e.colno;
        }
      } catch (ex) {
        /* ignore extraction errors */
      }

      var emsg = (e && e.message) ? e.message : String(e);
      var loc = (line ? (nm + ':' + line + (column ? (':' + column) : '')) : nm);
      return "Error: " + emsg + " at " + loc;
    }
  }

  async function qdosDir(pattern, switches) {
    var validPattern = (typeof pattern === 'string') ? pattern.trim() : '';
    var validSwitches = (typeof switches === 'string') ? switches.trim() : '';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return localDir(validPattern, validSwitches); });
        res = _normalizeResult(res);
        return String(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('localDir', { pattern: validPattern, switches: validSwitches }).then(function (result) {
      return String(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosList() {
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return dosList(); });
        res = _normalizeResult(res);
        return String(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
      return 'Error: DOS not available\n';
    }
    return qdosXmitDos('localList').then(function (result) {
      // result is already normalized to a string by the handler
      return String(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosLoad(filename, timeoutMs) {
    var valid = (typeof qdosValidateFilename === 'function') ? qdosValidateFilename(filename) :
                (typeof filename === 'string' ? filename.trim() : null);
    if (!valid) return Promise.reject(new Error('invalid filename'));
    if (typeof HOST !== 'undefined' && HOST) {
      var loader = (typeof localLoad === 'function') ? localLoad : (typeof dosLoad === 'function' ? dosLoad : null);
      if (!loader) return Promise.reject(new Error('Error: DOS not available'));
      try {
        var res = await Promise.resolve().then(function () { return loader(valid); });
        if (typeof _normalizeResult === 'function') res = _normalizeResult(res);
        else if (Array.isArray(res)) res = res.join('\n');
        else if (res === null || typeof res === 'undefined') res = '';
        else if (typeof res === 'object') {
          try { res = JSON.stringify(res); } catch (e) { res = String(res); }
        } else res = String(res);
        return res;
      } catch (e) {
        return Promise.reject(new Error((e && e.message) ? e.message : String(e)));
      }
    }
    return qdosXmitDos('localLoad', { file: valid }, timeoutMs).then(function (result) {
      if (typeof _normalizeResult === 'function') return _normalizeResult(result);
      if (result === null || typeof result === 'undefined') return '';
      if (typeof result === 'string') return result;
      try { return String(result); } catch (e) { return JSON.stringify(result); }
    });
  }

  async function qdosRename(file, dest, timeoutMs) {
    var validSrc = qdosValidateFilename(file); 
    var validDest = qdosValidateFilename(dest); 
    if (!validSrc || !validDest) return 'invalid filename(s)';
    if(HOST) { return "Input \'user\' to rename files"; } 
    return qdosXmitDos('localRename', { file: validSrc, dest: validDest }, timeoutMs)
      .then(function (result) {
        // resolution means host reported success; return true for convenience
        return result;
      })
      .catch(function (err) {
        // propagate error
       return err;
      });
  }

  async function qdosMount(device) {
    var dev = (typeof device === 'undefined' || device === null) ? '' : String(device).trim();
    if (dev === '') dev = 'localhost';
    if (typeof HOST !== 'undefined' && HOST) {
      if (typeof dosMount !== 'function') { return 'Error: dosMount not available\n'; }
      try {
        var res = await Promise.resolve().then(function () { return dosMount(dev); });
        var out = (typeof _normalizeResult === 'function') ? _normalizeResult(res) : (res === null || res === undefined ? '' : String(res));
        return String(out) + '\n';
      } catch (e) {
        return 'Error: ' + ((e && e.message) ? e.message : String(e)) + '\n';
      }
    }
    return 'localhost\n';
  }

  async function qdosPaste(filename, timeoutMs) {
    var valid = qdosValidateFilename(filename);
    if (!valid) return Promise.reject(new Error('invalid filename'));
    if (HOST) {
      return 'Input \'user\' to paste scripts\n';
    } else {
      return qdosXmitDos('qdosPaste', { file: valid }, timeoutMs).then(function (res) {
        // host replies with success:true or success:false (handler will resolve / reject appropriately)
        // For success we may receive true or a message string; normalize to string.
        if (res === true || res === undefined) return 'OK: pasted to ' + valid + '\n';
        return String(res) + '\n';
      }).catch(function (err) {
        return 'Error: '+(err && err.message ? err.message : String(err));
      });
    }
  }

  async function qdosCopy(filename, timeoutMs) {
    //
    // this function doesn't work, need host/guest branch
    // also need user interaction I thinks?
    //
    //var valid = qdosValidateFilename(filename);
    //if (!valid) return Promise.reject(new Error('invalid filename'));
    //return qdosXmitDos('qdosCopy', { file: valid }, timeoutMs).then(function (res) {
    //  if (res === true || res === undefined) return 'OK: copied ' + valid + ' to clipboard\n';
    //  return String(res) + '\n';
    //}).catch(function (err) {
    //  throw new Error('copy failed: ' + (err && err.message ? err.message : String(err)));
    //});
  }

  async function qdosMkDir(name, timeoutMs) {
    var valid = (typeof qdosValidateFilename === 'function') ? qdosValidateFilename(name) : (typeof name === 'string' ? name.trim() : null);
    if (!valid) return Promise.reject(new Error('invalid name'));
    if (typeof HOST !== 'undefined' && HOST) {
      return 'Not implemented yet for HOST\n';
    } else {
      var valid = qdosValidateFilename(name);
      if (!valid) { return Promise.reject(new Error('invalid name')); }
      return qdosXmitDos('localMkDir', { file: valid }, timeoutMs);
    }
  }

  async function qdosChDir(name) {
    //var valid = (typeof qdosValidateFilename === 'function') ? qdosValidateFilename(name) : (typeof name === 'string' ? name.trim() : null);
    if (typeof HOST !== 'undefined' && HOST) {
      return 'Not implemented yet for HOST\n';
    } else {
      if (name) {
        if (name=="..") {
          valid=".."; 
        } else {
          var valid = qdosValidateFilename(name);
          if (!valid) return 'Error: invalid name';
        }
      } else {
        valid="";
      }
      return qdosXmitDos('localChDir', { file: valid })
        .then(function (result) {
          return result;
        })
        .catch(function (err) {
         return err;
        });
    }
  };

  async function qdosRmDir(name) {
    var valid = (typeof qdosValidateFilename === 'function') ? qdosValidateFilename(name) : (typeof name === 'string' ? name.trim() : null);
    if (!valid) return Promise.reject(new Error('invalid name'));
    if (typeof HOST !== 'undefined' && HOST) {
      return 'Not implemented yet for HOST\n';  
    } else {
      var valid = qdosValidateFilename(name);
      return qdosXmitDos('localRmDir', { file: valid });
    }
  };

  async function qdosDelete(filename, timeoutMs) {
    var valid=filename.trim()
    valid=qdosValidateFilename(filename);
    if (!valid) { return Promise.reject(new Error('invalid filename')); }
    if (typeof HOST !== 'undefined' && HOST) {
      if (typeof dosDelete !== 'function') { return 'Error: dosDelete()) not available\n'; }
      try {
        var res = await Promise.resolve().then(function () { return dosDelete(valid); });
        var out = (typeof _normalizeResult === 'function') ? _normalizeResult(res) : (res === null || res === undefined ? '' : String(res));
        return String(out) + '\n';
      } catch (e) {
        return 'Error: ' + ((e && e.message) ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('localDelete', { file: valid });
  }

  async function qdosExists(filename, timeoutMs) {
    var name = (typeof filename === 'string') ? filename.trim() : filename;
    var v = qdosValidateFilename(filename);
    if (typeof v === 'string') name = v.trim();
    else if (v === true) name = (typeof filename === 'string' ? filename.trim() : null);
    else return false;
    if (!name || typeof name !== 'string') return false;
    try {
      var res = await qdosXmitDos('dosExists', { file: name }, timeoutMs);
      if (typeof res === 'boolean') return res;
      if (typeof res === 'number') return !!res;
      if (typeof res === 'string') {
        var s = res.trim().toLowerCase();
        if (s === 'true' || s === '1') return true;
        if (s === 'false' || s === '0' || s === '') return false;
      }
      return !!res;
    } catch (e) {
      // Communication or host-side error: return false (avoid rejecting)
      // If you want to surface errors instead, replace the next line with: throw e;
      return false;
    }
  }

  function qdosValidateFilename(name) {
    if (typeof name !== 'string' && typeof name !== 'number') return null;
    var s = String(name).trim();
    if (!s) return null;
    if (/[\/\\]/.test(s)) return null;
    if (/\.\./.test(s)) return null;
    if (s.length > 128) return null;
    if (!/^[A-Za-z0-9 _.\-!]+$/.test(s)) return null;
    return s;
  }

  // expose to global guest runtime
  window.qdosXmitDos = qdosXmitDos;
  window.qdosScript = qdosScript;
  window.qdosDir = qdosDir;
  window.qdosList = qdosList; 
  window.qdosLoad = qdosLoad; 
  window.qdosDelete = qdosDelete;
  window.qdosRename = qdosRename; 
  window.qdosMount = qdosMount;
  window.qdosPaste = qdosPaste;
  window.qdosCopy = qdosCopy;
  window.qdosExists = qdosExists;
  window.qdosMkDir = window.qdosMkDir;
  window.qdosChDir = window.qdosChDir;
  window.qdosRmDir = window.qdosRmDir;

  // these functions transmit packets to and from the host
  function qdosXmitDos(action, packet, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!window.parent || window.parent === window) { return reject(new Error('Error: no <host>')); }
      // compact id: timestamp + small counter (no separate helper function)
      window.__qandy_reqCounter += 1;
      var id = 'qdos_' + Date.now() + '_' + window.__qandy_reqCounter;
      var msg = { type: 'guest-action', action: action, id: id };
      if (packet) {
        var keys = Object.keys(packet);
        for (var i = 0; i < keys.length; i++) msg[keys[i]] = packet[keys[i]];
      }
      var timer = setTimeout(function () {
        delete _pending[id];
        reject(new Error('Error: timeout ' + action));
      }, timeoutMs || 5000);
      _pending[id] = { resolve: resolve, reject: reject, timer: timer };
      try {
        window.parent.postMessage(msg, '*');
      } catch (e) {
        clearTimeout(timer);
        delete _pending[id];
        return e;
      }
    });
  }

  // normalize host results into a primitive/string for qdosDir printing
  function _normalizeResult(res) {
    if (Array.isArray(res)) return res.join('\n');
    if (res === null || res === undefined) return '';
    if (typeof res === 'object') {
      try { return JSON.stringify(res); } catch (e) { return String(res); }
    }
    return String(res);
  }

  // qdosAckDOS wrapper (small convenience). If you already define qdosAckDOS elsewhere, this will not override it.
  window.qdosAckDOS = window.qdosAckDOS || function (type, handler, opts) {
    type = String(type || 'message');
    function wrapper(ev) {
      if (ev.source !== window.parent) return; // only accept messages from parent
      try { handler(ev); } catch (e) { console.error('qdosAckDOS handler error:', e && e.message ? e.message : e); }
    }
    window.addEventListener(type, wrapper, opts || false);
    return function remove() { window.removeEventListener(type, wrapper, opts || false); };
  };

  // attach the ack handler using qdosAckDOS
  qdosAckDOS('message', function (ev) {
    var d = ev.data;
    if (!d || typeof d !== 'object') return;
    // accept legacy and new reply names
    if (d.type !== 'action-result' && d.type !== 'ack') return;
    var id = d.id;
    if (!id || !_pending[id]) return;
    var entry = _pending[id];
    try { clearTimeout(entry.timer); } catch (e) {}
    delete _pending[id];
    var ok = (d.ok !== undefined) ? Boolean(d.ok) : (d.success !== undefined ? Boolean(d.success) : true);
    if (!ok) {
      entry.reject(new Error(d.error || 'DOS operation failed'));
      return;
    }
    var res = d.result !== undefined ? d.result : true;
    res = _normalizeResult(res);
    entry.resolve(res);
  }, false);
 
 
  // evalCode: always-evaluates user input inside an async IIFE so top-level await is valid.
  // Programs / REPL must use `await` for blocking calls (e.g., await print(...); await input(...);).
  window.evalCode = async function(code) {
    if (HOST) { print("Input \'user\' to execute code"); }
    var src = String(code || '');
    if (!src.trim()) return true;
    // Wrap the user input in an async IIFE so top-level await is valid everywhere.
    var wrapped = "(async function __qandy_repl_wrapper() {\n" + src + "\n})();";
    try {
      // Use indirect eval to run in global scope
      var promise = (0, eval)(wrapped);
      // Await the async IIFE result; print returned value if any
      var result = await promise;
      if (typeof result !== 'undefined') {
        try { await print(String(result) + "\n\n"); } catch (e) { /* best-effort */ }
      }
      return true;
    } catch (err) {
      try { await print("Error: " + ((err && err.message) ? err.message : String(err)) + "\n\n"); } catch (e) {}
      return false;
    }
  };

  // Signal that command.js is ready
  if (typeof window.qandySignalReady === 'function') {
    window.qandySignalReady('command.js');
  }
}
