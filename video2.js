//
// ──── Qandy Video Graphics Adaptor ──────────────────────────────────────────────────
//
function video_js() {
  var cellGrid = [];
  var EMPTY_CELL = '\u00A0';
  function getW() { return (typeof W === 'number') ? W : 32; }
  function getH() { return (typeof H === 'number') ? H : 25; }
  function buildCellClass(fgCode, bgCode, attr) {
    var cls = 'qandy-cell ansi-fg-' + (fgCode | 0) + ' ansi-bg-' + (bgCode | 0);
    var a = attr | 0;
    if (a & 0x0001) cls += ' ansi-inverse';
    if (a & 0x0002) cls += ' ansi-bold';
    if (a & 0x0004) cls += ' ansi-dim';
    if (a & 0x0008) cls += ' ansi-italic';
    if (a & 0x0010) cls += ' ansi-underline';
    if (a & 0x0020) cls += ' ansi-blink';
    return cls;
  }
  initGrid();
  function initGrid() {
    var cols = getW(); var rows = getH();
    var container = document.getElementById('txt');
    if (!container) return false;
    container.innerHTML = ''; cellGrid = [];

    var frag = document.createDocumentFragment();
    var defaultFg = (typeof CURFG === 'number') ? CURFG : 37;
    var defaultBg = (typeof CURBG === 'number') ? CURBG : 40;
    var defaultCls = buildCellClass(defaultFg, defaultBg, 0);

    for (var y = 0; y < rows; y++) {
      var rowDiv = document.createElement('div');
      rowDiv.className = 'qandy-row';
      cellGrid[y] = new Array(cols);

      for (var x = 0; x < cols; x++) {
        var span = document.createElement('span');
        span.className = defaultCls;
        span._lastClass = defaultCls;
        span.textContent = EMPTY_CELL; // non-breaking space represents an empty cell
        rowDiv.appendChild(span);
        cellGrid[y][x] = span;
      }

      frag.appendChild(rowDiv);
    }

    container.appendChild(frag);
    return true;
  }

  window.pokeCursor = async function(t) {
    if (typeof t === 'undefined' || t === null) return false;
    var str = String(t);

    // parse numeric params into array of numbers (empty => [])
    function parseParams(s) {
      if (!s || !s.length) return [];
      var out = [], parts = s.split(';');
      for (var i = 0; i < parts.length; i++) { var v = parseInt(parts[i], 10); out.push(isNaN(v) ? 0 : v); }
      return out;
    }

    // handle CSI sequences: paramsStr (string), cmd (final byte)
    function handleCSI(paramsStr, cmd) {
      var params = parseParams(paramsStr);
      switch (cmd) {
        case 'm': // SGR - set graphics rendition (colors/attributes)
          if (!params.length) params = [0];
          for (var pi = 0; pi < params.length; pi++) {
            var p = params[pi] | 0;
            if (p === 0) { CURFG = 37; CURBG = 40; CURATTR = 0; }
            else if (p === 1)  { CURATTR |= (window.ATTR_BOLD    || 0x0002); }
            else if (p === 2)  { CURATTR |= (window.ATTR_DIM     || 0x0004); }
            else if (p === 3)  { CURATTR |= (window.ATTR_ITALIC  || 0x0008); }
            else if (p === 4)  { CURATTR |= (window.ATTR_UNDERLINE || 0x0010); }
            else if (p === 5)  { CURATTR |= (window.ATTR_BLINK   || 0x0020); }
            else if (p === 7)  { CURATTR |= (window.ATTR_INVERSE || 0x0001); }
            else if (p === 22) { CURATTR &= ~(window.ATTR_BOLD || 0x0002); CURATTR &= ~(window.ATTR_DIM || 0x0004); }
            else if (p === 23) { CURATTR &= ~(window.ATTR_ITALIC   || 0x0008); }
            else if (p === 24) { CURATTR &= ~(window.ATTR_UNDERLINE || 0x0010); }
            else if (p === 25) { CURATTR &= ~(window.ATTR_BLINK    || 0x0020); }
            else if (p === 27) { CURATTR &= ~(window.ATTR_INVERSE  || 0x0001); }
            else if (p >= 30 && p <= 37)   { CURFG = p; }
            else if (p >= 90 && p <= 97)   { CURFG = p; }
            else if (p >= 40 && p <= 47)   { CURBG = p; }
            else if (p >= 100 && p <= 107) { CURBG = p; }
          }
          break;
        case 'H': case 'f': // Cursor position (row;col) — 1-based
          CURY = Math.max(0, Math.min(H - 1, (params.length >= 1 && params[0] > 0) ? params[0] - 1 : 0));
          CURX = Math.max(0, Math.min(W - 1, (params.length >= 2 && params[1] > 0) ? params[1] - 1 : 0));
          break;
        case 'A': CURY = Math.max(0,     CURY - ((params.length >= 1 && params[0] > 0) ? params[0] : 1)); break; // up
        case 'B': CURY = Math.min(H - 1, CURY + ((params.length >= 1 && params[0] > 0) ? params[0] : 1)); break; // down
        case 'C': CURX = Math.min(W - 1, CURX + ((params.length >= 1 && params[0] > 0) ? params[0] : 1)); break; // forward
        case 'D': CURX = Math.max(0,     CURX - ((params.length >= 1 && params[0] > 0) ? params[0] : 1)); break; // backward
        case 'J': if (params.length >= 1 && params[0] === 2) cls(); break; // clear screen (2J)
      }
    }

    pokeCursorOff();

    var idx = 0;
    while (idx < str.length) {
      var ch = str.charAt(idx);
      if (CURANSI && ch === '\x1b') {
        var rest = str.slice(idx);
        var m = /^\x1b\[([0-9;]*)?([@A-Za-z])/.exec(rest);
        if (m) { handleCSI(m[1] || '', m[2]); idx += m[0].length; }
        else { idx++; }
        continue;
      }
      if (ch === '\n') {
        CURX = 0; CURY++;
        if (CURY >= H) { pokeScroll(); CURY = H-1; }
        LINEX=CURX; LINEY=CURY;
        if (typeof CURMORE === 'number' && CURMORE >= 0) {
          CURMORE++;
          if (CURMORE >= H-1) {
           pokeMenu("  Press ENTER to continue: ");
             let morePrompt= await input(false);
            CURMORE=0;
            pokeMenu();
          }
        }
        idx++; continue;
      }
      pokeCell(CURX, CURY, ch, CURFG, CURBG, CURATTR);
      CURX++;
      if (CURX >= W) {
        CURX = 0; CURY++;
        if (CURY >= H) { pokeScroll(); CURY = H-1; }
        LINEX=CURX; LINEY=CURY;
        if (typeof CURMORE === 'number' && CURMORE >= 0) {
          CURMORE++;
          if (CURMORE >= H-1) {
            pokeMenu("  Press ENTER to continue: ");
            let morePrompt= await input(false);
            pokeMenu();
            CURMORE=0;
          }
        }
      }
      LINEX = CURX; LINEY = CURY;
      idx++;
    }
    pokeCursorOn();
    return true;
  };

  let lastx=0; let lasty=0;
  window.pokeModem = function(t) {
    if (typeof t === 'undefined' || t === null) return false;
    // Cancel any existing paced output and start fresh
    if (window._pokeCursor_state && window._pokeCursor_state.timer) {
      clearTimeout(window._pokeCursor_state.timer);
    } 
    window._pokeCursor_state = null;
    var str = String(t);

    // parse numeric params into array of numbers (empty => [])
    function parseParams(paramStr) {
      if (!paramStr || paramStr.length === 0) return [];
      return paramStr.split(';').map(function(p){ var v = parseInt(p,10); return isNaN(v) ? 0 : v; });
    }

    // handle CSI sequences: paramsStr (string), cmd (final byte)
    function handleCSI(paramsStr, cmd) {
      var params = parseParams(paramsStr);
      switch (cmd) {
        case 'm': // SGR - set graphics rendition (colors/attributes)
          if (!params.length) params = [0];
          for (var pi = 0; pi < params.length; pi++) {
            var p = params[pi] | 0;
            switch (p) {
              case 0: // reset
                CURFG = 37; CURBG = 40; CURATTR = 0; break;
              case 1: // bold
                CURATTR = (CURATTR | (window.ATTR_BOLD || 0x0002)); break;
              case 2: // dim
                CURATTR = (CURATTR | (window.ATTR_DIM || 0x0004)); break;
              case 3: // italic
                CURATTR = (CURATTR | (window.ATTR_ITALIC || 0x0008)); break;
              case 4: // underline
                CURATTR = (CURATTR | (window.ATTR_UNDERLINE || 0x0010)); break;
              case 22: // normal intensity (clear bold & dim)
                CURATTR &= ~(window.ATTR_BOLD || 0x0002);
                CURATTR &= ~(window.ATTR_DIM  || 0x0004); break;
              case 23: // clear italic
                CURATTR &= ~(window.ATTR_ITALIC || 0x0008); break;
              case 24: // clear underline
                CURATTR &= ~(window.ATTR_UNDERLINE || 0x0010); break;
              case 7: // inverse
                CURATTR = (CURATTR | (window.ATTR_INVERSE || 0x0001)); break;
              case 27: // clear inverse
                CURATTR &= ~(window.ATTR_INVERSE || 0x0001); break;
              default:
                if (p >= 30 && p <= 37) { CURFG = p; break; }
                if (p >= 90 && p <= 97) { CURFG = p; break; }
                if (p >= 40 && p <= 47) { CURBG = p; break; }
                if (p >= 100 && p <= 107) { CURBG = p; break; }
                // Note: extended colors (38;5;.., 38;2;.. ) not implemented here
                break;
            }
          }
          break;

        case 'H': // Cursor position (row;col) — 1-based
        case 'f':
          var row = (params.length >= 1 && params[0] > 0) ? (params[0] - 1) : 0;
          var col = (params.length >= 2 && params[1] > 0) ? (params[1] - 1) : 0;
          if (typeof row === 'number') CURY = Math.max(0, Math.min(H - 1, row));
          if (typeof col === 'number') CURX = Math.max(0, Math.min(W - 1, col));
          break;
        case 'A': // Cursor up
          var nA = (params.length >= 1 && params[0] > 0) ? params[0] : 1;
          CURY = Math.max(0, CURY - nA);
          break;
        case 'B': // Cursor down
          var nB = (params.length >= 1 && params[0] > 0) ? params[0] : 1;
          CURY = Math.min(H - 1, CURY + nB);
          break;
        case 'C': // Cursor forward
          var nC = (params.length >= 1 && params[0] > 0) ? params[0] : 1;
          CURX = Math.min(W - 1, CURX + nC);
          break;
        case 'D': // Cursor backward
          var nD = (params.length >= 1 && params[0] > 0) ? params[0] : 1;
          CURX = Math.max(0, CURX - nD);
          break;
        case 'J': // Erase in Display
          if (params.length === 0 || params[0] === 0) {
            // not implemented (cursor to end)
          } else if (params[0] === 1) {
            // not implemented (start to cursor)
          } else { 
            if (params[0] === 2) {
              // clear entire screen
              // this needs to be updated to use its own internal function
              cls();
            }            
          }
          break;
        default:
          // unsupported CSI — ignore
          break;
      }
    }

    // characters per millisecond based on CURBAUD (10 bits per character)
    var charsPerMs = (typeof CURBAUD === 'number' && CURBAUD > 0) ? CURBAUD / 10000 : 0;

    // paced/asynchronous processing using performance.now() token-bucket accumulator
    var state = {
      str: str,
      idx: 0,
      timer: null,
      stopped: false,
      startTime: performance.now(),
      charsEmitted: 0
    };
    window._pokeCursor_state = state;

    function scheduleNext() {
      if (!state || state.stopped) return;
      var delay = 0;
      if (charsPerMs) {
        // schedule for when the next character is due
        var nextMs = state.startTime + (state.charsEmitted + 1) / charsPerMs;
        delay = Math.max(0, nextMs - performance.now());
      }
      state.timer = setTimeout(processStep, delay);
    }

    function processStep() {
      if (!state || state.stopped) return;

      // how many characters may be emitted on this tick
      var charsAllowed = charsPerMs
        ? Math.floor((performance.now() - state.startTime) * charsPerMs)
        : state.str.length + 1;

      pokeCursorOff();

      while (state.idx < state.str.length && state.charsEmitted < charsAllowed) {
        var ch = state.str.charAt(state.idx);

        // handle CSI atomically (no intra-sequence delay)
        if (CURANSI && ch === '\x1b') {
          var rest = state.str.slice(state.idx);
          var m = /^\x1b\[([0-9;]*)?([@A-Za-z])/.exec(rest);
          if (m) {
            handleCSI(m[1] || '', m[2]);
            state.idx += m[0].length;
          } else {
            // unknown escape — skip it
            state.idx++;
          }
          state.charsEmitted++;
          continue;
        }

        if (ch === '\n') {
          CURX = 0;
          CURY = CURY + 1;
          if (CURY >= H) { pokeScroll(); CURY = H - 1; CURX = Math.min(CURX, W - 1); }
          LINEX = CURX; LINEY = CURY;
          state.idx++;
          state.charsEmitted++;
          continue;
        }

        pokeCell(CURX, CURY, ch, CURFG, CURBG, CURATTR);
        if (SOUND && typeof beep === 'function') { try { beep(900, 25, 0.01); } catch (e) {}}

        CURX = CURX + 1;
        if (CURX >= W) {
          CURX = 0; CURY = CURY + 1;
          if (CURY >= H) {
            pokeScroll();
            CURY = H - 1; CURX = Math.min(CURX, W - 1);
          }
        }
        LINEX = CURX; LINEY = CURY;

        state.idx++;
        state.charsEmitted++;
      }

      pokeCursorOn();

      if (state.idx >= state.str.length) {
        window._pokeCursor_state = null;
        return;
      }

      scheduleNext();
    }

    // start paced output
    scheduleNext();
    return true;
  };


  window.pokeMenu = function(t) {
    if (t) {
      console.log("pokeMenu t="+t);
      for (var x=0; x<W; x++) { var ch=x<t.length ? t[x] : ' '; pokeCell(x, H - 1, ch, MENUFG, MENUBG, 0); }
      return;
    } 
    console.log("pokeMenu t=null, erase menu");
    for (var x=0; x<W; x++) { pokeCell(x, H - 1, ' ', CURFG, CURBG, 0); }
    return;
  }

  var FALLBACK_FG = {
   black:30, red:31, green:32, yellow:33, blue:34, magenta:35, cyan:36, white:37,
    b right_black:90, bright_red:91, bright_green:92, bright_yellow:93, bright_blue:94, bright_magenta:95, bright_cyan:96, bright_white:97
  };
  var FALLBACK_BG = {
    black:40, red:41, green:42, yellow:43, blue:44, magenta:45, cyan:46, white:47,
    bright_black:100, bright_red:101, bright_green:102, bright_yellow:103, bright_blue:104, bright_magenta:105, bright_cyan:106, bright_white:107
  };
  function _lookupFg(name) {
    if (!name) return undefined;
    var key = String(name).toLowerCase();
    if (window && window.ANSI_NAME_TO_FG && typeof window.ANSI_NAME_TO_FG[key] !== 'undefined') return window.ANSI_NAME_TO_FG[key];
    if (FALLBACK_FG[key]) return FALLBACK_FG[key];
    return undefined;
  }
  function _lookupBg(name) {
    if (!name) return undefined;
    var key = String(name).toLowerCase();
    if (window && window.ANSI_NAME_TO_BG && typeof window.ANSI_NAME_TO_BG[key] !== 'undefined') return window.ANSI_NAME_TO_BG[key];
    if (FALLBACK_BG[key]) return FALLBACK_BG[key];
    return undefined;
  }
  var ATTR_MAP = {
    reset: 0, default:0, 0:0,
    bold: 1, dim: 2, italic: 3, underline: 4, inverse: 7
  };

  //
  // pokeText needs to work with the DOM engine
  //
  window.pokeText = function(x, y, t, n) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (typeof t === 'undefined' || t === null) return false;
    n = (typeof n === 'undefined' || n === null) ? 1 : parseInt(n, 10);
    if (isNaN(n) || n < 1) n = 1;
    var str = String(t);
    var cx = x, cy = y;
    for (var repeat = 0; repeat < n; repeat++) {
      for (var i = 0; i < str.length; i++) {
        var c = str[i];
        if (c === '\n') {
          cx = 0; cy++;
          if (typeof H === 'number' && cy >= H) { // reached bottom of screen
            if (SYNC) { pokeRefresh(); } 
            return false;
          }
          continue;
        }
        if (typeof W === 'number' && cx >= W) {
          cx=0; cy++;
          if (typeof H === 'number' && cy >= H) {
           if (SYNC) { pokeRefresh(); } 
           return false;
          }
        }
        VIDEO[cy][cx]=c; cx++;
      }
    }
    if (SYNC) { pokeRefresh(); } 
    return true;
  };

  function pokeCell(x, y, ch, fg, bg, attr) {
    var cols = getW();
    var rows = getH();

    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (x < 0 || x >= cols || y < 0 || y >= rows) return false;

    // Normalise character
    if (typeof ch === 'undefined' || ch === null) ch = ' ';
    ch = String(ch).charAt(0) || ' ';

    // Resolve color / attribute values, falling back to current cursor state
    var fgCode  = (typeof fg   === 'number') ? (fg   | 0) : ((typeof CURFG   === 'number') ? CURFG   : 37);
    var bgCode  = (typeof bg   === 'number') ? (bg   | 0) : ((typeof CURBG   === 'number') ? CURBG   : 40);
    var attrVal = (typeof attr === 'number') ? (attr | 0) : ((typeof CURATTR === 'number') ? CURATTR : 0);

    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return false;

    // Update text — use EMPTY_CELL so the cell retains its visual width
    var newText = (ch === ' ') ? EMPTY_CELL : ch;
    if (span.textContent !== newText) span.textContent = newText;

    // Update class only when it has changed (avoids style recalculation)
    var cls = buildCellClass(fgCode, bgCode, attrVal);
    if (span._lastClass !== cls) {
      span.className = cls;
      span._lastClass = cls;
    }

    return true;
  }

  //
  // pokeColor needs to work with DOM engine
  // 
  window.pokeColor = function(x, y, f, b, n) {
    if (!validateCoords(x, y)) return false;
    if (typeof f === 'undefined') { f = CURFG; }
    if (typeof b === 'undefined') { b = CURBG; }
    var count = (typeof n === 'number' && n > 0) ? Math.floor(n) : 1;
    var offset = 0;
    while (count > 0) {
     var abs=x+offset;
     var row=y+Math.floor(abs/W);
      var col=abs % W;
      if (row >= H) break;
      FCOLOR[row][col]=f;
      BCOLOR[row][col]=b;
      if (SYNC) { pokeRefresh(col,row); }
      offset++;
      count--;
    }
    return true;
  };

  // there should be a poke function that already does this??
  window.eraseInput = function(text) {
  }

  window.pokeInput = function() {
    if (typeof lastin === 'undefined') { lastin="";  }
    if (lastin != "") {
      var str = String(lastin); var curx = LINEX; var cury = LINEY;
      for (var i = 0; i < str.length; i++) {
        var char = str[i];
        if (char === '\n') { 
          curx = 0; cury++; if (cury >= H) { return false; } continue;
          if (curx >= W) { curx = 0; cury++; if (cury >= H) { return false; } }
        }
        pokeCell(curx, cury, " "); curx++;
      }
    }
    var curx = LINEX; var cury = LINEY;
    for (var i = 0; i < LINE.length; i++) {
      var char = LINE[i];
      if (char === '\n') { 
       curx = 0; cury++; 
       if (cury >= H) { return false; }
       continue;
      }
      if (curx >= W) { 
       curx = 0; cury++; 
       if (cury >= H) { return false; }
      }
      pokeCell(curx, cury, char); curx++;
      if (SYNC) { pokeRefresh(curx, cury); }
    }
    var str = (typeof LINE === 'string') ? LINE : String(LINE || "");
    var targetP = (typeof CURP === 'number') ? CURP : str.length;
    if (targetP < 0) targetP = 0;
    if (targetP > str.length) targetP = str.length;
    var newX, newY;
    var absCol = (typeof LINEX === 'number' ? LINEX : 0) + targetP;
    newY = (typeof LINEY === 'number' ? LINEY : 0) + Math.floor(absCol / W);
    newX = absCol % W;
    if (newY < 0) newY = 0;
    if (newY >= H) newY = H - 1;
    if (newX < 0) newX = 0;
    if (newX >= W) newX = W - 1;
    CURX = newX;
    CURY = newY;
  
    lastin = str;
    return true;
  };

  // no pokeRefresh needed with DOM engine
  function domPokeRefresh(/* x, y, n */) { return true; }

  window.ANSI = {
    colors: {
      30: '#000000', 31: '#aa0000', 32: '#00aa00', 33: '#aa5500', 34: '#0000aa', 35: '#aa00aa', 36: '#00aaaa', 37: '#aaaaaa',
      90: '#555555', 91: '#ff5555', 92: '#55ff55', 93: '#ffff55', 94: '#5555ff', 95: '#ff55ff', 96: '#55ffff', 97: '#ffffff'
    },
    bgColors: {
      40: '#000000', 41: '#aa0000', 42: '#00aa00', 43: '#aa5500', 44: '#0000aa', 45: '#aa00aa', 46: '#00aaaa', 47: '#aaaaaa',
      100: '#555555', 101: '#ff5555', 102: '#55ff55', 103: '#ffff55', 104: '#5555ff', 105: '#ff55ff', 106: '#55ffff', 107: '#ffffff'
    },
    render: function(text) {
      let html = ''; let currentColor = 'white'; let currentBgColor = 'black'; let bold = false; let inverse = false; let cX = 0; let cY = 0;
      const ansiRegex = /\x1b\[([\d;]*)([A-Za-z])/g; let lastIndex = 0; let match;
      while ((match = ansiRegex.exec(text)) !== null) {
        html += this.escapeHtml(text.substring(lastIndex, match.index));
        const params = match[1] ? match[1].split(';').map(Number) : [0];
        const command = match[2];
        if (command === 'm') {
          params.forEach(param => {
            if (param === 0) {
              currentColor = 'white';
              currentBgColor = 'black';
              bold = false;
              inverse = false;
            } else if (param === 1) {
              bold = true;
            } else if (param === 7) {
              inverse = true;
            } else if (param === 27) {
              inverse = false;
            } else if (param >= 30 && param <= 37) {
              currentColor = this.colors[param];
            } else if (param >= 40 && param <= 47) {
              currentBgColor = this.bgColors[param];
            }
          });
        } else if (command === 'H' || command === 'f') {
          cY = params[0] || 0;
          cX = params[1] || 0;
        } else if (command === 'A') {
          cY = Math.max(0, cY - (params[0] || 1));
        } else if (command === 'B') {
          cY += (params[0] || 1);
        } else if (command === 'C') {
          cX += (params[0] || 1);
        } else if (command === 'D') {
          cX = Math.max(0, cX - (params[0] || 1));
        } else if (command === 'J') {
          if (params[0] === 2) {
            html = ''; // Clear screen 
          }
        } else if (command === 'K') {
        }
        lastIndex = match.index + match[0].length;
      }
      html += this.escapeHtml(text.substring(lastIndex));
      let classes = [];
      if (bold) classes.push('ansi-bold');
      if (inverse) classes.push('ansi-inverse');
      classes.push(`ansi-${currentColor}`);
      classes.push(`ansi-bg-${currentBgColor}`);
      if (classes.length > 0) { html = `<span class="${classes.join(' ')}">${html}</span>`; }
      return html;
    },

    escapeHtml: function(text) {
      const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
      return text.replace(/[&<>"']/g, m => map[m]);
    },

    codes: {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      inverse: '\x1b[7m',
      black: '\x1b[30m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
      white: '\x1b[37m',
      bgBlack: '\x1b[40m',
      bgRed: '\x1b[41m',
      bgGreen: '\x1b[42m',
      bgYellow: '\x1b[43m',
      bgBlue: '\x1b[44m',
      bgMagenta: '\x1b[45m',
      bgCyan: '\x1b[46m',
      bgWhite: '\x1b[47m',
      cursorHome: '\x1b[H',
      cursorPos: (row, col) => `\x1b[${row};${col}H`,
      cursorUp: (n = 1) => `\x1b[${n}A`,
      cursorDown: (n = 1) => `\x1b[${n}B`,
      cursorForward: (n = 1) => `\x1b[${n}C`,
      cursorBack: (n = 1) => `\x1b[${n}D`,
      clearScreen: '\x1b[2J',
      clearLine: '\x1b[K',
      pageBreak: '\f'  // Form Feed (ASCII 12, 0x0C) - explicit page break for pagination
    }
  };

  window.ANSI=ANSI;
  window.COLOR = {
    // Foreground colors (30-37)
    BLACK: 30, RED: 31, GREEN: 32, YELLOW: 33, BLUE: 34, MAGENTA: 35, CYAN: 36, WHITE: 37,
    // Bright foreground colors (90-97)
    BRIGHT_BLACK: 90, BRIGHT_RED: 91, BRIGHT_GREEN: 92, BRIGHT_YELLOW: 93,
    BRIGHT_BLUE: 94, BRIGHT_MAGENTA: 95, BRIGHT_CYAN: 96, BRIGHT_WHITE: 97,
    // Background colors (40-47)
    BG_BLACK: 40, BG_RED: 41, BG_GREEN: 42, BG_YELLOW: 43, BG_BLUE: 44, BG_MAGENTA: 45, BG_CYAN: 46, BG_WHITE: 47,
    // Bright background colors (100-107) 
    BG_BRIGHT_BLACK: 100, BG_BRIGHT_RED: 101, BG_BRIGHT_GREEN: 102, BG_BRIGHT_YELLOW: 103,
    BG_BRIGHT_BLUE: 104, BG_BRIGHT_MAGENTA: 105, BG_BRIGHT_CYAN: 106, BG_BRIGHT_WHITE: 107
  };

  var defaultColor = (window.currentStyle && typeof window.currentStyle.color !== 'undefined') ? window.currentStyle.color : 37;
  var defaultBg    = (window.currentStyle && typeof window.currentStyle.bgcolor !== 'undefined') ? window.currentStyle.bgcolor : 40;

  //
  // pokeFG needs to work with DOM engine
  //
  window.pokeFG = function(x, y, fg, count) {
    // Getter: if fg is undefined, return current fg value or undefined if out-of-bounds
    if (typeof fg === 'undefined') {
      if (typeof validateCoords === 'function') {
        if (!validateCoords(x, y)) return undefined;
      } else {
        if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || y < 0 || y >= H || x >= W) return undefined;
      }
      if (window.FCOLOR && FCOLOR[y] && typeof FCOLOR[y][x] !== 'undefined') return FCOLOR[y][x] | 0;
      if (window.COLOR && COLOR[y] && COLOR[y][x] && typeof COLOR[y][x].color !== 'undefined') return COLOR[y][x].color | 0;
      return (typeof window.defaultColor !== 'undefined') ? window.defaultColor : 37;
    }

    // Validate coords
    if (typeof validateCoords === 'function') {
      if (!validateCoords(x, y)) return false;
    } else {
      if (typeof x !== 'number' || typeof y !== 'number') return false;
      if (x < 0 || y < 0 || y >= H || x >= W) return false;
    }

    // normalize count default=1 and clamp to remaining cells on screen
    count = (typeof count === 'number' && count > 0) ? Math.floor(count) : 1;
    var maxRemaining = Math.max(0, W * H - (y * W + x));
    if (count > maxRemaining) count = maxRemaining;
    if (count <= 0) return false;

    // ensure banks exist
    if (!window.FCOLOR) FCOLOR = [];
    if (!FCOLOR[y]) FCOLOR[y] = new Uint8Array(W);

    // resolve numeric code from name or number
    var fgCode;
    if (typeof fg === 'number') {
      fgCode = fg | 0;
    } else if (typeof fg === 'string' && fg.length) {
      var name = fg.toLowerCase();
      fgCode = (window.ANSI_NAME_TO_FG && typeof window.ANSI_NAME_TO_FG[name] !== 'undefined')
        ? (window.ANSI_NAME_TO_FG[name] | 0)
        : ((typeof window.defaultColor !== 'undefined') ? window.defaultColor : 37);
    } else {
      fgCode = (typeof window.defaultColor !== 'undefined') ? window.defaultColor : 37;
    }

    // write span
    for (var i = 0; i < count; i++) {
      var cx = x + i;
      FCOLOR[y][cx] = fgCode;
      if (window.COLOR && COLOR[y] && COLOR[y][cx]) COLOR[y][cx].color = fgCode;
    }

    // refresh
    if (typeof pokeRefreshRow === 'function') {
      try { pokeRefreshRow(x, y, count); } catch (e) { for (var r = 0; r < count; r++) try { pokeRefresh(x + r, y); } catch(e){} }
    } else {
      for (var j = 0; j < count; j++) try { pokeRefresh(x + j, y); } catch(e){}
    }

    return count;
  };

  //
  // pokeFG needs to work with DOM engine
  //
  window.pokeBG = function(x, y, bg, count) {
    // Getter: if bg is undefined, return current bg value or undefined if out-of-bounds
    if (typeof bg === 'undefined') {
      if (typeof validateCoords === 'function') {
        if (!validateCoords(x, y)) return undefined;
      } else {
        if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || y < 0 || y >= H || x >= W) return undefined;
      }
      if (window.BCOLOR && BCOLOR[y] && typeof BCOLOR[y][x] !== 'undefined') return BCOLOR[y][x] | 0;
      if (window.COLOR && COLOR[y] && COLOR[y][x] && typeof COLOR[y][x].bgcolor !== 'undefined') return COLOR[y][x].bgcolor | 0;
      return (typeof window.defaultBg !== 'undefined') ? window.defaultBg : 40;
    }

    if (typeof validateCoords === 'function') {
      if (!validateCoords(x, y)) return false;
    } else {
      if (typeof x !== 'number' || typeof y !== 'number') return false;
      if (x < 0 || y < 0 || y >= H || x >= W) return false;
    }

    // normalize count default=1 and clamp to remaining cells on screen
    count = (typeof count === 'number' && count > 0) ? Math.floor(count) : 1;
    var maxRemaining = Math.max(0, W * H - (y * W + x));
    if (count > maxRemaining) count = maxRemaining;
    if (count <= 0) return false;

    // resolve numeric code from name or number
    var bgCode;
    if (typeof bg === 'number') {
      bgCode = bg | 0;
    } else if (typeof bg === 'string' && bg.length) {
      var name = bg.toLowerCase();
      bgCode = (window.ANSI_NAME_TO_BG && typeof window.ANSI_NAME_TO_BG[name] !== 'undefined')
        ? (window.ANSI_NAME_TO_BG[name] | 0)
        : ((typeof window.defaultBg !== 'undefined') ? window.defaultBg : 40);
    } else {
      bgCode = (typeof window.defaultBg !== 'undefined') ? window.defaultBg : 40;
    }

    // this does not advance cursor to next line!!
    for (var i = 0; i < count; i++) {
      var cx = x + i; BCOLOR[y][cx] = bgCode;
    }
    if (SYNC) { pokeRefresh(x, y, count); } 
    return count;
  };

  //
  // pokeAttr needs to work with DOM engine
  //
  window.pokeAttr = function(x, y, attrValue, n) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (typeof attrValue !== 'number') return false;
  
    n = (typeof n === 'number' && n > 0) ? Math.floor(n) : 1;
    attrValue = attrValue | 0;
  
    var remaining = n;
    var cx = x | 0;
    var cy = y | 0;
    var written = 0;
  
    while (remaining > 0 && cy < H) {
      var space = W - cx;        // cells left in current row
      var take = Math.min(remaining, space);  // how many to write this iteration
    
      // Fast fill for the current row
      for (var i = 0; i < take; i++) {
        ATTR[cy][cx + i] = attrValue;
      }
    
      if (SYNC && typeof pokeRefresh === 'function') {
        pokeRefresh(cx, cy, take);  // Refresh this row segment
      }
    
      written += take;
      remaining -= take;
      cx = 0;
      cy++;
    }
  
    return (n === 1) ? true : written;
  };

  //
  // pokeAttrBit needs to work with DOM engine
  //
  window.pokeAttrBit = function(x, y, bit, state) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (typeof validateCoords === 'function' && !validateCoords(x, y)) return false;
    if (state) { ATTR[y][x] |= bit; } else { ATTR[y][x] &= ~bit; }
    if (SYNC) { pokeRefresh(x, y); }
    return true;
  };

  //
  // pokeInverse needs to work with DOM engine
  //
  window.pokeInverse = function(x, y, state, n) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (typeof n === 'number' && n > 1) {
      var endX = x + n;
      for (var xi = x; xi < endX; xi++) {
    	  pokeAttrBit(xi, y, window.ATTR_INVERSE, !!state);
      }
      return n;
    }
    pokeAttrBit(x, y, window.ATTR_INVERSE, !!state);
    pokeRefresh(x,y);
    return true;
  };
  
  //
  // pokeBlink(x, y, state, n) does not exist, it should 
  //
  window.pokeBlink{ 
  } 

  //
  // pokeLine(x, y, state, n) does not exist, it should, 'line' for underline 
  //
  window.pokeBlink{ 
  } 

  window.pokeSelect = function(state) {
    if (typeof SSTART !== 'number' || typeof SEND !== 'number') return false;
    if (SSTART < 0 || SEND < 0) return false;
    var s = Math.min(SSTART, SEND);
    var e = Math.max(SSTART, SEND);
    var count = e - s;
    if (count <= 0) return false;
    var absCol = (typeof LINEX === 'number' ? LINEX : 0) + s;
    var startY = (typeof LINEY === 'number' ? LINEY : 0) + Math.floor(absCol / W);
    var startX = absCol % W;
    // pokeInverse expects (x, y, state, count)
    return pokeInverse(startX, startY, !!state, count);
  }
  

  // getCellStyle(x,y) - prefer numeric banks (FCOLOR/BCOLOR), fallback to COLOR objects and ATTR bits
  window.getCellStyle = function(x, y) {
    var defaultFG = (typeof window.defaultColor !== 'undefined') ? window.defaultColor : 37;
    var defaultBG = (typeof window.defaultBg !== 'undefined') ? window.defaultBg : 40;

    // validate coords: return safe defaults if out-of-range
    if (typeof x !== 'number' || typeof y !== 'number' || x < 0 || y < 0 || y >= H || x >= W) {
      return { color: defaultFG, bgcolor: defaultBG, bold:false, inverse:false, italic:false, underline:false, dim:false, blink:false };
    }

    // read numeric banks first (preferred)
    var fg = defaultFG; var bg = defaultBG;

    if (window.FCOLOR && FCOLOR[y] && typeof FCOLOR[y][x] !== 'undefined') {
      fg = FCOLOR[y][x] | 0;
    } else if (window.COLOR && COLOR[y] && COLOR[y][x] && typeof COLOR[y][x].color !== 'undefined') {
      fg = COLOR[y][x].color | 0;
    }

    if (window.BCOLOR && BCOLOR[y] && typeof BCOLOR[y][x] !== 'undefined') {
      bg = BCOLOR[y][x] | 0;
    } else if (window.COLOR && COLOR[y] && COLOR[y][x] && typeof COLOR[y][x].bgcolor !== 'undefined') {
      bg = COLOR[y][x].bgcolor | 0;
    }

    // read ATTR bitmask (if present)
    var attr = 0; if (window.ATTR && ATTR[y] && typeof ATTR[y][x] !== 'undefined') { attr = ATTR[y][x] | 0; }

    var s = {
      color: fg,
      bgcolor: bg,
      bold:     !!(attr & (window.ATTR_BOLD      || 0x0002)),
      dim:      !!(attr & (window.ATTR_DIM       || 0x0004)),
      italic:   !!(attr & (window.ATTR_ITALIC    || 0x0008)),
      underline:!!(attr & (window.ATTR_UNDERLINE || 0x0010)),
      blink:    !!(attr & (window.ATTR_BLINK     || 0x0020)),
      inverse:  !!(attr & (window.ATTR_INVERSE   || 0x0001)),
      hidden:   !!(attr & (window.ATTR_HIDDEN    || 0x0080))
    };

    // Visual inverse: swap fg/bg for rendering only (do not modify banks)
    if (s.inverse) {
      var t = s.color; s.color = s.bgcolor; s.bgcolor = t;
    }
 
    return s;
  };

  function validateCoords(x, y) { return (typeof x === 'number' && typeof y === 'number' && x >= 0 && y >= 0 && x < W && y < H); }

  var prevX = -1;
  var prevY = -1;
  var prevCode = CURSOR;
  var prevAttr=0;
  var _ansiCssMap = {30:'#000',31:'#c00',32:'#0c0',33:'#cc0',34:'#00c',35:'#c0c',36:'#0cc',37:'#ccc',
                     90:'#555',91:'#f55',92:'#5f5',93:'#ff5',94:'#55f',95:'#f5f',96:'#5ff',97:'#fff',
                     40:'#000',41:'#c00',42:'#0c0',43:'#cc0',44:'#00c',45:'#c0c',46:'#0cc',47:'#ccc'};

  //
  //  pokeCursorOn needs to work with DOM engine
  //
  window.pokeCursorOn = function() {
    if (typeof CURSOR === 'undefined' || typeof CURX === 'undefined' || typeof CURY === 'undefined') return;
    if (CURSOR === 0) return; // cursor off
    var sx = Math.max(0, Math.min(W-1, CURX|0));
    var sy = Math.max(0, Math.min(H-1, CURY|0));
    var prevAttr = (typeof peekAttr === 'function') ? peekAttr(sx, sy) : (ATTR && ATTR[sy] ? ATTR[sy][sx] : 0);  
    if (CURSOR === 1 || CURSOR === 3) { // line cursor: underline
      if (typeof window.ATTR_UNDERLINE !== 'undefined') pokeAttrBit(sx, sy, window.ATTR_UNDERLINE, true);
      if (CURSOR === 3 && typeof window.ATTR_BLINK !== 'undefined') pokeAttrBit(sx, sy, window.ATTR_BLINK, true);
    }
    if (CURSOR === 4 || CURSOR === 5) { // block cursor: inverse
      if (typeof window.ATTR_INVERSE !== 'undefined') pokeAttrBit(sx, sy, window.ATTR_INVERSE, true);
      if (CURSOR === 5 && typeof window.ATTR_BLINK !== 'undefined') pokeAttrBit(sx, sy, window.ATTR_BLINK, true);
    }
  }

  //
  //  pokeCursorOff needs to work with DOM engine
  //
  window.pokeCursorOff = function() {
    if (typeof prevAttr === 'undefined' || prevAttr === null) return false;
    ATTR[CURY][CURX] = prevAttr;
    pokeRefresh(CURX,CURY);
    prevAttr="";
    return true;
  }

  //
  // pokeScroll needs to work with DOM engine
  //
  window.pokeScroll = function() {
    var VRow=new Array(W);
    var FRow=new Array(W);
    var BRow=new Array(W);
    var ARow=new Array(W);
    for (var i=0; i<W; i++) {
      VRow[i] = ' ';
      FRow[i] = CURFG;
      BRow[i] = CURBG;
      ARow[i] = CURATTR;
    }
    VIDEO.shift(); VIDEO.push(VRow.slice());
    FCOLOR.shift(); FCOLOR.push(FRow.slice());
    BCOLOR.shift(); BCOLOR.push(BRow.slice());
    ATTR.shift(); ATTR.push(ARow.slice());
    CURY  = clampRow((typeof CURY === 'number' ? CURY : 0) - 1);
    LINEY = clampRow((typeof LINEY === 'number' ? LINEY : 0) - 1);
    CURX  = Math.max(0, Math.min(W - 1, (typeof CURX === 'number' ? CURX : 0)));
    LINEX = Math.max(0, Math.min(W - 1, (typeof LINEX === 'number' ? LINEX : 0)));
    if (SYNC) { pokeRefresh(); }
    return true;
  };

  function clampRow(r) { if (typeof r !== 'number' || isNaN(r)) return 0; if (r < 0) return 0; if (r >= H) return H - 1; return r; }


  window.peekCell=function(x,y) {
    var cols = getW(); var rows = getH();
    if (typeof x !== 'number' || typeof y !== 'number') return undefined;
    if (x < 0 || x >= cols || y < 0 || y >= rows) return undefined;
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return undefined;
    var txt = span.textContent;
    // Treat EMPTY_CELL (our empty-cell sentinel) as a regular space
    return (txt === EMPTY_CELL || txt === '') ? ' ' : txt;
  }

  window.peekAttr = function(x,y) { return (ATTR && ATTR[y]) ? ATTR[y][x] : undefined; };
  window.peekChar = function(x, y) { return validateCoords(x, y) ? VIDEO[y][x] : undefined; };  
  window.peekInverse = function(x, y) {
    if (typeof x !== 'number' || typeof y !== 'number') return undefined;
    if (!validateCoords(x, y)) return undefined;
    if (window.ATTR && ATTR[y] && typeof ATTR[y][x] !== 'undefined') {
      return !!(ATTR[y][x] & (window.ATTR_INVERSE || 0x0001));
    }
    return undefined;
  };

  // Signal that video.js is ready
  if (typeof window.qandySignalReady === 'function') {
    window.qandySignalReady('video.js');
  }
}
