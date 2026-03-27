function command_js() {
  window.command=async function(cmd) {
    if (window.RUN != "qandy.js") {
      window.print("\n");
      try { window.input(cmd); } catch (e) { /* ignore */ }
      window.LINE = ""; window.CURP = 0; window.LINEX = window.CURX; window.LINEY = window.CURY;
      return;
    }
    window.print("\n");
    cmd=String(cmd || '').trim();
    switch (cmd) {
      case 'cls':
        window.cls(); return;
      case 'whoami':
        var context = window.HOST ? "HOST (sysop access)" : "GUEST (user sandbox)";
        window.print("\n"+context+"\n"); window.print("URL:"+window.location.href+"\n");
        window.print("localStorage: " + (typeof localStorage !== 'undefined' ? "yes" : "no") + "\n\n");
        return;
      case 'hostname':
        window.print("\nHOST=" + window.HOST + "\n");
        window.print("GUEST=" + window.GUEST + "\n");
        window.print("RUN=" + window.RUN + "\n");
        window.print("Parent is: " + (window.parent === window ? "self" : "parent iframe") + "\n\n");
        return;
      case 'sysop':
        if (window.GUEST) {
          try {
            window.parent.postMessage({ type: 'guest-action', action: 'sysop', success: true }, '*');
          } catch (e) {
            window.print("Error: " + String(e) + "\n");
          }
        }
        return;
      case 'user':
        if (window.HOST) {
          try {
            var hostEl = document.getElementById('txt');
            var hostKb = document.getElementById('host-keyboard');
            var guestKb = document.getElementById('guest-keyboard');
            var vm = document.getElementById('vm-container') || window._vmContainer || null;
            var iframe = document.getElementById('vm-iframe') || window._vmIframe || null;
            if (hostEl) { hostEl.style.display = 'none'; hostEl.style.visibility = 'hidden'; hostEl.style.pointerEvents = 'none'; }
            if (hostKb) { hostKb.style.display = 'none'; hostKb.style.visibility = 'hidden'; hostKb.style.pointerEvents = 'none'; }
            if (vm) {
              vm.style.display = 'block';
              vm.style.visibility = 'visible';
              vm.style.pointerEvents = 'auto';
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
                var vmZ = vm && vm.style && vm.style.zIndex ? parseInt(vm.style.zIndex,10) : 1000;
                guestKb.style.zIndex = String(Math.max(parseInt(guestKb.style.zIndex || 0,10) || (vmZ + 1), vmZ + 1));
              } catch (e) {}
            }
            if (hostEl) { hostEl.style.pointerEvents = 'none'; }
            if (hostKb) { hostKb.style.pointerEvents = 'none'; hostKb.style.visibility = 'hidden'; }
            try {
              if (iframe) {
                iframe.setAttribute && iframe.setAttribute('tabindex', '0');
                try { iframe.focus(); } catch (e) { }
                try { if (iframe.contentWindow && typeof iframe.contentWindow.focus === 'function') iframe.contentWindow.focus(); } catch (e) { }
              }
            } catch (errFocus) { }
          } catch (err) { }
        }
        return;
      default:
        break;
    }

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
      if (window.HOST) {
        window.print("Input \'user\' to execute scripts");
        return;
      }
      var res = await window.qdosScript(c);
      if (res !== true) {
        window.print(String(res) + "\n");
      }
      return;
    }

    switch (c) {
      case "dir":
        window.print(await window.qdosDir(f, d)); return;
      case "list":
      case "ls":
        window.print(await window.qdosList()); return;
      case "load":
        window.print(await window.qdosLoad(f)); return;
      case "delete":
      case "del":
      case "rm":
        window.print(await window.qdosDelete(f)+"\n"); return;
      case "rename":
      case "ren":
        window.print(await window.qdosRename(f,d)+"\n"); return;
      case "mount":
        window.print(await window.qdosMount(f)+"\n"); return;
      case "qpaste":
        window.print(await window.qdosPaste(f)+"\n"); return;
      case "mkdir":
      case "md":
        window.print(await window.qdosMkDir(f)+"\n"); return;
      case "chdir":
      case "cd":
        window.print(await window.qdosChDir(f)+"\n"); return;
      case "rmdir":
      case "rd":
        window.print(await window.qdosRmDir(f)+"\n"); return;
      case "exists":
        window.print(await window.qdosExists(f)+"\n"); return;
      case "fdisk":
        if (window.HOST) {
          if (typeof window.dosfdisk === "function") window.print(await window.dosfdisk()+"\n");
        } else {
          window.print("Input \'sysop\' for access\n");
        }
        return;
      default:
        if (window.GUEST) {
          if (typeof window.evalCode === "function") window.evalCode(cmd);
          window.pokeCursorOn();
          window.LINE=""; window.CURP = 0; window.LINEX = window.CURX; window.LINEY = window.CURY;
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
    var args=tokens.slice(1);
    return { cmd: c, args: args, rawTokens: tokens };
  }

  window.__qandy_pending = window.__qandy_pending || Object.create(null);
  window.__qandy_reqCounter = window.__qandy_reqCounter || 0;
  var _pending = window.__qandy_pending;

  window.qdosScript = async function(name) {
    if (window.HOST) { return "Error: input 'user' to run scripts"; }
    var nm = (typeof name === 'string') ? name.trim() : '';
    if (!nm) return "Error: invalid filename";
    if (!/^[A-Za-z0-9 _.\-\/]+$/.test(nm) || nm.indexOf('..') !== -1) return "Error: invalid filename";
    var content;
    try {
      content = await window.qdosXmitDos('localLoad', { file: nm });
    } catch (e) {
      return "Error: load failed: " + ((e && e.message) ? e.message : String(e));
    }
    content = (content === null || typeof content === 'undefined') ? '' : String(content);
    if (content.charCodeAt(0) === 0xFEFF) content = content.slice(1);
    content = content.replace(/^\s*#!.*\r?\n/, '');
    try {
      (0, eval)(content + "\n\n//# sourceURL=" + nm);
      return true;
    } catch (e) {
      var emsg = (e && e.message) ? e.message : String(e);
      return "Error: " + emsg + " in " + nm;
    }
  }

  window.qdosDir = async function(pattern, switches) {
    var validPattern = (typeof pattern === 'string') ? pattern.trim() : '';
    var validSwitches = (typeof switches === 'string') ? switches.trim() : '';
    if (window.HOST) {
      try {
        if (typeof window.localDir === "function") {
          var res = await window.localDir(validPattern, validSwitches);
          return _normalizeResult(res) + '\n';
        }
      } catch (e) { return 'Error: ' + (e.message || String(e)) + '\n'; }
    }
    return window.qdosXmitDos('localDir', { pattern: validPattern, switches: validSwitches }).then(function (result) {
      return String(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e.message || String(e)) + '\n';
    });
  }

  window.qdosList = async function() {
    if (window.HOST) {
      try {
        if (typeof window.dosList === "function") {
          var res = await window.dosList();
          return _normalizeResult(res) + '\n';
        }
      } catch (e) { return 'Error: ' + (e.message || String(e)) + '\n'; }
      return 'Error: DOS not available\n';
    }
    return window.qdosXmitDos('localList').then(function (result) {
      return String(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e.message || String(e)) + '\n';
    });
  }

  window.qdosLoad = async function(filename, timeoutMs) {
    var valid = (typeof filename === 'string' ? filename.trim() : null);
    if (!valid) return Promise.reject(new Error('invalid filename'));
    if (window.HOST) {
      var loader = (typeof window.localLoad === 'function') ? window.localLoad : (typeof window.dosLoad === 'function' ? window.dosLoad : null);
      if (!loader) return Promise.reject(new Error('Error: DOS not available'));
      try {
        var res = await loader(valid);
        return _normalizeResult(res);
      } catch (e) { return Promise.reject(e); }
    }
    return window.qdosXmitDos('localLoad', { file: valid }, timeoutMs).then(function (result) {
      return _normalizeResult(result);
    });
  }

  window.qdosRename = async function(file, dest, timeoutMs) {
    var validSrc = (typeof file === "string" ? file.trim() : "");
    var validDest = (typeof dest === "string" ? dest.trim() : "");
    if (!validSrc || !validDest) return 'invalid filename(s)';
    if(window.HOST) { return "Input \'user\' to rename files"; }
    return window.qdosXmitDos('localRename', { file: validSrc, dest: validDest }, timeoutMs);
  }

  window.qdosMount = async function(device) {
    var dev = (typeof device === 'undefined' || device === null) ? '' : String(device).trim();
    if (dev === '') dev = 'localhost';
    if (window.HOST) {
      if (typeof window.dosMount !== 'function') { return 'Error: dosMount not available\n'; }
      try {
        var res = await window.dosMount(dev);
        return String(_normalizeResult(res)) + '\n';
      } catch (e) { return 'Error: ' + (e.message || String(e)) + '\n'; }
    }
    return 'localhost\n';
  }

  window.qdosPaste = async function(filename, timeoutMs) {
    var valid = (typeof filename === "string" ? filename.trim() : "");
    if (!valid) return Promise.reject(new Error('invalid filename'));
    if (window.HOST) return 'Input \'user\' to paste scripts\n';
    return window.qdosXmitDos('qdosPaste', { file: valid }, timeoutMs).then(function (res) {
      if (res === true || res === undefined) return 'OK: pasted to ' + valid + '\n';
      return String(res) + '\n';
    }).catch(function (err) { return 'Error: '+(err.message || String(err)); });
  }

  window.qdosMkDir = async function(name, timeoutMs) {
    var valid = (typeof name === 'string' ? name.trim() : null);
    if (!valid) return Promise.reject(new Error('invalid name'));
    if (window.HOST) return 'Not implemented yet for HOST\n';
    return window.qdosXmitDos('localMkDir', { file: valid }, timeoutMs);
  }

  window.qdosChDir = async function(name) {
    var valid = (name === ".." ? ".." : (typeof name === "string" ? name.trim() : ""));
    if (window.HOST) return 'Not implemented yet for HOST\n';
    return window.qdosXmitDos('localChDir', { file: valid });
  };

  window.qdosRmDir = async function(name) {
    var valid = (typeof name === 'string' ? name.trim() : null);
    if (!valid) return Promise.reject(new Error('invalid name'));
    if (window.HOST) return 'Not implemented yet for HOST\n';
    return window.qdosXmitDos('localRmDir', { file: valid });
  };

  window.qdosDelete = async function(filename, timeoutMs) {
    var valid = (typeof filename === "string" ? filename.trim() : "");
    if (!valid) return Promise.reject(new Error('invalid filename'));
    if (window.HOST) {
      if (typeof window.dosDelete !== 'function') return 'Error: dosDelete not available\n';
      try {
        var res = await window.dosDelete(valid);
        return String(_normalizeResult(res)) + '\n';
      } catch (e) { return 'Error: ' + (e.message || String(e)) + '\n'; }
    }
    return window.qdosXmitDos('localDelete', { file: valid });
  }

  window.qdosExists = async function(filename, timeoutMs) {
    var name = (typeof filename === 'string') ? filename.trim() : null;
    if (!name) return false;
    try {
      var res = await window.qdosXmitDos('dosExists', { file: name }, timeoutMs);
      return !!res;
    } catch (e) { return false; }
  }

  window.qdosXmitDos = function(action, packet, timeoutMs) {
    return new Promise(function (resolve, reject) {
      if (!window.parent || window.parent === window) { return reject(new Error('Error: no <host>')); }
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
      try { window.parent.postMessage(msg, '*'); } catch (e) {
        clearTimeout(timer);
        delete _pending[id];
        reject(e);
      }
    });
  }

  function _normalizeResult(res) {
    if (Array.isArray(res)) return res.join('\n');
    if (res === null || res === undefined) return '';
    if (typeof res === 'object') {
      try { return JSON.stringify(res); } catch (e) { return String(res); }
    }
    return String(res);
  }

  window.addEventListener('message', function (ev) {
    var d = ev.data;
    if (!d || typeof d !== 'object' || (d.type !== 'action-result' && d.type !== 'ack')) return;
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
    entry.resolve(d.result !== undefined ? d.result : true);
  }, false);

  window.evalCode = async function(code) {
    if (window.HOST) { window.print("Input \'user\' to execute code"); }
    var src = String(code || '');
    if (!src.trim()) return true;
    var wrapped = "(async function __qandy_repl_wrapper() {\n" + src + "\n})();";
    try {
      var promise = (0, eval)(wrapped);
      var result = await promise;
      if (typeof result !== 'undefined') {
        try { await window.print(String(result) + "\n\n"); } catch (e) { }
      }
      return true;
    } catch (err) {
      try { await window.print("Error: " + (err.message || String(err)) + "\n\n"); } catch (e) {}
      return false;
    }
  };

  if (typeof window.qandySignalReady === 'function') window.qandySignalReady('command.js');
}
