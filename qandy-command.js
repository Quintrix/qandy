//
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
            // Check if guest machine already exists
            var vm = document.getElementById('vm-container') || window._vmContainer || null;
            var iframe = document.getElementById('vm-iframe') || window._vmIframe || null;
            // If guest doesn't exist, create it
            if (!vm || !iframe) {
              try {
                await createGuest({ zIndex: 100, iframeId: 'vm-iframe' });
                print("sandbox created.\n");
              } catch (e) {
                print("Error: "+String(e)+"\n");
                return;
              }
              // Re-fetch references after creation
              vm = document.getElementById('vm-container') || window._vmContainer || null;
              iframe = document.getElementById('vm-iframe') || window._vmIframe || null;
            }
            // Now display/focus the guest machine
            var hostEl = document.getElementById('txt');
            var hostKb = document.getElementById('host-keyboard');
            var guestKb = document.getElementById('guest-keyboard');
            if (hostEl) { hostEl.style.display = 'none'; hostEl.style.visibility = 'hidden'; hostEl.style.pointerEvents = 'none'; }
            if (hostKb) { hostKb.style.display = 'none'; hostKb.style.visibility = 'hidden'; hostKb.style.pointerEvents = 'none'; }
            // Show guest container / iframe and bring it to front
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
              try { 
                iframe.style.zIndex = vm && vm.style && vm.style.zIndex ? String(parseInt(vm.style.zIndex, 10) + 1) : '1001'; 
              } catch (e) {}
            }
            if (guestKb) {
              guestKb.style.display = 'block';
              guestKb.style.visibility = 'visible';
              guestKb.style.pointerEvents = 'auto';
              try {
                guestKb.style.position = guestKb.style.position || 'absolute';
                var vmZ = vm && vm.style && vm.style.zIndex ? parseInt(vm.style.zIndex, 10) : 1000;
                guestKb.style.zIndex = String(Math.max(parseInt(guestKb.style.zIndex || 0, 10) || (vmZ + 1), vmZ + 1));
              } catch (e) {}
            }
            // Focus the iframe
            try {
              if (iframe) {
                iframe.setAttribute && iframe.setAttribute('tabindex', '0');
                try { iframe.focus(); } catch (e) { console.warn('iframe.focus failed', e); }
                try { 
                  if (iframe.contentWindow && typeof iframe.contentWindow.focus === 'function') { 
                    iframe.contentWindow.focus(); 
                  } 
                } catch (e) { console.warn('iframe.contentWindow.focus failed', e); }
                try { 
                  var doc = iframe.contentDocument || (iframe.contentWindow && iframe.contentWindow.document);
                  if (doc && doc.body && typeof doc.body.focus === 'function') { 
                    doc.body.focus(); 
                  }
                } catch (e) { /* cross-origin or not accessible; ignore */ }
                setTimeout(function() {
                  try { iframe.focus(); } catch (e) {}
                  try { 
                    if (iframe.contentWindow && typeof iframe.contentWindow.focus === 'function') { 
                      iframe.contentWindow.focus(); 
                    } 
                  } catch (e) {}
                }, 50);
              }
            } catch (errFocus) {
              console.warn('focus restore attempted but failed', errFocus);
            }
            console.log('Switched to guest machine; activeElement is:', document.activeElement);
          } catch (err) {
            console.error('user command failed', err);
            print("Error switching to guest machine: " + String(err) + "\n");
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
        f=0; for (let i=0; i<JSfiles.length; i++) {
          const JSfile=JSfiles[i];
          if (c===JSfile) {
          	f=1;
            var js=document.createElement('script');
            js.id=JSfile;
            js.src=JSfile;
            document.head.appendChild(js);
          }
        }
        if (f<1) { print("Command not found.\n"); } 
        return;
      }
      if (GUEST) {
        // only execute scripts from localStorage
        var res = await qdosScript(c);
        if (res === true) {} else {
          print(String(res) + "\n");
        } 
        return;
      }
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
      case "screate":
        print(await qdosServerCreate(f, {}));
        return;
      case "smount":
        print(await qdosServerMount(f));
        return;
      case "ssave":
        print(await qdosServerSave(f, d));
        return;
      case "sload":
        print(await qdosServerLoad(f));
        return;
      case "sdelete":
        print(await qdosServerDelete(f));
        return;
      case "srename":
        print(await qdosServerRename(f, d));
        return;
      case "smkdir":
        print(await qdosServerMkDir(f));
        return;
      case "smd":
        print(await qdosServerMkDir(f));
        return;
      case "schdir":
        print(await qdosServerChDir(f));
        return;
      case "scd":
        print(await qdosServerChDir(f));
        return;
      case "srmdir":
        print(await qdosServerRmDir(f));
        return;
      case "srd":
        print(await qdosServerRmDir(f));
        return;
      case "sdir":
        print(await qdosServerDir(f, d));
        return;
      case "sls":
        print(await qdosServerList(f));
        return;
      case "sexists":
        print(await qdosServerExists(f) + "\n");
        return;
      case "serverlist":
        print(await qdosServerDiscovery());
        return;
      case "serverconnect":
        print(await qdosServerConnect(f));
        return;
      case "serverstatus":
        print(await qdosServerStatus());
        return;
      case "surl":
        if (f) {
          print(await qdosServerSetUrl(f) + "\n");
        } else {
          print(await qdosServerStatus());
        }
        return;
      default:
        //if (GUEST) {
          evalCode(cmd);
          pokeCursorOn();
          LINE=""; CURP = 0;
          LINEX = CURX; LINEY = CURY;
          return;
        //}
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
    if (content.substring(0,6)==="Error:") { return content; }
    return new Promise((resolve) => {
        try {
          const blob = new Blob([content], { type: 'application/javascript' });
          const blobUrl = URL.createObjectURL(blob);
          const script = document.createElement('script');
          script.src = blobUrl;
          script.onload = () => {
            // Clean up the blob URL after loading
            URL.revokeObjectURL(blobUrl);
            resolve(true);
          };
          script.onerror = (e) => {
            URL.revokeObjectURL(blobUrl);
            resolve("Error: script load failed for " + nm);
          };
          // Add sourceURL comment for better debugging
          const scriptWithSource = content + `\n\n//# sourceURL=${nm}`;
          const blobWithSource = new Blob([scriptWithSource], { type: 'application/javascript' });
          const blobUrlWithSource = URL.createObjectURL(blobWithSource);
          script.src = blobUrlWithSource;
          document.head.appendChild(script);
        } catch (e) {
          resolve("Error: " + ((e && e.message) ? e.message : String(e)));
    }
  });
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

  function _normalizeResult(res) {
    if (Array.isArray(res)) return res.join('\n');
    if (res === null || res === undefined) return '';
    if (typeof res === 'object') {
      try { return JSON.stringify(res); } catch (e) { return String(res); }
    }
    return String(res);
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

  // ── Server storage qdos wrappers ─────────────────────────────────────────────
  // HOST: calls server* functions from qandy-dos.js directly.
  // GUEST: sends message to host message handler via qdosXmitDos.

  function _qdosServerValidateDrive(name) {
    if (typeof name !== 'string' && typeof name !== 'number') return null;
    var s = String(name).trim();
    if (!s || s.length > 64) return null;
    if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
    return s;
  }

  async function qdosServerCreate(driveName, options) {
    var name = _qdosServerValidateDrive(driveName);
    if (!name) return 'Error: invalid drive name\n';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverCreate(name, options); });
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverCreate', { name: name, options: options }).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerMount(driveName) {
    var name = _qdosServerValidateDrive(driveName);
    if (!name) return 'Error: invalid drive name\n';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverMount(name); });
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverMount', { name: name }).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerMkDir(name, options) {
    var valid = (typeof qdosValidateFilename === 'function') ? qdosValidateFilename(name) : (typeof name === 'string' ? name.trim() : null);
    if (!valid) return 'Error: invalid directory name\n';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverMkDir(valid, options); });
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverMkDir', { name: valid, options: options }).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerChDir(name) {
    var valid = (name === '..' || name === '') ? (name || '') :
      ((typeof qdosValidateFilename === 'function') ? qdosValidateFilename(name) : (typeof name === 'string' ? name.trim() : null));
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverChDir(valid || ''); });
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverChDir', { name: valid || '' }).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerRmDir(name) {
    var valid = (typeof qdosValidateFilename === 'function') ? qdosValidateFilename(name) : (typeof name === 'string' ? name.trim() : null);
    if (!valid) return 'Error: invalid directory name\n';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverRmDir(valid); });
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverRmDir', { name: valid }).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerSave(filename, data) {
    var valid = (typeof qdosValidateFilename === 'function') ? qdosValidateFilename(filename) : (typeof filename === 'string' ? filename.trim() : null);
    if (!valid) return 'Error: invalid filename\n';
    var content = String(data == null ? '' : data);
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverSave(valid, content); });
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverSave', { name: valid, content: content }).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerLoad(filename, timeoutMs) {
    var valid = (typeof qdosValidateFilename === 'function') ? qdosValidateFilename(filename) : (typeof filename === 'string' ? filename.trim() : null);
    if (!valid) return Promise.reject(new Error('invalid filename'));
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverLoad(valid); });
        return _normalizeResult(res);
      } catch (e) {
        return Promise.reject(new Error((e && e.message) ? e.message : String(e)));
      }
    }
    return qdosXmitDos('serverLoad', { name: valid }, timeoutMs).then(function (result) {
      return _normalizeResult(result);
    });
  }

  async function qdosServerDelete(filename) {
    var valid = (typeof qdosValidateFilename === 'function') ? qdosValidateFilename(filename) : (typeof filename === 'string' ? filename.trim() : null);
    if (!valid) return 'Error: invalid filename\n';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverDelete(valid); });
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverDelete', { name: valid }).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerRename(file, dest) {
    var validSrc = (typeof qdosValidateFilename === 'function') ? qdosValidateFilename(file) : (typeof file === 'string' ? file.trim() : null);
    var validDest = (typeof qdosValidateFilename === 'function') ? qdosValidateFilename(dest) : (typeof dest === 'string' ? dest.trim() : null);
    if (!validSrc || !validDest) return 'Error: invalid filename(s)\n';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverRename(validSrc, validDest); });
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverRename', { name: validSrc, dest: validDest }).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerExists(filename) {
    var valid = (typeof qdosValidateFilename === 'function') ? qdosValidateFilename(filename) : (typeof filename === 'string' ? filename.trim() : null);
    if (!valid) return false;
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverExists(valid); });
        return !!res;
      } catch (e) {
        return false;
      }
    }
    return qdosXmitDos('serverExists', { name: valid }).then(function (result) {
      if (typeof result === 'boolean') return result;
      if (typeof result === 'string') { var s = result.trim().toLowerCase(); return s === 'true' || s === '1'; }
      return !!result;
    }).catch(function () { return false; });
  }

  async function qdosServerDir(pattern, switches) {
    var validPattern = (typeof pattern === 'string') ? pattern.trim() : '';
    var validSwitches = (typeof switches === 'string') ? switches.trim() : '';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverDir(validPattern, validSwitches); });
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverDir', { pattern: validPattern, switches: validSwitches }).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerList(pattern) {
    var validPattern = (typeof pattern === 'string') ? pattern.trim() : '';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverList(validPattern); });
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverList', { pattern: validPattern }).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerDiscovery() {
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverDiscovery(); });
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverDiscovery', {}).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerConnect(serverName) {
    var name = (typeof serverName === 'string') ? serverName.trim() : '';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = await Promise.resolve().then(function () { return serverConnect(name); });
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverConnect', { name: name }).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerStatus() {
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = (typeof serverStatus === 'function')
          ? serverStatus()
          : ((typeof serverInfo === 'function') ? JSON.stringify(serverInfo(), null, 2) : 'unavailable');
        return _normalizeResult(res) + '\n';
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
      }
    }
    return qdosXmitDos('serverStatus', {}).then(function (result) {
      return _normalizeResult(result) + '\n';
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e)) + '\n';
    });
  }

  async function qdosServerSetUrl(url) {
    var newUrl = (typeof url === 'string') ? url.trim() : '';
    if (typeof HOST !== 'undefined' && HOST) {
      try {
        var res = (typeof serverSetUrl === 'function') ? serverSetUrl(newUrl) : newUrl;
        return _normalizeResult(res);
      } catch (e) {
        return 'Error: ' + (e && e.message ? e.message : String(e));
      }
    }
    return qdosXmitDos('serverSetUrl', { url: newUrl }).then(function (result) {
      return _normalizeResult(result);
    }).catch(function (e) {
      return 'Error: ' + (e && e.message ? e.message : String(e));
    });
  }

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

  window.command_js = command_js;
  window.command = command;
  window.parseArgs = parseArgs;
  window.extractCmdParts = extractCmdParts;
  window.__qandy_pending = __qandy_pending;
  window.__qandy_reqCounter = __qandy_reqCounter;
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
  window.qdosMkDir = qdosMkDir;
  window.qdosChDir = qdosChDir;
  window.qdosRmDir = qdosRmDir;
  window.qdosValidateFilename = qdosValidateFilename;
  window._normalizeResult = _normalizeResult;
  window._pending = _pending;

  // expose qdosServer* wrappers
  window.qdosServerCreate = qdosServerCreate;
  window.qdosServerMount = qdosServerMount;
  window.qdosServerMkDir = qdosServerMkDir;
  window.qdosServerChDir = qdosServerChDir;
  window.qdosServerRmDir = qdosServerRmDir;
  window.qdosServerSave = qdosServerSave;
  window.qdosServerLoad = qdosServerLoad;
  window.qdosServerDelete = qdosServerDelete;
  window.qdosServerRename = qdosServerRename;
  window.qdosServerExists = qdosServerExists;
  window.qdosServerDir = qdosServerDir;
  window.qdosServerList = qdosServerList;
  window.qdosServerDiscovery = qdosServerDiscovery;
  window.qdosServerConnect = qdosServerConnect;
  window.qdosServerStatus = qdosServerStatus;
  window.qdosServerSetUrl = qdosServerSetUrl;

  // In GUEST mode, expose server* globals so scripts can call them directly.
  // (In HOST mode, qandy-dos.js loads later and sets the real server* functions.)
  if (typeof GUEST !== 'undefined' && GUEST) {
    window.serverCreate = qdosServerCreate;
    window.serverMount = qdosServerMount;
    window.serverMkDir = qdosServerMkDir;
    window.serverChDir = qdosServerChDir;
    window.serverRmDir = qdosServerRmDir;
    window.serverSave = qdosServerSave;
    window.serverLoad = qdosServerLoad;
    window.serverDelete = qdosServerDelete;
    window.serverRename = qdosServerRename;
    window.serverExists = qdosServerExists;
    window.serverDir = qdosServerDir;
    window.serverList = qdosServerList;
    window.serverDiscovery = qdosServerDiscovery;
    window.serverConnect = qdosServerConnect;
    window.serverStatus = qdosServerStatus;
    window.serverSetUrl = qdosServerSetUrl;
  }

  // Signal that command.js is ready
  if (typeof window.qandySignalReady === 'function') {
    window.qandySignalReady('command_js');
  }
}
window.command_js=command_js;
