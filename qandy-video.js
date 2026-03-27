function video_js() {
  // --- Video Globals ---
  window.W = 32; // screen width
  window.H = 25; // screen height
  window.SYNC = true; // keeps DOM in sync with video

  // Attribute bit constants
  window.ATTR_INVERSE    = 0x0001;
  window.ATTR_BOLD       = 0x0002;
  window.ATTR_DIM        = 0x0004;
  window.ATTR_ITALIC     = 0x0008;
  window.ATTR_UNDERLINE  = 0x0010;
  window.ATTR_BLINK      = 0x0020;
  window.ATTR_RAPIDBLINK = 0x0040;
  window.ATTR_HIDDEN     = 0x0080;
  window.ATTR_STRIKE     = 0x0100;
  window.ATTR_OVERLINE   = 0x0200;

  // ANSI Colors
  window.ANSIblack = "\x1b[30m";
  window.ANSIred = "\x1b[31m";
  window.ANSIgreen = "\x1b[32m";
  window.ANSIyellow = "\x1b[33m";
  window.ANSIblue = "\x1b[34m";
  window.ANSImagenta = "\x1b[35m";
  window.ANSIcyan = "\x1b[36m";
  window.ANSIwhite = "\x1b[37m";
  window.ANSIreset = "\x1b[0m";

  window.ANSIblack_bright = "\x1b[90m";
  window.ANSIred_bright = "\x1b[91m";
  window.ANSIgreen_bright = "\x1b[92m";
  window.ANSIyellow_bright = "\x1b[93m";
  window.ANSIblue_bright = "\x1b[94m";
  window.ANSImagenta_bright = "\x1b[95m";
  window.ANSIcyan_bright = "\x1b[96m";
  window.ANSIwhite_bright = "\x1b[97m";

  window.ANSIbgblack = "\x1b[40m";
  window.ANSIbgred = "\x1b[41m";
  window.ANSIbggreen = "\x1b[42m";
  window.ANSIbgyellow = "\x1b[43m";
  window.ANSIbgblue = "\x1b[44m";
  window.ANSIbgmagenta = "\x1b[45m";
  window.ANSIbgcyan = "\x1b[46m";
  window.ANSIbgwhite = "\x1b[47m";

  window.ANSIbgblack_bright = "\x1b[100m";
  window.ANSIbgred_bright = "\x1b[101m";
  window.ANSIbggreen_bright = "\x1b[102m";
  window.ANSIbgyellow_bright = "\x1b[103m";
  window.ANSIbgblue_bright = "\x1b[104m";
  window.ANSIbgmagenta_bright = "\x1b[105m";
  window.ANSIbgcyan_bright = "\x1b[106m";
  window.ANSIbgwhite_bright = "\x1b[107m";

  window.ANSIbold = "\x1b[1m";
  window.ANSIdim = "\x1b[2m";
  window.ANSIitalic = "\x1b[3m";
  window.ANSIunderline = "\x1b[4m";
  window.ANSIinverse = "\x1b[7m";
  window.ANSIhidden = "\x1b[8m";
  window.ANSIstrikethrough = "\x1b[9m";
  window.ANSIresetAll = "\x1b[0m";

  window.mode = window.mode || "txt";
  window.CURFG = window.CURFG || 37;
  window.CURBG = window.CURBG || 40;
  window.CURATTR = window.CURATTR || 0;
  window.CURX = window.CURX || 0;
  window.CURY = window.CURY || 0;

  var cellGrid = [];
  var EMPTY_CELL = '\u00A0';
  
  function getW() { return window.W || 32; }
  function getH() { return window.H || 25; }
  
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
  
  function validateCoords(x, y) { 
    return (typeof x === 'number' && typeof y === 'number' && x >= 0 && y >= 0 && x < getW() && y < getH()); 
  }
  
  function clampRow(r) { 
    if (typeof r !== 'number' || isNaN(r)) return 0; 
    if (r < 0) return 0; 
    if (r >= getH()) return getH() - 1; 
    return r; 
  }
  
  function initGrid() {
    var cols = getW(); 
    var rows = getH();
    var container = document.getElementById('txt');
    if (!container) return false;
    container.innerHTML = ''; 
    cellGrid = [];

    var frag = document.createDocumentFragment();
    var defaultFg = (typeof window.CURFG === 'number') ? window.CURFG : 37;
    var defaultBg = (typeof window.CURBG === 'number') ? window.CURBG : 40;
    var defaultCls = buildCellClass(defaultFg, defaultBg, 0);

    for (var y = 0; y < rows; y++) {
      var rowDiv = document.createElement('div');
      rowDiv.className = 'qandy-row';
      cellGrid[y] = new Array(cols);

      for (var x = 0; x < cols; x++) {
        var span = document.createElement('span');
        span.className = defaultCls;
        span._lastClass = defaultCls;
        span.textContent = EMPTY_CELL;
        rowDiv.appendChild(span);
        cellGrid[y][x] = span;
      }
      frag.appendChild(rowDiv);
    }
    container.appendChild(frag);
    return true;
  }
  
  initGrid();
  
  window.pokeCell=function(x, y, ch, fg, bg, attr) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (x < 0 || x >= getW() || y < 0 || y >= getH()) return false;
    if (typeof ch === 'undefined' || ch === null) ch = ' ';
    ch = String(ch).charAt(0) || ' ';
    var fgCode  = (typeof fg   === 'number') ? (fg   | 0) : (window.CURFG   || 37);
    var bgCode  = (typeof bg   === 'number') ? (bg   | 0) : (window.CURBG   || 40);
    var attrVal = (typeof attr === 'number') ? (attr | 0) : (window.CURATTR || 0);
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return false;
    var newText = (ch === ' ') ? EMPTY_CELL : ch;
    if (span.textContent !== newText) span.textContent = newText;
    var cls = buildCellClass(fgCode, bgCode, attrVal);
    if (span._lastClass !== cls) {
      span.className = cls;
      span._lastClass = cls;
    }
    return true;
  }
  
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
        if (c === '\n') { cx = 0; cy++; if (cy >= getH()) return false; continue; }
        if (cx >= getW()) { cx = 0; cy++; if (cy >= getH()) return false; }
        window.pokeCell(cx, cy, c, window.CURFG, window.CURBG, window.CURATTR);
        cx++;
      }
    }
    return true;
  };
  
  window.pokeColor = function(x, y, f, b, n) {
    if (!validateCoords(x, y)) return false;
    if (typeof f === 'undefined') f = window.CURFG;
    if (typeof b === 'undefined') b = window.CURBG;
    var count = (typeof n === 'number' && n > 0) ? Math.floor(n) : 1;
    var offset = 0;
    while (count > 0) {
      var abs = x + offset;
      var row = y + Math.floor(abs / getW());
      var col = abs % getW();
      if (row >= getH()) break;
      var span = cellGrid[row] && cellGrid[row][col];
      if (span) {
        var ch = span.textContent === EMPTY_CELL ? ' ' : span.textContent;
        var currentAttr = extractAttrFromDOM(span);
        window.pokeCell(col, row, ch, f, b, currentAttr);
      }
      offset++; count--;
    }
    return true;
  };
  
  window.pokeChar = function(x, y, a, n) {
    if (typeof a === 'undefined') return false;
    if (!validateCoords(x, y)) return false;
    var ch = (typeof a === 'string') ? a : String(a)[0] || ' ';
    n = (typeof n === 'number' && !isNaN(n) && n > 0) ? (n|0) : 1;
    var remaining = n;
    var cx = x | 0; var cy = y | 0;
    var written = 0;
    while (remaining > 0 && cy < getH()) {
      var space = getW() - cx;
      if (space <= 0) { cx = 0; cy++; continue; }
      var take = Math.min(remaining, space);
      for (var i = 0; i < take; i++) { window.pokeCell(cx + i, cy, ch, window.CURFG, window.CURBG, window.CURATTR); }
      written += take; remaining -= take; cx = 0; cy++;
    }
    return (n === 1) ? true : written;
  };

  window.pokeAttr = function(x, y, attrValue, n) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (typeof attrValue !== 'number') return false;
    n = (typeof n === 'number' && n > 0) ? Math.floor(n) : 1;
    var remaining = n;
    var cx = x | 0; var cy = y | 0;
    var written = 0;
    while (remaining > 0 && cy < getH()) {
      var space = getW() - cx;
      var take = Math.min(remaining, space);
      for (var i = 0; i < take; i++) {
        var span = cellGrid[cy] && cellGrid[cy][cx + i];
        if (span) {
          var ch = span.textContent === EMPTY_CELL ? ' ' : span.textContent;
          var match_fg = span.className.match(/ansi-fg-(\d+)/);
          var match_bg = span.className.match(/ansi-bg-(\d+)/);
          var fg = match_fg ? parseInt(match_fg[1], 10) : window.CURFG;
          var bg = match_bg ? parseInt(match_bg[1], 10) : window.CURBG;
          window.pokeCell(cx + i, cy, ch, fg, bg, attrValue);
        }
      }
      written += take; remaining -= take; cx = 0; cy++;
    }
    return (n === 1) ? true : written;
  };

  window.pokeAttrBit = function(x, y, bit, state) {
    if (!validateCoords(x, y)) return false;
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return false;
    var currentAttr = extractAttrFromDOM(span);
    var newAttr = state ? (currentAttr | bit) : (currentAttr & ~bit);
    var ch = span.textContent === EMPTY_CELL ? ' ' : span.textContent;
    var match_fg = span.className.match(/ansi-fg-(\d+)/);
    var match_bg = span.className.match(/ansi-bg-(\d+)/);
    var fg = match_fg ? parseInt(match_fg[1], 10) : window.CURFG;
    var bg = match_bg ? parseInt(match_bg[1], 10) : window.CURBG;
    window.pokeCell(x, y, ch, fg, bg, newAttr);
    return true;
  };

  window.pokeInverse = function(x, y, state, n) {
    if (typeof n === 'number' && n > 1) {
      for (var xi = x; xi < x + n; xi++) { if (xi >= getW()) break; window.pokeAttrBit(xi, y, window.ATTR_INVERSE || 0x0001, !!state); }
      return n;
    }
    return window.pokeAttrBit(x, y, window.ATTR_INVERSE || 0x0001, !!state);
  };
  
  window.pokeScroll = function() {
    var container = document.getElementById('txt');
    if (!container || !container.firstChild) return false;
    container.removeChild(container.firstChild);
    cellGrid.shift();
    var newRowDiv = document.createElement('div');
    newRowDiv.className = 'qandy-row';
    var newRowCells = new Array(getW());
    var defaultCls = buildCellClass(window.CURFG, window.CURBG, 0);
    for (var x = 0; x < getW(); x++) {
      var span = document.createElement('span');
      span.className = defaultCls; span._lastClass = defaultCls; span.textContent = EMPTY_CELL;
      newRowDiv.appendChild(span); newRowCells[x] = span;
    }
    container.appendChild(newRowDiv);
    cellGrid.push(newRowCells);
    window.CURY = clampRow(window.CURY - 1);
    window.LINEY = clampRow(window.LINEY - 1);
    return true;
  };
  
  window.pokeCursorOn = function() {
    if (window.CURSOR === 0) return;
    var sx = Math.max(0, Math.min(getW()-1, window.CURX|0));
    var sy = Math.max(0, Math.min(getH()-1, window.CURY|0));
    if (window.CURSOR === 1 || window.CURSOR === 3) {
      window.pokeAttrBit(sx, sy, window.ATTR_UNDERLINE || 0x0010, true);
      if (window.CURSOR === 3) window.pokeAttrBit(sx, sy, window.ATTR_BLINK || 0x0020, true);
    }
    if (window.CURSOR === 4 || window.CURSOR === 5) {
      window.pokeAttrBit(sx, sy, window.ATTR_INVERSE || 0x0001, true);
      if (window.CURSOR === 5) window.pokeAttrBit(sx, sy, window.ATTR_BLINK || 0x0020, true);
    }
  };
  
  window.pokeCursorOff = function() {
    var sx = Math.max(0, Math.min(getW()-1, window.CURX|0));
    var sy = Math.max(0, Math.min(getH()-1, window.CURY|0));
    window.pokeAttrBit(sx, sy, window.ATTR_UNDERLINE || 0x0010, false);
    window.pokeAttrBit(sx, sy, window.ATTR_INVERSE || 0x0001, false);
    window.pokeAttrBit(sx, sy, window.ATTR_BLINK || 0x0020, false);
    return true;
  };
  
  window.pokeCursor = async function(t) {
    if (typeof t === 'undefined' || t === null) return false;
    var str = String(t);
    function parseParams(s) { return s ? s.split(';').map(function(v){ return parseInt(v, 10) || 0; }) : []; }
    function handleCSI(paramsStr, cmd) {
      var params = parseParams(paramsStr);
      switch (cmd) {
        case 'm':
          if (!params.length) params = [0];
          for (var i = 0; i < params.length; i++) {
            var p = params[i];
            if (p === 0) { window.CURFG = 37; window.CURBG = 40; window.CURATTR = 0; }
            else if (p === 1) window.CURATTR |= window.ATTR_BOLD;
            else if (p === 7) window.CURATTR |= window.ATTR_INVERSE;
            else if (p >= 30 && p <= 37) window.CURFG = p;
            else if (p >= 40 && p <= 47) window.CURBG = p;
          }
          break;
        case 'H': case 'f':
          window.CURY = Math.max(0, Math.min(getH() - 1, (params[0] || 1) - 1));
          window.CURX = Math.max(0, Math.min(getW() - 1, (params[1] || 1) - 1));
          break;
        case 'J': if (params[0] === 2) { window.pokeCursorOff(); initGrid(); window.pokeCursorOn(); } break;
      }
    }
    window.pokeCursorOff();
    var idx = 0;
    while (idx < str.length) {
      var ch = str.charAt(idx);
      if (ch === '\x1b') {
        var m = /^\x1b\[([0-9;]*)?([@A-Za-z])/.exec(str.slice(idx));
        if (m) { handleCSI(m[1] || '', m[2]); idx += m[0].length; continue; }
      }
      if (ch === '\n') {
        window.CURX = 0; window.CURY++; if (window.CURY >= getH()) { window.pokeScroll(); window.CURY = getH() - 1; }
        idx++; continue;
      }
      window.pokeCell(window.CURX, window.CURY, ch, window.CURFG, window.CURBG, window.CURATTR);
      window.CURX++; if (window.CURX >= getW()) { window.CURX = 0; window.CURY++; if (window.CURY >= getH()) { window.pokeScroll(); window.CURY = getH() - 1; } }
      idx++;
    }
    window.pokeCursorOn(); return true;
  };
  
  window.peekChar = function(x, y) { if (!validateCoords(x, y)) return undefined; var span = cellGrid[y][x]; return (span.textContent === EMPTY_CELL) ? ' ' : span.textContent; };
  
  function extractAttrFromDOM(span) {
    var attr = 0; if (!span) return 0;
    if (span.className.includes('ansi-inverse')) attr |= 0x0001;
    if (span.className.includes('ansi-bold')) attr |= 0x0002;
    if (span.className.includes('ansi-underline')) attr |= 0x0010;
    if (span.className.includes('ansi-blink')) attr |= 0x0020;
    return attr;
  }

  if (typeof window.qandySignalReady === 'function') window.qandySignalReady('video.js');
}
