function qandy_js() {
  window.RUN = "qandy.js";
  window.LOG = window.LOG || "";

  window.button = function(b, event) {
    window.pokeCursorOff();
    var virtualclick = !!(event && event.source === 'virtual');
    if (event && typeof event.shiftKey !== 'undefined') window.shift = !!event.shiftKey;
    var k = "", l = "";
    if (b === 32 && event && !virtualclick) event.preventDefault();

    if (window.RUN !== "qandy.js" && typeof window.keydown === 'function') {
      var kdEvent = event || {};
      if (!kdEvent.key) {
        try { kdEvent.key = String.fromCharCode(b || 0); } catch (e) { kdEvent.key = ''; }
      }
      kdEvent.shiftKey = !!(kdEvent.shiftKey || window.shift);
      kdEvent.ctrlKey  = !!(kdEvent.ctrlKey  || window.ctrl);
      kdEvent.altKey   = !!(kdEvent.altKey   || window.alt);
      kdEvent.source = kdEvent.source || 'physical';
      try { window.keydown(b, kdEvent); } catch (err) { }
      window.pokeCursorOn();
      return;
    }

    switch (b) {
      case 16:
        if (event && typeof event.shiftKey !== 'undefined') window.shift = !!event.shiftKey;
        else window.shift = !window.shift;
        if (typeof window.updateKeyLabels === 'function') window.updateKeyLabels();
        window.pokeCursorOn();
        return;
      case 17: k = "ctrl"; break;
      case 18: k = "alt"; break;
      case 20: k = "caps"; break;
      case 27: k = "esc"; break;
      case 13: k = "enter"; break;
      case 8:  k = "back"; break;
      case 45: k = "insert"; break;
      case 46: k = "delete"; break;
      case 37: k = "left"; break;
      case 38: k = "up"; break;
      case 39: k = "right"; break;
      case 40: k = "down"; break;
      case 36: k = "home"; break;
      case 35: k = "end"; break;
    }

    if (!k && b >= 65 && b <= 90) {
      var base = String.fromCharCode(b);
      var makeUpper = (window.shift && !window.caps) || (!window.shift && window.caps);
      l = makeUpper ? base.toUpperCase() : base.toLowerCase();
      k = l;
    }

    var keyMap = {
      48: ['0', ')'], 49: ['1', '!'], 50: ['2', '@'], 51: ['3', '#'],
      52: ['4', '$'], 53: ['5', '%'], 54: ['6', '^'], 55: ['7', '&'],
      56: ['8', '*'], 57: ['9', '('],
      186: [';', ':'], 59: [';', ':'],
      187: ['=', '+'], 61: ['=', '+'],
      188: [',', '<'],
      189: ['-', '_'], 173: ['-', '_'],
      190: ['.', '>'],
      191: ['/', '?'],
      192: ['`', '~'],
      219: ['[', '{'],
      220: ['\\', '|'],
      221: [']', '}'],
      222: ["'", '"'],
      32: [' ', ' ']
    };

    if (!k && keyMap[b]) { l = window.shift ? keyMap[b][1] : keyMap[b][0]; k = l; }
    if (!k && b < 32) { window.pokeCursorOn(); return; }

    if (k === "caps") {
      window.caps = !window.caps;
      window.updateKeyLabels();
      window.pokeCursorOn(); return;
    }

    if (k === "back") {
      if (window.QandyKeyboard) {
        var _bp = window.QandyKeyboard._pendingState();
        if (_bp && !_bp.echo) {
          if (_bp.buffer && _bp.buffer.length > 0) { _bp.buffer = _bp.buffer.slice(0, -1); }
          window.pokeCursorOn(); return;
        }
      }
      if (window.SSTART !== -1 && window.SEND !== -1) {
        if (typeof window.deleteSelection === 'function') window.deleteSelection();
        window.pokeInput();
      } else if (window.CURP > 0) {
        window.LINE = window.LINE.substring(0, window.CURP - 1) + window.LINE.substring(window.CURP);
        window.CURP--;
        window.pokeCell(window.CURX, window.CURY, " ");
        window.pokeInput();
      }
    } else if (k === "enter") {
      if (window.SSTART > -1) { window.pokeSelect(false); window.SSTART = -1; window.SEND = -1; }
      if (window.LINE !== undefined) {
        if (window.QandyKeyboard) {
          var _ep = window.QandyKeyboard._pendingState();
          if (_ep) {
            var _val = !_ep.echo ? (_ep.buffer || "") : (window.LINE || "");
            window.lastin = "";
            window.CURX = 0;
            window.CURY = Math.min(window.H - 1, window.CURY + 1);
            window.LINEX = window.CURX;
            window.LINEY = window.CURY;
            window.LINE = "";
            window.CURP = 0;
            window.QandyKeyboard.acceptPending(_val);
            window.pokeCursorOn();
            return;
          }
        }
        if (window.commandHistory && window.LINE.trim().length > 0) {
          if (window.commandHistory.length === 0 || window.commandHistory[window.commandHistory.length - 1] !== window.LINE) {
            window.commandHistory.push(window.LINE);
            if (window.maxHistorySize && window.commandHistory.length > window.maxHistorySize) window.commandHistory.shift();
          }
        }
        window.historyIndex = -1;
        window.tempCommand = "";
        var cmd = window.LINE; window.LINE = ""; window.CURP = 0; window.LINEX = window.CURX; window.LINEY = window.CURY;
        if (window.CURMORE > -1) window.CURMORE = 0;
        window.command(cmd);
      }
    } else if (l) {
      var finalChar = l;
      if (window.QandyKeyboard) {
        var _cp = window.QandyKeyboard._pendingState();
        if (_cp && !_cp.echo) {
          _cp.buffer = (_cp.buffer || "") + finalChar;
          window.pokeCursorOn(); return;
        }
      }
      window.LINE = (window.LINE || "").substring(0, window.CURP) + finalChar + (window.LINE || "").substring(window.CURP);
      window.CURP += finalChar.length;
      window.CURX += finalChar.length;
      while (window.CURX >= window.W) { window.CURX -= window.W; window.CURY++; if (window.CURY >= window.H) { window.CURY = window.H - 1; } }
      window.pokeInput();
    }
    window.pokeCursorOn();
  };

  window.print = function(t) {
    var text = String(t == null ? "" : t);
    text = text.replace(/\[blue\]/g, window.ANSIblue);
    text = text.replace(/\[black\]/g, window.ANSIblack);
    text = text.replace(/\[red\]/g, window.ANSIred);
    text = text.replace(/\[green\]/g, window.ANSIgreen);
    text = text.replace(/\[yellow\]/g, window.ANSIyellow);
    text = text.replace(/\[magenta\]/g, window.ANSImagenta);
    text = text.replace(/\[cyan\]/g, window.ANSIcyan);
    text = text.replace(/\[white\]/g, window.ANSIwhite);

    text = text.replace(/\[bblue\]/g, window.ANSIblue_bright);
    text = text.replace(/\[bblack\]/g, window.ANSIblack_bright);
    text = text.replace(/\[bred\]/g, window.ANSIred_bright);
    text = text.replace(/\[bgreen\]/g, window.ANSIgreen_bright);
    text = text.replace(/\[byellow\]/g, window.ANSIyellow_bright);
    text = text.replace(/\[bmagenta\]/g, window.ANSImagenta_bright);
    text = text.replace(/\[bcyan\]/g, window.ANSIcyan_bright);
    text = text.replace(/\[bwhite\]/g, window.ANSIwhite_bright);

    text = text.replace(/\[-blue\]/g, window.ANSIbgblue);
    text = text.replace(/\[-black\]/g, window.ANSIbgblack);
    text = text.replace(/\[-red\]/g, window.ANSIbgred);
    text = text.replace(/\[-green\]/g, window.ANSIbggreen);
    text = text.replace(/\[-yellow\]/g, window.ANSIbgyellow);
    text = text.replace(/\[-magenta\]/g, window.ANSIbgmagenta);
    text = text.replace(/\[-cyan\]/g, window.ANSIbgcyan);
    text = text.replace(/\[-white\]/g, window.ANSIbgwhite);

    text = text.replace(/\[-bblue\]/g, window.ANSIbgblue_bright);
    text = text.replace(/\[-bblack\]/g, window.ANSIbgblack_bright);
    text = text.replace(/\[-bred\]/g, window.ANSIbgred_bright);
    text = text.replace(/\[-bgreen\]/g, window.ANSIbggreen_bright);
    text = text.replace(/\[-byellow\]/g, window.ANSIbgyellow_bright);
    text = text.replace(/\[-bmagenta\]/g, window.ANSIbgmagenta_bright);
    text = text.replace(/\[-bcyan\]/g, window.ANSIbgcyan_bright);
    text = text.replace(/\[-bwhite\]/g, window.ANSIbgwhite_bright);

    text = text.replace(/\[bold\]/g, window.ANSIbold);
    text = text.replace(/\[dim\]/g, window.ANSIdim);
    text = text.replace(/\[italic\]/g, window.ANSIitalic);
    text = text.replace(/\[line\]/g, window.ANSIunderline);
    text = text.replace(/\[inverse\]/g, window.ANSIinverse);
    text = text.replace(/\[hidden\]/g, window.ANSIhidden);
    text = text.replace(/\[strike\]/g, window.ANSIstrikethrough);
    text = text.replace(/\[blink\]/g, "\x1b[5m");
    text = text.replace(/\[reset\]/g, window.ANSIresetAll);

    text = text.replace(/\[up\]/g, "\x1b[A");
    text = text.replace(/\[down\]/g, "\x1b[B");
    text = text.replace(/\[right\]/g, "\x1b[C");
    text = text.replace(/\[left\]/g, "\x1b[D");
    text = text.replace(/\[home\]/g, "\x1b[H");
    text = text.replace(/\[cls\]/g, "\x1b[2J");

    var q = window._qandy_print_queue || (window._qandy_print_queue = { items: [], running: false });
    return new Promise(function(resolve) {
      q.items.push({ text: text, resolve: resolve });
      window._processPrintQueue();
    });
  };

  window._processPrintQueue = async function() {
    var q = window._qandy_print_queue;
    if (q.running) return;
    q.running = true;
    try {
      while (q.items.length) {
        var job = q.items.shift();
        await window.waitForCursorIdle();
        try { await window.pokeCursor(job.text); } catch (e) { }
        await window.waitForCursorIdle();
        try { job.resolve(); } catch (e) {}
      }
    } finally {
      q.running = false;
    }
  };

  window.waitForCursorIdle = function(timeoutMs) {
    timeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 5000;
    return new Promise(function(resolve) {
      if (!window._pokeCursor_state) return resolve();
      var start = Date.now();
      var iv = setInterval(function() {
        if (!window._pokeCursor_state || (Date.now() - start > timeoutMs)) {
          clearInterval(iv);
          return resolve();
        }
      }, 8);
    });
  };

  window.cls = function() {
    window.pokeCursorOff();
    window.pokeText(0,0," ",800);
    window.pokeColor(0,0,window.CURFG, window.CURBG, 800);
    window.pokeAttr(0,0,0, 800);
    window.CURX=0; window.CURY=0; window.LINEX=0; window.LINEY=0;
    window.pokeCursorOn();
  };

  window.systemReady = async function() {
    window.print("\n[bgreen]Qandy Pocket\nComputer v.1l\n\n");
    window.print("[cyan]Alpha Testing\nPrototype Release\n\n");
    if (window.GUEST) {
      window.print("[yellow]Qandy User Access\n[white]\n");
      if (typeof window.qdosExists === "function") {
        if (await window.qdosExists("dir.sys")) {
          // if (await window.qdosExists("autoexec.js")) { window.qdosScript("autoexec.js"); }
        } else {
          window.print("localStorage not formated.\nInput \'sysop\' for access.\n\n");
        }
      }
    } else {
      window.print("[yellow]Qandy Sysop Access[white]\n\n");
      if (typeof window.qdosExists === "function") {
        if (!await window.qdosExists("dir.sys")) {
          window.print("localStorage not formated.\nInput \'fdisk\' to install.\n\n");
        }
      }
    }
  };

  window.press = function(event) {
    var k = event.keyCode;
    if (k === 20) {
      window.caps = !window.caps;
      if (typeof window.updateKeyLabels === 'function') window.updateKeyLabels();
      return;
    }
    window.button(k, event);
  };

  window.pressup = function(event) { };

  window.pokeCursorOn();

  if (window.HOST) {
    var s = document.createElement('script');
    s.id = 'dos.js';
    s.src = 'dos2.js';
    s.onload = function() { try { if (typeof window.dosMount === "function") window.dosMount("local"); } catch (e) { } };
    document.head.appendChild(s);
    window.systemReady();
  } else {
    window.systemReady();
  }

  if (typeof window.qandySignalReady === 'function') {
    window.qandySignalReady('qandy.js');
  }
}
