//
// ──── Qandy Video Graphics Adaptor (DOM-based) ──────────────────────────────────────
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
  
  function validateCoords(x, y) { 
    return (typeof x === 'number' && typeof y === 'number' && x >= 0 && y >= 0 && x < getW() && y < getH()); 
  }
  
  function clampRow(r) { 
    if (typeof r !== 'number' || isNaN(r)) return 0; 
    if (r < 0) return 0; 
    if (r >= getH()) return getH() - 1; 
    return r; 
  }
  
  // ──── Initalization ────────────────────────────────────────────────
  
  function initGrid() {
    var cols = getW(); 
    var rows = getH();
    var container = document.getElementById('txt');
    if (!container) return false;
    container.innerHTML = ''; 
    cellGrid = [];

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
  
  // ──── the pokes ────────────────────────────────────────────────────
  
  window.pokeCell=function(x, y, ch, fg, bg, attr) {
    var cols = getW();
    var rows = getH();

    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (x < 0 || x >= cols || y < 0 || y >= rows) return false;

    // Normalize character
    if (typeof ch === 'undefined' || ch === null) ch = ' ';
    ch = String(ch).charAt(0) || ' ';

    // Resolve color / attribute values, falling back to current cursor state
    var fgCode  = (typeof fg   === 'number') ? (fg   | 0) : ((typeof CURFG   === 'number') ? CURFG   : 37);
    var bgCode  = (typeof bg   === 'number') ? (bg   | 0) : ((typeof CURBG   === 'number') ? CURBG   : 40);
    var attrVal = (typeof attr === 'number') ? (attr | 0) : ((typeof CURATTR === 'number') ? CURATTR : 0);

    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return false;

    // Update text
    var newText = (ch === ' ') ? EMPTY_CELL : ch;
    if (span.textContent !== newText) span.textContent = newText;

    // Update class only when it has changed
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
    var cols = getW();
    var rows = getH();
    
    for (var repeat = 0; repeat < n; repeat++) {
      for (var i = 0; i < str.length; i++) {
        var c = str[i];
        if (c === '\n') {
          cx = 0; 
          cy++;
          if (cy >= rows) return false;
          continue;
        }
        if (cx >= cols) {
          cx = 0; 
          cy++;
          if (cy >= rows) return false;
        }
        pokeCell(cx, cy, c, CURFG, CURBG, CURATTR);
        cx++;
      }
    }
    return true;
  };
  
  window.pokeColor = function(x, y, f, b, n) {
    if (!validateCoords(x, y)) return false;
    if (typeof f === 'undefined') { f = CURFG; }
    if (typeof b === 'undefined') { b = CURBG; }
    
    var count = (typeof n === 'number' && n > 0) ? Math.floor(n) : 1;
    var cols = getW();
    var rows = getH();
    var offset = 0;
    
    while (count > 0) {
      var abs = x + offset;
      var row = y + Math.floor(abs / cols);
      var col = abs % cols;
      if (row >= rows) break;
      
      var span = cellGrid[row] && cellGrid[row][col];
      if (span) {
        var ch = span.textContent === EMPTY_CELL ? ' ' : span.textContent;
        var currentAttr = extractAttrFromDOM(span);
        pokeCell(col, row, ch, f, b, currentAttr);
      }
      offset++;
      count--;
    }
    return true;
  };
  
  window.pokeChar = function(x, y, a, n) {
    if (typeof a === 'undefined') return false;
    if (!validateCoords(x, y)) return false;
    
    var ch = (typeof a === 'string') ? a : String(a)[0] || ' ';
    n = (typeof n === 'number' && !isNaN(n) && n > 0) ? (n|0) : 1;
    
    var cols = getW();
    var rows = getH();
    var remaining = n;
    var cx = x | 0;
    var cy = y | 0;
    var written = 0;
    
    while (remaining > 0 && cy < rows) {
      var space = cols - cx;
      if (space <= 0) { cx = 0; cy++; continue; }
      var take = Math.min(remaining, space);
      for (var i = 0; i < take; i++) { 
        pokeCell(cx + i, cy, ch, CURFG, CURBG, CURATTR);
      }
      written += take;
      remaining -= take;
      cx = 0;
      cy++;
    }
    return (n === 1) ? true : written;
  };
  
  window.pokeFG = function(x, y, fg, count) {
    // Getter: if fg is undefined, return current fg value
    if (typeof fg === 'undefined') {
      if (!validateCoords(x, y)) return undefined;
      var span = cellGrid[y] && cellGrid[y][x];
      if (!span) return undefined;
      // Extract fg code from class name
      var match = span.className.match(/ansi-fg-(\d+)/);
      return match ? parseInt(match[1], 10) : 37;
    }

    // Setter: validate coords
    if (!validateCoords(x, y)) return false;
    count = (typeof count === 'number' && count > 0) ? Math.floor(count) : 1;
    
    var cols = getW();
    var rows = getH();
    var maxRemaining = Math.max(0, cols * rows - (y * cols + x));
    if (count > maxRemaining) count = maxRemaining;
    if (count <= 0) return false;

    var fgCode = (typeof fg === 'number') ? (fg | 0) : 37;
    var offset = 0;
    
    while (count > 0) {
      var abs = x + offset;
      var row = y + Math.floor(abs / cols);
      var col = abs % cols;
      if (row >= rows) break;
      
      var span = cellGrid[row] && cellGrid[row][col];
      if (span) {
        var ch = span.textContent === EMPTY_CELL ? ' ' : span.textContent;
        var bgMatch = span.className.match(/ansi-bg-(\d+)/);
        var currentBg = bgMatch ? parseInt(bgMatch[1], 10) : CURBG;
        var currentAttr = extractAttrFromDOM(span);
        pokeCell(col, row, ch, fgCode, currentBg, currentAttr);
      }
      offset++;
      count--;
    }
    return count;
  };
  
  window.pokeBG = function(x, y, bg, count) {
    // Getter: if bg is undefined, return current bg value
    if (typeof bg === 'undefined') {
      if (!validateCoords(x, y)) return undefined;
      var span = cellGrid[y] && cellGrid[y][x];
      if (!span) return undefined;
      // Extract bg code from class name
      var match = span.className.match(/ansi-bg-(\d+)/);
      return match ? parseInt(match[1], 10) : 40;
    }

    // Setter: validate coords
    if (!validateCoords(x, y)) return false;
    count = (typeof count === 'number' && count > 0) ? Math.floor(count) : 1;
    
    var cols = getW();
    var rows = getH();
    var maxRemaining = Math.max(0, cols * rows - (y * cols + x));
    if (count > maxRemaining) count = maxRemaining;
    if (count <= 0) return false;

    var bgCode = (typeof bg === 'number') ? (bg | 0) : 40;
    var offset = 0;
    
    while (count > 0) {
      var abs = x + offset;
      var row = y + Math.floor(abs / cols);
      var col = abs % cols;
      if (row >= rows) break;
      
      var span = cellGrid[row] && cellGrid[row][col];
      if (span) {
        var ch = span.textContent === EMPTY_CELL ? ' ' : span.textContent;
        var currentFg = 37; // fallback
        var match = span.className.match(/ansi-fg-(\d+)/);
        if (match) currentFg = parseInt(match[1], 10);
        var currentAttr = extractAttrFromDOM(span);
        pokeCell(col, row, ch, currentFg, bgCode, currentAttr);
      }
      offset++;
      count--;
    }
    return count;
  };
  
  window.pokeAttr = function(x, y, attrValue, n) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (typeof attrValue !== 'number') return false;
    
    n = (typeof n === 'number' && n > 0) ? Math.floor(n) : 1;
    attrValue = attrValue | 0;
    
    var cols = getW();
    var rows = getH();
    var remaining = n;
    var cx = x | 0;
    var cy = y | 0;
    var written = 0;
    
    while (remaining > 0 && cy < rows) {
      var space = cols - cx;
      var take = Math.min(remaining, space);
      
      for (var i = 0; i < take; i++) {
        var span = cellGrid[cy] && cellGrid[cy][cx + i];
        if (span) {
          // Rebuild class with new attr; no ATTR array to update
          var ch = span.textContent === EMPTY_CELL ? ' ' : span.textContent;
          var match_fg = span.className.match(/ansi-fg-(\d+)/);
          var match_bg = span.className.match(/ansi-bg-(\d+)/);
          var fg = match_fg ? parseInt(match_fg[1], 10) : CURFG;
          var bg = match_bg ? parseInt(match_bg[1], 10) : CURBG;
          pokeCell(cx + i, cy, ch, fg, bg, attrValue);
        }
      }
      
      written += take;
      remaining -= take;
      cx = 0;
      cy++;
    }
    
    return (n === 1) ? true : written;
  };

  window.pokeAttrBit = function(x, y, bit, state) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (!validateCoords(x, y)) return false;
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return false;
    // Extract current attributes from DOM
    var currentAttr = extractAttrFromDOM(span);
    var newAttr = state ? (currentAttr | bit) : (currentAttr & ~bit);
    // Get current cell content and colors
    var ch = span.textContent === EMPTY_CELL ? ' ' : span.textContent;
    var match_fg = span.className.match(/ansi-fg-(\d+)/);
    var match_bg = span.className.match(/ansi-bg-(\d+)/);
    var fg = match_fg ? parseInt(match_fg[1], 10) : CURFG;
    var bg = match_bg ? parseInt(match_bg[1], 10) : CURBG;
    pokeCell(x, y, ch, fg, bg, newAttr);
    return true;
  };

  window.pokeInverse = function(x, y, state, n) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (typeof n === 'number' && n > 1) {
      var endX = x + n;
      var cols = getW();
      for (var xi = x; xi < endX; xi++) {
        if (xi >= cols) break;
        pokeAttrBit(xi, y, window.ATTR_INVERSE || 0x0001, !!state);
      }
      return n;
    }
    pokeAttrBit(x, y, window.ATTR_INVERSE || 0x0001, !!state);
    return true;
  };
  
  window.pokeBold = function(x, y, state, n) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (typeof n === 'number' && n > 1) {
      var endX = x + n;
      var cols = getW();
      for (var xi = x; xi < endX; xi++) {
        if (xi >= cols) break;
        pokeAttrBit(xi, y, window.ATTR_BOLD || 0x0002, !!state);
      }
      return n;
    }
    pokeAttrBit(x, y, window.ATTR_BOLD || 0x0002, !!state);
    return true;
  };
  
  window.pokeItalic = function(x, y, state, n) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (typeof n === 'number' && n > 1) {
      var endX = x + n;
      var cols = getW();
      for (var xi = x; xi < endX; xi++) {
        if (xi >= cols) break;
        pokeAttrBit(xi, y, window.ATTR_ITALIC || 0x0008, !!state);
      }
      return n;
    }
    pokeAttrBit(x, y, window.ATTR_ITALIC || 0x0008, !!state);
    return true;
  };
  
  window.pokeLine = function(x, y, state, n) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (typeof n === 'number' && n > 1) {
      var endX = x + n;
      var cols = getW();
      for (var xi = x; xi < endX; xi++) {
        if (xi >= cols) break;
        pokeAttrBit(xi, y, window.ATTR_UNDERLINE || 0x0010, !!state);
      }
      return n;
    }
    pokeAttrBit(x, y, window.ATTR_UNDERLINE || 0x0010, !!state);
    return true;
  };
  
  window.pokeBlink = function(x, y, state, n) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    if (typeof n === 'number' && n > 1) {
      var endX = x + n;
      var cols = getW();
      for (var xi = x; xi < endX; xi++) {
        if (xi >= cols) break;
        pokeAttrBit(xi, y, window.ATTR_BLINK || 0x0020, !!state);
      }
      return n;
    }
    pokeAttrBit(x, y, window.ATTR_BLINK || 0x0020, !!state);
    return true;
  };
  
  window.pokeSelect = function(state) {
    if (typeof SSTART !== 'number' || typeof SEND !== 'number') return false;
    if (SSTART < 0 || SEND < 0) return false;
    var s = Math.min(SSTART, SEND);
    var e = Math.max(SSTART, SEND);
    var count = e - s;
    if (count <= 0) return false;
    var cols = getW();
    var absCol = (typeof LINEX === 'number' ? LINEX : 0) + s;
    var startY = (typeof LINEY === 'number' ? LINEY : 0) + Math.floor(absCol / cols);
    var startX = absCol % cols;
    return pokeInverse(startX, startY, !!state, count);
  };
  
  window.pokeScroll = function() {
    var cols = getW(); var rows = getH();
    // Shift DOM rows up
    var container = document.getElementById('txt');
    if (!container || !container.firstChild) return false;
    var firstRow = container.firstChild;
    if (firstRow) firstRow.parentNode.removeChild(firstRow);
    // Shift cellGrid up
    cellGrid.shift();
    // Create new blank row at bottom
    var newRowDiv = document.createElement('div');
    newRowDiv.className = 'qandy-row';
    var newRowCells = new Array(cols);
    var defaultFg = (typeof CURFG === 'number') ? CURFG : 37;
    var defaultBg = (typeof CURBG === 'number') ? CURBG : 40;
    var defaultCls = buildCellClass(defaultFg, defaultBg, 0);
    for (var x = 0; x < cols; x++) {
      var span = document.createElement('span');
      span.className = defaultCls;
      span._lastClass = defaultCls;
      span.textContent = EMPTY_CELL;
      newRowDiv.appendChild(span);
      newRowCells[x] = span;
    }
    container.appendChild(newRowDiv);
    cellGrid.push(newRowCells);
    // Update cursor position
    CURY = clampRow((typeof CURY === 'number' ? CURY : 0) - 1);
    LINEY = clampRow((typeof LINEY === 'number' ? LINEY : 0) - 1);
    CURX = Math.max(0, Math.min(cols - 1, (typeof CURX === 'number' ? CURX : 0)));
    LINEX = Math.max(0, Math.min(cols - 1, (typeof LINEX === 'number' ? LINEX : 0)));
    return true;
  };
  
  window.pokeCursorOn = function() {
    if (typeof CURSOR === 'undefined' || typeof CURX === 'undefined' || typeof CURY === 'undefined') return;
    if (CURSOR === 0) return; // cursor off
    var sx = Math.max(0, Math.min(getW()-1, CURX|0));
    var sy = Math.max(0, Math.min(getH()-1, CURY|0));
    
    if (CURSOR === 1 || CURSOR === 3) { // line cursor: underline
      pokeAttrBit(sx, sy, window.ATTR_UNDERLINE || 0x0010, true);
      if (CURSOR === 3) pokeAttrBit(sx, sy, window.ATTR_BLINK || 0x0020, true);
    }
    if (CURSOR === 4 || CURSOR === 5) { // block cursor: inverse
      pokeAttrBit(sx, sy, window.ATTR_INVERSE || 0x0001, true);
      if (CURSOR === 5) pokeAttrBit(sx, sy, window.ATTR_BLINK || 0x0020, true);
    }
  };
  
  var prevCursorAttr = 0; //how does it know this??
  
  window.pokeCursorOff = function() {
    if (typeof CURX === 'undefined' || typeof CURY === 'undefined') return false;
    var sx = Math.max(0, Math.min(getW()-1, CURX|0));
    var sy = Math.max(0, Math.min(getH()-1, CURY|0));
    
    // Clear cursor attributes while preserving others
    pokeAttrBit(sx, sy, window.ATTR_UNDERLINE || 0x0010, false);
    pokeAttrBit(sx, sy, window.ATTR_INVERSE || 0x0001, false);
    pokeAttrBit(sx, sy, window.ATTR_BLINK || 0x0020, false);
    
    return true;
  };
  
  // ──── the menu bar ─────────────────────────────────────────────────  

  window.pokeMenu = function(t) {
    var cols = getW();
    var rows = getH();
    if (t) {
      for (var x=0; x<cols; x++) { 
        var ch = x<t.length ? t[x] : ' '; 
        pokeCell(x, H-1, ch, MENUFG || 37, MENUBG || 44, 0); 
      }
      return;
    } 
    for (var x=0; x<cols; x++) { 
      pokeCell(x, H-1, ' ', CURFG, CURBG, 0); 
    }
    return;
  };
  
  window.pokeCursor = async function(t) {
    if (typeof t === 'undefined' || t === null) return false;
    var str = String(t);

    function parseParams(s) {
      if (!s || !s.length) return [];
      var out = [], parts = s.split(';');
      for (var i = 0; i < parts.length; i++) { var v = parseInt(parts[i], 10); out.push(isNaN(v) ? 0 : v); }
      return out;
    }

    function handleCSI(paramsStr, cmd) {
      var params = parseParams(paramsStr);
      switch (cmd) {
        case 'm': // SGR - set graphics rendition
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
        case 'H': case 'f': // Cursor position (1-based)
          CURY = Math.max(0, Math.min(getH() - 1, (params.length >= 1 && params[0] > 0) ? params[0] - 1 : 0));
          CURX = Math.max(0, Math.min(getW() - 1, (params.length >= 2 && params[1] > 0) ? params[1] - 1 : 0));
          break;
        case 'A': CURY = Math.max(0, CURY - ((params.length >= 1 && params[0] > 0) ? params[0] : 1)); break;
        case 'B': CURY = Math.min(getH() - 1, CURY + ((params.length >= 1 && params[0] > 0) ? params[0] : 1)); break;
        case 'C': CURX = Math.min(getW() - 1, CURX + ((params.length >= 1 && params[0] > 0) ? params[0] : 1)); break;
        case 'D': CURX = Math.max(0, CURX - ((params.length >= 1 && params[0] > 0) ? params[0] : 1)); break;
        case 'J': if (params.length >= 1 && params[0] === 2) { pokeCursorOff(); initGrid(); pokeCursorOn(); } break;
      }
    }

    pokeCursorOff();
    var idx = 0;
    var cols = getW();
    var rows = getH();
    
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
        CURX = 0; 
        CURY++;
        if (CURY >= rows) { pokeScroll(); CURY = rows - 1; }
        LINEX = CURX; 
        LINEY = CURY;
        if (typeof CURMORE === 'number' && CURMORE >= 0) {
          CURMORE++;
          if (CURMORE >= rows - 1) {
            pokeMenu("  Press any key for more: ");
            let morePrompt = await inkey();
            pokeMenu();
            CURMORE = 0;
          }
        }
        idx++; 
        continue;
      }
      pokeCell(CURX, CURY, ch, CURFG, CURBG, CURATTR);
      CURX++;
      if (CURX >= cols) {
        CURX = 0; 
        CURY++;
        if (CURY >= rows) { pokeScroll(); CURY = rows - 1; }
        LINEX = CURX; 
        LINEY = CURY;
        if (typeof CURMORE === 'number' && CURMORE >= 0) {
          CURMORE++;
          if (CURMORE >= rows - 1) {
            pokeMenu("  Press ENTER to continue: ");
            let morePrompt = await input(false);
            pokeMenu();
            CURMORE = 0;
          }
        }
      }
      LINEX = CURX; 
      LINEY = CURY;
      idx++;
    }
    pokeCursorOn();
    return true;
  };
  
  window.pokeModem = function(t) {
    // paced/asynchronous rendering with baud rate simulation
    if (typeof t === 'undefined' || t === null) return false;
    if (window._pokeCursor_state && window._pokeCursor_state.timer) {
      clearTimeout(window._pokeCursor_state.timer);
    } 
    window._pokeCursor_state = null;
    var str = String(t);

    function parseParams(paramStr) {
      if (!paramStr || paramStr.length === 0) return [];
      return paramStr.split(';').map(function(p){ var v = parseInt(p,10); return isNaN(v) ? 0 : v; });
    }

    function handleCSI(paramsStr, cmd) {
      var params = parseParams(paramsStr);
      switch (cmd) {
        case 'm': // SGR
          if (!params.length) params = [0];
          for (var pi = 0; pi < params.length; pi++) {
            var p = params[pi] | 0;
            switch (p) {
              case 0: CURFG = 37; CURBG = 40; CURATTR = 0; break;
              case 1: CURATTR = (CURATTR | (window.ATTR_BOLD || 0x0002)); break;
              case 2: CURATTR = (CURATTR | (window.ATTR_DIM || 0x0004)); break;
              case 3: CURATTR = (CURATTR | (window.ATTR_ITALIC || 0x0008)); break;
              case 4: CURATTR = (CURATTR | (window.ATTR_UNDERLINE || 0x0010)); break;
              case 22: CURATTR &= ~(window.ATTR_BOLD || 0x0002); CURATTR &= ~(window.ATTR_DIM  || 0x0004); break;
              case 23: CURATTR &= ~(window.ATTR_ITALIC || 0x0008); break;
              case 24: CURATTR &= ~(window.ATTR_UNDERLINE || 0x0010); break;
              case 7: CURATTR = (CURATTR | (window.ATTR_INVERSE || 0x0001)); break;
              case 27: CURATTR &= ~(window.ATTR_INVERSE || 0x0001); break;
              default:
                if (p >= 30 && p <= 37) { CURFG = p; break; }
                if (p >= 90 && p <= 97) { CURFG = p; break; }
                if (p >= 40 && p <= 47) { CURBG = p; break; }
                if (p >= 100 && p <= 107) { CURBG = p; break; }
                break;
            }
          }
          break;
        case 'H': case 'f':
          var row = (params.length >= 1 && params[0] > 0) ? (params[0] - 1) : 0;
          var col = (params.length >= 2 && params[1] > 0) ? (params[1] - 1) : 0;
          if (typeof row === 'number') CURY = Math.max(0, Math.min(getH() - 1, row));
          if (typeof col === 'number') CURX = Math.max(0, Math.min(getW() - 1, col));
          break;
        case 'A': var nA = (params.length >= 1 && params[0] > 0) ? params[0] : 1; CURY = Math.max(0, CURY - nA); break;
        case 'B': var nB = (params.length >= 1 && params[0] > 0) ? params[0] : 1; CURY = Math.min(getH() - 1, CURY + nB); break;
        case 'C': var nC = (params.length >= 1 && params[0] > 0) ? params[0] : 1; CURX = Math.min(getW() - 1, CURX + nC); break;
        case 'D': var nD = (params.length >= 1 && params[0] > 0) ? params[0] : 1; CURX = Math.max(0, CURX - nD); break;
        case 'J': if (params.length === 0 || params[0] === 2) { pokeCursorOff(); initGrid(); pokeCursorOn(); } break;
      }
    }

    var charsPerMs = (typeof CURBAUD === 'number' && CURBAUD > 0) ? CURBAUD / 10000 : 0;
    var state = {
      str: str, idx: 0, timer: null, stopped: false,
      startTime: performance.now(), charsEmitted: 0
    };
    window._pokeCursor_state = state;

    function scheduleNext() {
      if (!state || state.stopped) return;
      var delay = 0;
      if (charsPerMs) {
        var nextMs = state.startTime + (state.charsEmitted + 1) / charsPerMs;
        delay = Math.max(0, nextMs - performance.now());
      }
      state.timer = setTimeout(processStep, delay);
    }

    function processStep() {
      if (!state || state.stopped) return;
      var charsAllowed = charsPerMs
        ? Math.floor((performance.now() - state.startTime) * charsPerMs)
        : state.str.length + 1;

      pokeCursorOff();
      var cols = getW();
      var rows = getH();

      while (state.idx < state.str.length && state.charsEmitted < charsAllowed) {
        var ch = state.str.charAt(state.idx);
        if (CURANSI && ch === '\x1b') {
          var rest = state.str.slice(state.idx);
          var m = /^\x1b\[([0-9;]*)?([@A-Za-z])/.exec(rest);
          if (m) { handleCSI(m[1] || '', m[2]); state.idx += m[0].length; } 
          else { state.idx++; }
          state.charsEmitted++;
          continue;
        }
        if (ch === '\n') {
          CURX = 0; CURY = CURY + 1;
          if (CURY >= rows) { pokeScroll(); CURY = rows - 1; }
          LINEX = CURX; LINEY = CURY;
          state.idx++; state.charsEmitted++;
          continue;
        }
        pokeCell(CURX, CURY, ch, CURFG, CURBG, CURATTR);
        if (SOUND && typeof beep === 'function') { try { beep(900, 25, 0.01); } catch (e) {}}
        CURX = CURX + 1;
        if (CURX >= cols) { CURX = 0; CURY = CURY + 1; if (CURY >= rows) { pokeScroll(); CURY = rows - 1; } }
        LINEX = CURX; LINEY = CURY;
        state.idx++; state.charsEmitted++;
      }

      pokeCursorOn();
      if (state.idx >= state.str.length) { window._pokeCursor_state = null; return; }
      scheduleNext();
    }

    scheduleNext();
    return true;
  };
  
  window.pokeRefresh = function() { return true; }  

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
  
  // ──── the peeks ────────────────────────────────────────────────────
  
  window.peekChar = function(x, y) { 
    if (!validateCoords(x, y)) return undefined;
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return undefined;
    return (span.textContent === EMPTY_CELL) ? ' ' : span.textContent;
  };
  
  window.peekFG = function(x, y) { 
    if (!validateCoords(x, y)) return undefined;
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return undefined;
    var match = span.className.match(/ansi-fg-(\d+)/);
    return match ? parseInt(match[1], 10) : 37;
  };
  
  window.peekBG = function(x, y) { 
    if (!validateCoords(x, y)) return undefined;
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return undefined;
    var match = span.className.match(/ansi-bg-(\d+)/);
    return match ? parseInt(match[1], 10) : 40;
  };
  
  window.peekAttr = function(x, y) { 
    if (!validateCoords(x, y)) return undefined;
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return 0;
    return extractAttrFromDOM(span);
  };
  
  window.peekBold = function(x, y) { 
    if (!validateCoords(x, y)) return undefined;
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return false;
    return !!(extractAttrFromDOM(span) & (window.ATTR_BOLD || 0x0002));
  };
  
  window.peekItalic = function(x, y) { 
    if (!validateCoords(x, y)) return undefined;
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return false;
    return !!(extractAttrFromDOM(span) & (window.ATTR_ITALIC || 0x0008));
  };
  
  window.peekBlink = function(x, y) { 
    if (!validateCoords(x, y)) return undefined;
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return false;
    return !!(extractAttrFromDOM(span) & (window.ATTR_BLINK || 0x0020));
  };
  
  window.peekLine = function(x, y) { 
    if (!validateCoords(x, y)) return undefined;
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return false;
    return !!(extractAttrFromDOM(span) & (window.ATTR_UNDERLINE || 0x0010));
  };
  
  window.peekInverse = function(x, y) {
    if (!validateCoords(x, y)) return undefined;
    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return false;
    return !!(extractAttrFromDOM(span) & (window.ATTR_INVERSE || 0x0001));
  };
  
  // ──── video helpers ────────────────────────────────────────────────

  function extractAttrFromDOM(span) {
    var attr = 0;
    if (!span) return attr;
    if (span.className.includes('ansi-inverse'))   attr |= 0x0001;
    if (span.className.includes('ansi-bold'))      attr |= 0x0002;
    if (span.className.includes('ansi-dim'))       attr |= 0x0004;
    if (span.className.includes('ansi-italic'))    attr |= 0x0008;
    if (span.className.includes('ansi-underline')) attr |= 0x0010;
    if (span.className.includes('ansi-blink'))     attr |= 0x0020;
    return attr;
  }
  
  window.ANSI = {
    colors: {
      30: '#000000', 31: '#aa0000', 32: '#00aa00', 33: '#aa5500', 34: '#0000aa', 35: '#aa00aa', 36: '#00aaaa', 37: '#aaaaaa',
      90: '#555555', 91: '#ff5555', 92: '#55ff55', 93: '#ffff55', 94: '#5555ff', 95: '#ff55ff', 96: '#55ffff', 97: '#ffffff'
    },
    bgColors: {
      40: '#000000', 41: '#aa0000', 42: '#00aa00', 43: '#aa5500', 44: '#0000aa', 45: '#aa00aa', 46: '#00aaaa', 47: '#aaaaaa',
      100: '#555555', 101: '#ff5555', 102: '#55ff55', 103: '#ffff55', 104: '#5555ff', 105: '#ff55ff', 106: '#55ffff', 107: '#ffffff'
    },
    codes: {
      reset: '\x1b[0m', bold: '\x1b[1m', inverse: '\x1b[7m',
      black: '\x1b[30m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m', magenta: '\x1b[35m', cyan: '\x1b[36m', white: '\x1b[37m',
      bgBlack: '\x1b[40m', bgRed: '\x1b[41m', bgGreen: '\x1b[42m', bgYellow: '\x1b[43m', bgBlue: '\x1b[44m', bgMagenta: '\x1b[45m', bgCyan: '\x1b[46m', bgWhite: '\x1b[47m',
      cursorHome: '\x1b[H',
      cursorPos: (row, col) => `\x1b[${row};${col}H`,
      cursorUp: (n = 1) => `\x1b[${n}A`,
      cursorDown: (n = 1) => `\x1b[${n}B`,
      cursorForward: (n = 1) => `\x1b[${n}C`,
      cursorBack: (n = 1) => `\x1b[${n}D`,
      clearScreen: '\x1b[2J',
      clearLine: '\x1b[K'
    }
  };
  
  window.COLOR = {
    BLACK: 30, RED: 31, GREEN: 32, YELLOW: 33, BLUE: 34, MAGENTA: 35, CYAN: 36, WHITE: 37,
    BRIGHT_BLACK: 90, BRIGHT_RED: 91, BRIGHT_GREEN: 92, BRIGHT_YELLOW: 93, BRIGHT_BLUE: 94, BRIGHT_MAGENTA: 95, BRIGHT_CYAN: 96, BRIGHT_WHITE: 97,
    BG_BLACK: 40, BG_RED: 41, BG_GREEN: 42, BG_YELLOW: 43, BG_BLUE: 44, BG_MAGENTA: 45, BG_CYAN: 46, BG_WHITE: 47,
    BG_BRIGHT_BLACK: 100, BG_BRIGHT_RED: 101, BG_BRIGHT_GREEN: 102, BG_BRIGHT_YELLOW: 103, BG_BRIGHT_BLUE: 104, BG_BRIGHT_MAGENTA: 105, BG_BRIGHT_CYAN: 106, BG_BRIGHT_WHITE: 107
  };
  
  // Signal that video.js is ready
  if (typeof window.qandySignalReady === 'function') {
    window.qandySignalReady('video_js');
  }
}

window.video_js=video_js;
