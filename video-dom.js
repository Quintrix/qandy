

  // ── grid state ──────────────────────────────────────────────────────────────
  // cellGrid[row][col] → <span> element
  var cellGrid = [];

  // Sentinel used as the textContent of an empty cell.
  // Non-breaking space keeps the cell at its rendered width without wrapping.
  var EMPTY_CELL = '\u00A0';

  function getW() { return (typeof W === 'number') ? W : 32; }
  function getH() { return (typeof H === 'number') ? H : 25; }

  // ── CSS class builder ────────────────────────────────────────────────────────
  // Uses the same ansi-fg-{code} / ansi-bg-{code} class names as the existing
  // DOM renderer in qandy.htm so no extra CSS is required.
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

  // ── grid construction ────────────────────────────────────────────────────────
  function initGrid() {
    var cols = getW();
    var rows = getH();

    var container = document.getElementById('txt');
    if (!container) return false;

    // Clear and rebuild the container
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
        span.textContent = EMPTY_CELL; // non-breaking space represents an empty cell
        rowDiv.appendChild(span);
        cellGrid[y][x] = span;
      }

      frag.appendChild(rowDiv);
    }

    container.appendChild(frag);
    return true;
  }

  // ── peek ─────────────────────────────────────────────────────────────────────
  // Read character directly from the span — no VIDEO array required.
  function domPeek(x, y) {
    var cols = getW();
    var rows = getH();

    if (typeof x !== 'number' || typeof y !== 'number') return undefined;
    if (x < 0 || x >= cols || y < 0 || y >= rows) return undefined;

    var span = cellGrid[y] && cellGrid[y][x];
    if (!span) return undefined;

    var txt = span.textContent;
    // Treat EMPTY_CELL (our empty-cell sentinel) as a regular space
    return (txt === EMPTY_CELL || txt === '') ? ' ' : txt;
  }


  // ── cursor helpers ───────────────────────────────────────────────────────────
  function domCursorHome() {
    if (typeof CURX !== 'undefined') CURX = 0;
    if (typeof CURY !== 'undefined') CURY = 0;
    if (typeof LINEX !== 'undefined') LINEX = 0;
    if (typeof LINEY !== 'undefined') LINEY = 0;
  }

  function domCursorMoveTo(x, y) {
    var cols = getW();
    var rows = getH();
    var cx = Math.max(0, Math.min(cols - 1, x | 0));
    var cy = Math.max(0, Math.min(rows - 1, y | 0));
    if (typeof CURX !== 'undefined') CURX = cx;
    if (typeof CURY !== 'undefined') CURY = cy;
  }

initGrid()

// Helper: rebuild the grid (e.g. after a screen-resize)
window.__qandy_dom_rebuild = function () {
  try { return initGrid(); } catch (e) { console.warn('__qandy_dom_rebuild failed', e); return false; }
};
