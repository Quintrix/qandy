/* Canvas-backed renderer for Qandy
   - Non-invasive: keeps VIDEO/FCOLOR/BCOLOR/ATTR as source-of-truth.
   - Generates glyph atlas (ASCII 32..126) across 16 ANSI colors.
   - Provides enable/disable helpers and safe fallbacks.
*/

(function () {
  if (typeof document === 'undefined') return;
  if (window.__qandy_canvas_renderer_initialized) return;
  window.__qandy_canvas_renderer_initialized = true;

  // Configuration - tune to match your DOM cell size
  var CHAR_W = 8;
  var CHAR_H = 15;
  var FONT = "14px monospace";
  var FIRST_CHAR = 32;
  var LAST_CHAR = 126;
  var NUM_CHARS = LAST_CHAR - FIRST_CHAR + 1;
  var NUM_COLORS = 16;

  // ANSI color mapping (reuse existing _ansiCssMap if present)
  var baseAnsi = (typeof _ansiCssMap !== 'undefined') ? _ansiCssMap : {
    30: '#000', 31: '#c00', 32: '#0c0', 33: '#cc0', 34: '#00c', 35: '#c0c', 36: '#0cc', 37: '#ccc',
    90: '#555', 91: '#f55', 92: '#5f5', 93: '#ff5', 94: '#55f', 95: '#f5f', 96: '#5ff', 97: '#fff'
  };

  var ansiPalette = [];
  for (var i = 0; i < 8; i++) ansiPalette[i] = baseAnsi[30 + i] || '#000';
  for (var i = 0; i < 8; i++) ansiPalette[8 + i] = baseAnsi[90 + i] || ansiPalette[i];

  // Create canvas and insert near existing container
  var anchor = document.getElementById('txt') || document.body;
  var canvas = document.createElement('canvas');
  canvas.id = 'qandy-canvas';
  canvas.style.display = 'block';
  canvas.style.background = '#000';
  canvas.style.imageRendering = 'pixelated';
  canvas.tabIndex = -1;
  canvas.style.position = 'absolute';
  canvas.style.left = '0';
  canvas.style.top = '0';
  canvas.style.zIndex = 800; // above many UI elements but can be adjusted
  anchor.insertBefore(canvas, anchor.firstChild);

  var ctx = canvas.getContext('2d');
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';

  // Offscreen atlas canvas
  var atlas = document.createElement('canvas');
  var actx = atlas.getContext('2d');

  function buildAtlas() {
    atlas.width = NUM_CHARS * CHAR_W;
    atlas.height = H * CHAR_H;
    actx.imageSmoothingEnabled = false;
    actx.clearRect(0, 0, atlas.width, atlas.height);
    actx.font = FONT;
    actx.textBaseline = 'top';

    for (var colorIdx = 0; colorIdx < NUM_COLORS; colorIdx++) {
      var fg = ansiPalette[colorIdx] || '#fff';
      actx.fillStyle = fg;
      for (var ci = 0; ci < NUM_CHARS; ci++) {
        var ch = String.fromCharCode(FIRST_CHAR + ci);
        var sx = ci * CHAR_W;
        var sy = colorIdx * CHAR_H;
        actx.clearRect(sx, sy, CHAR_W, CHAR_H);
        actx.fillStyle = fg;
        actx.fillText(ch, sx, sy);
      }
    }
  }

  function resizeCanvas() {
    var w = (typeof W === 'number') ? W : 32;
    var h = (typeof H === 'number') ? H : 25;
    canvas.width = Math.max(1, w * CHAR_W);
    canvas.height = Math.max(1, h * CHAR_H);
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';
    ctx.imageSmoothingEnabled = false;
    ctx.font = FONT;
    ctx.textBaseline = 'top';

    // Position canvas on top of the host text area if possible
    //try {
    //  var target = document.getElementById('txt') || anchor;
    //  var rect = target.getBoundingClientRect();
    //  canvas.style.left = rect.left + 'px';
    //  canvas.style.top = rect.top + 'px';
    //  canvas.style.width = rect.width + 'px';
    //  canvas.style.height = rect.height + 'px';
    //} catch (e) {
    //  // ignore - fallback to absolute (0,0)
    //}
  }

  // Render scheduling
  var pending = false;
  var pendingFull = true;
  var pendingRegion = { x: 0, y: 0, n: 0 };

  function scheduleRefresh(x, y, n) {
    if (typeof x === 'undefined' && typeof y === 'undefined') {
      pendingFull = true;
    } else {
      pendingRegion.x = Math.min(pendingRegion.x, x | 0);
      pendingRegion.y = Math.min(pendingRegion.y, y | 0);
      pendingRegion.n = Math.max(pendingRegion.n, (n | 0) || 1);
    }
    if (!pending) {
      pending = true;
      requestAnimationFrame(doRefresh);
    }
  }

  function scheduleRefreshFull() {
    pendingFull = true;
    if (!pending) {
      pending = true;
      requestAnimationFrame(doRefresh);
    }
  }

  function doRefresh() {
    pending = false;
    if (typeof VIDEO === 'undefined' || !Array.isArray(VIDEO)) return;

    var rows = (typeof H === 'number') ? H : 25;
    var cols = (typeof W === 'number') ? W : 32;

    // clear entire canvas (we render full-screen for simplicity)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var V = VIDEO || [], F = FCOLOR || [], B = BCOLOR || [], A = ATTR || [];
    var charW = CHAR_W, charH = CHAR_H;

    for (var ry = 0; ry < rows; ry++) {
      var ypix = ry * charH;
      for (var rx = 0; rx < cols; rx++) {
        var xpix = rx * charW;
        var ch = (V[ry] && typeof V[ry][rx] !== 'undefined') ? V[ry][rx] : ' ';
        var fgCode = (F[ry] && typeof F[ry][rx] !== 'undefined') ? F[ry][rx] : 37;
        var bgCode = (B[ry] && typeof B[ry][rx] !== 'undefined') ? B[ry][rx] : 40;

        var fgIdx = mapAnsiToIndex(fgCode);
        var bgColor = mapAnsiToCss(bgCode);

        // background
        ctx.fillStyle = bgColor;
        ctx.fillRect(xpix, ypix, charW, charH);

        // skip blank
        if (!ch || ch === ' ' || ch === '\u00A0') continue;

        var charCode = ch.charCodeAt(0);
        if (charCode < FIRST_CHAR || charCode > LAST_CHAR) {
          ctx.fillStyle = mapAnsiToCss(fgCode);
          ctx.fillText(ch, xpix, ypix);
          continue;
        }

        var ci = charCode - FIRST_CHAR;
        var sx = ci * charW;
        var sy = fgIdx * charH;
        ctx.drawImage(atlas, sx, sy, charW, charH, xpix, ypix, charW, charH);
      }
    }
  }

  function mapAnsiToIndex(code) {
    if (typeof code === 'number' && code >= 0 && code < 16) return code;
    if (typeof code === 'number') {
      if (code >= 30 && code <= 37) return code - 30;
      if (code >= 90 && code <= 97) return 8 + (code - 90);
      if (code >= 40 && code <= 47) return code - 40;
      if (code >= 100 && code <= 107) return 8 + (code - 100);
    }
    return 7;
  }

  function mapAnsiToCss(code) {
    if (typeof code === 'string' && code.length) return code;
    var idx = mapAnsiToIndex(code);
    return ansiPalette[idx] || '#000';
  }

  // Keep reference to original pokeRefresh so we can restore it
  var originalPokeRefresh = (typeof window.pokeRefresh === 'function') ? window.pokeRefresh : function () { return false; };
  window.pokeRefresh_canvas_original = originalPokeRefresh;

  // Canvas-based pokeRefresh delegate
  function canvasPokeRefresh(x, y, n) {
    resizeCanvas();
    if (typeof x === 'undefined' && typeof y === 'undefined') {
      scheduleRefreshFull();
      return true;
    } else {
      scheduleRefresh(x, y, n);
      return true;
    }
  }

  // Public API to enable/disable renderer
  window.enableCanvasRenderer = function () {
    try {
      if (!atlas.width || !atlas.height) buildAtlas();
      resizeCanvas();
      window.pokeRefresh = canvasPokeRefresh;
      scheduleRefreshFull();
      window.__qandy_use_canvas_renderer = true;
      return true;
    } catch (e) {
      console.warn('enableCanvasRenderer failed', e);
      return false;
    }
  };

  window.disableCanvasRenderer = function () {
    try {
      window.pokeRefresh = window.pokeRefresh_canvas_original || originalPokeRefresh;
      window.__qandy_use_canvas_renderer = false;
      // keep the canvas in DOM for debugging, but you can remove it:
      // if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      return true;
    } catch (e) {
      console.warn('disableCanvasRenderer failed', e);
      return false;
    }
  };

  // Helpers
  window.__qandy_canvas_rebuild_atlas = function () {
    try { buildAtlas(); scheduleRefreshFull(); } catch (e) { console.warn(e); }
  };
  window.__qandy_canvas_resize = function () { try { resizeCanvas(); scheduleRefreshFull(); } catch (e) { console.warn(e); } };

  // Initialize atlas and auto-enable (safe: will fall back if something throws)
  try {
    buildAtlas();
    resizeCanvas();
    // Auto-enable by default; comment the next line if you prefer opt-in.
    window.enableCanvasRenderer();
  } catch (e) {
    console.warn('qandy canvas renderer init failed', e);
    // restore original pokeRefresh to be safe
    window.pokeRefresh = originalPokeRefresh;
  }
})();