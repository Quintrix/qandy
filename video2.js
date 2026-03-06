/* Canvas-backed renderer for Qandy
   - Non-invasive: keeps VIDEO/FCOLOR/BCOLOR/ATTR as source-of-truth.
   - Generates glyph atlas (ASCII 32..126) across 16 ANSI colors.
   - Overrides window.pokeRefresh to render from the atlas via drawImage.
   - Fall-back: if atlas fails, uses canvas.fillText per glyph.
*/

(function() {
  if (typ/* Canvas-backed renderer for Qandy
   - Non-invasive: keeps VIDEO/FCOLOR/BCOLOR/ATTR as source-of-truth.
   - Generates glyph atlas (ASCII 32..126) across 16 ANSI colors.
   - Overrides window.pokeRefresh to render from the atlas via drawImage.
   - Fall-back: if atlas fails, uses canvas.fillText per glyph.
*/

(function() {
  if (typeof document === 'undefined') return;
  if (window.__qandy_canvas_renderer_initialized) return;
  window.__qandy_canvas_renderer_initialized = true;

  // Configuration - tune CHAR_W/CHAR_H/FONT to match your desired look/legacy DOM cell size
  var CHAR_W = 12;            // pixel width per character
  var CHAR_H = 18;            // pixel height per character (line height)
  var FONT = "16px monospace"; // canvas font - tune to match the DOM grid
  var FIRST_CHAR = 32;
  var LAST_CHAR = 126;
  var NUM_CHARS = LAST_CHAR - FIRST_CHAR + 1;
  var NUM_COLORS = 16; // ANSI 0..15 (use codes mapped below)

  // ANSI color mapping (index -> css hex); reuse _ansiCssMap if present
  var baseAnsi = (typeof _ansiCssMap !== 'undefined') ? _ansiCssMap : {
    30:'#000',31:'#c00',32:'#0c0',33:'#cc0',34:'#00c',35:'#c0c',36:'#0cc',37:'#ccc',
    90:'#555',91:'#f55',92:'#5f5',93:'#ff5',94:'#55f',95:'#f5f',96:'#5ff',97:'#fff'
  };
  // Build 16-color mapping: normal fg 30..37 = indices 0..7, bright 90..97 = 8..15
  var ansiPalette = [];
  for (var i = 0; i < 8; i++) {
    ansiPalette[i] = baseAnsi[30 + i] || '#000';
  }
  for (var i = 0; i < 8; i++) {
    ansiPalette[8 + i] = baseAnsi[90 + i] || ansiPalette[i];
  }

  // Create canvas element and insert near existing container (keyboard-container used in qandy)
  var canvas = document.createElement('canvas');
  canvas.id = 'qandy-canvas';
  canvas.style.display = 'block';
  canvas.style.background = '#000';
  canvas.style.imageRendering = 'pixelated';
  canvas.tabIndex = -1;
  // Try to place canvas in the same container qandy uses; fallback to body
  var anchor = document.getElementById('keyboard-container') || document.body;
  anchor.insertBefore(canvas, anchor.firstChild);

  var ctx = canvas.getContext('2d');
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';

  // Offscreen atlas canvas
  var atlas = document.createElement('canvas');
  var actx = atlas.getContext('2d');

  // Atlas layout: columns = NUM_CHARS, rows = NUM_COLORS
  function buildAtlas() {
    atlas.width = NUM_CHARS * CHAR_W;
    atlas.height = NUM_COLORS * CHAR_H;
    // Use high-quality smoothing off for pixel look
    actx.imageSmoothingEnabled = false;
    actx.font = FONT;
    actx.textBaseline = 'top';

    // Pre-fill backgrounds with transparent
    actx.clearRect(0, 0, atlas.width, atlas.height);

    for (var colorIdx = 0; colorIdx < NUM_COLORS; colorIdx++) {
      var fg = ansiPalette[colorIdx] || '#fff';
      actx.fillStyle = fg;
      for (var ci = 0; ci < NUM_CHARS; ci++) {
        var ch = String.fromCharCode(FIRST_CHAR + ci);
        var sx = ci * CHAR_W;
        var sy = colorIdx * CHAR_H;
        // clear glyph cell
        actx.clearRect(sx, sy, CHAR_W, CHAR_H);
        // draw glyph
        actx.fillStyle = fg;
        actx.fillText(ch, sx, sy);
      }
    }
    // Done. atlas now contains glyphs colorized for each ANSI color.
  }

  // Resize canvas to W/H cells
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
  }

  // Render scheduling
  var pending = false;
  var pendingFull = true; // default to full-screen when scheduled without coords
  var pendingRegion = { x: 0, y: 0, n: 0 };

  function scheduleRefresh(x,y,n) {
    if (typeof x === 'undefined' && typeof y === 'undefined') {
      pendingFull = true;
    } else {
      pendingFull = pendingFull || false;
      // Conservative expansion: mark some region changed; we'll render whole screen or rows anyway.
      pendingRegion.x = Math.min(pendingRegion.x, x|0);
      pendingRegion.y = Math.min(pendingRegion.y, y|0);
      pendingRegion.n = Math.max(pendingRegion.n, (n|0) || 1);
    }
    if (!pending) {
      pending = true;
      requestAnimationFrame(doRefresh);
    }
  }

  function doRefresh() {
    pending = false;
    // If VIDEO not present yet, abort
    if (typeof VIDEO === 'undefined') return;
    var rows = (typeof H === 'number') ? H : 25;
    var cols = (typeof W === 'number') ? W : 32;

    // Option: render full-screen always (simpler and often faster given atlas blits)
    // We'll render by rows and columns
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Local references to speed up access
    var V = VIDEO, F = FCOLOR, B = BCOLOR, A = ATTR;
    var charW = CHAR_W, charH = CHAR_H;
    var aW = NUM_CHARS * CHAR_W;

    for (var ry = 0; ry < rows; ry++) {
      var ypix = ry * charH;
      // We'll draw each cell: bg fill then glyph draw from atlas (or skip on space)
      for (var rx = 0; rx < cols; rx++) {
        var xpix = rx * charW;
        var ch = (V[ry] && typeof V[ry][rx] !== 'undefined') ? V[ry][rx] : ' ';
        var fgCode = (F[ry] && typeof F[ry][rx] !== 'undefined') ? F[ry][rx] : 37;
        var bgCode = (B[ry] && typeof B[ry][rx] !== 'undefined') ? B[ry][rx] : 40;

        // map fgCode/bgCode to color indices between 0..15
        var fgIdx = mapAnsiToIndex(fgCode);
        var bgColor = mapAnsiToCss(bgCode);

        // fill background
        ctx.fillStyle = bgColor;
        ctx.fillRect(xpix, ypix, charW, charH);

        // skip space glyphs
        if (!ch || ch === ' ' || ch === '\u00A0') continue;
        // atlas blit
        var charCode = ch.charCodeAt(0);
        if (charCode < FIRST_CHAR || charCode > LAST_CHAR) {
          // fallback to fillText for out-of-range glyph
          ctx.fillStyle = mapAnsiToCss(fgCode);
          ctx.fillText(ch, xpix, ypix);
          continue;
        }
        var ci = charCode - FIRST_CHAR;
        var sx = ci * charW;
        var sy = fgIdx * charH;
        // draw glyph from atlas
        ctx.drawImage(atlas, sx, sy, charW, charH, xpix, ypix, charW, charH);
      }
    }
  }

  // Map an ANSI color code number to ANSI index 0..15
  function mapAnsiToIndex(code) {
    // if code is already index 0..15, use it
    if (typeof code === 'number' && code >= 0 && code < 16) return code;
    // typical codes: 30..37 normal, 90..97 bright, 37/47 etc.
    if (typeof code === 'number') {
      if (code >= 30 && code <= 37) return code - 30;
      if (code >= 90 && code <= 97) return 8 + (code - 90);
      // backgrounds 40..47, 100..107 are similar; we'll map background->foreground index as best-effort
      if (code >= 40 && code <= 47) return code - 40;
      if (code >= 100 && code <= 107) return 8 + (code - 100);
    }
    // fallback
    return 7; // white-ish
  }

  function mapAnsiToCss(code) {
    // If code is string CSS, return it
    if (typeof code === 'string' && code.length) return code;
    var idx = mapAnsiToIndex(code);
    return ansiPalette[idx] || '#000';
  }

  // Expose a small API and override pokeRefresh
  resizeCanvas();
  try { buildAtlas(); } catch (e) { /* atlas failed - fallback to fillText path */ }

  var originalPokeRefresh = window.pokeRefresh;
  window.pokeRefresh_canvas_original = originalPokeRefresh; // keep ref

  window.pokeRefresh = function(x,y,n) {
    // If resize needed (W / H may be changed by other code), call resize
    resizeCanvas();
    // schedule a canvas refresh — ignore region params for simplicity (could optimize)
    if (typeof x === 'undefined' && typeof y === 'undefined') {
      scheduleRefreshFull();
      return true;
    } else {
      scheduleRefresh(x,y,n);
      return true;
    }
  };

  function scheduleRefreshFull() {
    pendingFull = true;
    if (!pending) {
      pending = true;
      requestAnimationFrame(doRefresh);
    }
  }

  // Ensure initial full refresh once everything is loaded
  scheduleRefreshFull();

  // Expose helpers for toggling back to DOM or explicit resize
  window.__qandy_use_canvas_renderer = true;
  window.__qandy_canvas_resize = resizeCanvas;
  window.__qandy_canvas_rebuild_atlas = function() { buildAtlas(); scheduleRefreshFull(); };

  // Optionally hide the old DOM grid to avoid redundant rendering.
  // Commented out by default — you can enable it after verifying visual parity.
  // var domContainer = document.getElementById('qandy-dom-grid'); // adapt to your DOM id
  // if (domContainer) domContainer.style.display = 'none';

})();eof document === 'undefined') return;
  if (window.__qandy_canvas_renderer_initialized) return;
  window.__qandy_canvas_renderer_initialized = true;

  // Configuration - tune CHAR_W/CHAR_H/FONT to match your desired look/legacy DOM cell size
  var CHAR_W = 12;            // pixel width per character
  var CHAR_H = 18;            // pixel height per character (line height)
  var FONT = "16px monospace"; // canvas font - tune to match the DOM grid
  var FIRST_CHAR = 32;
  var LAST_CHAR = 126;
  var NUM_CHARS = LAST_CHAR - FIRST_CHAR + 1;
  var NUM_COLORS = 16; // ANSI 0..15 (use codes mapped below)

  // ANSI color mapping (index -> css hex); reuse _ansiCssMap if present
  var baseAnsi = (typeof _ansiCssMap !== 'undefined') ? _ansiCssMap : {
    30:'#000',31:'#c00',32:'#0c0',33:'#cc0',34:'#00c',35:'#c0c',36:'#0cc',37:'#ccc',
    90:'#555',91:'#f55',92:'#5f5',93:'#ff5',94:'#55f',95:'#f5f',96:'#5ff',97:'#fff'
  };
  // Build 16-color mapping: normal fg 30..37 = indices 0..7, bright 90..97 = 8..15
  var ansiPalette = [];
  for (var i = 0; i < 8; i++) {
    ansiPalette[i] = baseAnsi[30 + i] || '#000';
  }
  for (var i = 0; i < 8; i++) {
    ansiPalette[8 + i] = baseAnsi[90 + i] || ansiPalette[i];
  }

  // Create canvas element and insert near existing container (keyboard-container used in qandy)
  var canvas = document.createElement('canvas');
  canvas.id = 'qandy-canvas';
  canvas.style.display = 'block';
  canvas.style.background = '#000';
  canvas.style.imageRendering = 'pixelated';
  canvas.tabIndex = -1;
  // Try to place canvas in the same container qandy uses; fallback to body
  var anchor = document.getElementById('keyboard-container') || document.body;
  anchor.insertBefore(canvas, anchor.firstChild);

  var ctx = canvas.getContext('2d');
  ctx.font = FONT;
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fff';

  // Offscreen atlas canvas
  var atlas = document.createElement('canvas');
  var actx = atlas.getContext('2d');

  // Atlas layout: columns = NUM_CHARS, rows = NUM_COLORS
  function buildAtlas() {
    atlas.width = NUM_CHARS * CHAR_W;
    atlas.height = NUM_COLORS * CHAR_H;
    // Use high-quality smoothing off for pixel look
    actx.imageSmoothingEnabled = false;
    actx.font = FONT;
    actx.textBaseline = 'top';

    // Pre-fill backgrounds with transparent
    actx.clearRect(0, 0, atlas.width, atlas.height);

    for (var colorIdx = 0; colorIdx < NUM_COLORS; colorIdx++) {
      var fg = ansiPalette[colorIdx] || '#fff';
      actx.fillStyle = fg;
      for (var ci = 0; ci < NUM_CHARS; ci++) {
        var ch = String.fromCharCode(FIRST_CHAR + ci);
        var sx = ci * CHAR_W;
        var sy = colorIdx * CHAR_H;
        // clear glyph cell
        actx.clearRect(sx, sy, CHAR_W, CHAR_H);
        // draw glyph
        actx.fillStyle = fg;
        actx.fillText(ch, sx, sy);
      }
    }
    // Done. atlas now contains glyphs colorized for each ANSI color.
  }

  // Resize canvas to W/H cells
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
  }

  // Render scheduling
  var pending = false;
  var pendingFull = true; // default to full-screen when scheduled without coords
  var pendingRegion = { x: 0, y: 0, n: 0 };

  function scheduleRefresh(x,y,n) {
    if (typeof x === 'undefined' && typeof y === 'undefined') {
      pendingFull = true;
    } else {
      pendingFull = pendingFull || false;
      // Conservative expansion: mark some region changed; we'll render whole screen or rows anyway.
      pendingRegion.x = Math.min(pendingRegion.x, x|0);
      pendingRegion.y = Math.min(pendingRegion.y, y|0);
      pendingRegion.n = Math.max(pendingRegion.n, (n|0) || 1);
    }
    if (!pending) {
      pending = true;
      requestAnimationFrame(doRefresh);
    }
  }

  function doRefresh() {
    pending = false;
    // If VIDEO not present yet, abort
    if (typeof VIDEO === 'undefined') return;
    var rows = (typeof H === 'number') ? H : 25;
    var cols = (typeof W === 'number') ? W : 32;

    // Option: render full-screen always (simpler and often faster given atlas blits)
    // We'll render by rows and columns
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Local references to speed up access
    var V = VIDEO, F = FCOLOR, B = BCOLOR, A = ATTR;
    var charW = CHAR_W, charH = CHAR_H;
    var aW = NUM_CHARS * CHAR_W;

    for (var ry = 0; ry < rows; ry++) {
      var ypix = ry * charH;
      // We'll draw each cell: bg fill then glyph draw from atlas (or skip on space)
      for (var rx = 0; rx < cols; rx++) {
        var xpix = rx * charW;
        var ch = (V[ry] && typeof V[ry][rx] !== 'undefined') ? V[ry][rx] : ' ';
        var fgCode = (F[ry] && typeof F[ry][rx] !== 'undefined') ? F[ry][rx] : 37;
        var bgCode = (B[ry] && typeof B[ry][rx] !== 'undefined') ? B[ry][rx] : 40;

        // map fgCode/bgCode to color indices between 0..15
        var fgIdx = mapAnsiToIndex(fgCode);
        var bgColor = mapAnsiToCss(bgCode);

        // fill background
        ctx.fillStyle = bgColor;
        ctx.fillRect(xpix, ypix, charW, charH);

        // skip space glyphs
        if (!ch || ch === ' ' || ch === '\u00A0') continue;
        // atlas blit
        var charCode = ch.charCodeAt(0);
        if (charCode < FIRST_CHAR || charCode > LAST_CHAR) {
          // fallback to fillText for out-of-range glyph
          ctx.fillStyle = mapAnsiToCss(fgCode);
          ctx.fillText(ch, xpix, ypix);
          continue;
        }
        var ci = charCode - FIRST_CHAR;
        var sx = ci * charW;
        var sy = fgIdx * charH;
        // draw glyph from atlas
        ctx.drawImage(atlas, sx, sy, charW, charH, xpix, ypix, charW, charH);
      }
    }
  }

  // Map an ANSI color code number to ANSI index 0..15
  function mapAnsiToIndex(code) {
    // if code is already index 0..15, use it
    if (typeof code === 'number' && code >= 0 && code < 16) return code;
    // typical codes: 30..37 normal, 90..97 bright, 37/47 etc.
    if (typeof code === 'number') {
      if (code >= 30 && code <= 37) return code - 30;
      if (code >= 90 && code <= 97) return 8 + (code - 90);
      // backgrounds 40..47, 100..107 are similar; we'll map background->foreground index as best-effort
      if (code >= 40 && code <= 47) return code - 40;
      if (code >= 100 && code <= 107) return 8 + (code - 100);
    }
    // fallback
    return 7; // white-ish
  }

  function mapAnsiToCss(code) {
    // If code is string CSS, return it
    if (typeof code === 'string' && code.length) return code;
    var idx = mapAnsiToIndex(code);
    return ansiPalette[idx] || '#000';
  }

  // Expose a small API and override pokeRefresh
  resizeCanvas();
  try { buildAtlas(); } catch (e) { /* atlas failed - fallback to fillText path */ }

  var originalPokeRefresh = window.pokeRefresh;
  window.pokeRefresh_canvas_original = originalPokeRefresh; // keep ref

  window.pokeRefresh = function(x,y,n) {
    // If resize needed (W / H may be changed by other code), call resize
    resizeCanvas();
    // schedule a canvas refresh — ignore region params for simplicity (could optimize)
    if (typeof x === 'undefined' && typeof y === 'undefined') {
      scheduleRefreshFull();
      return true;
    } else {
      scheduleRefresh(x,y,n);
      return true;
    }
  };

  function scheduleRefreshFull() {
    pendingFull = true;
    if (!pending) {
      pending = true;
      requestAnimationFrame(doRefresh);
    }
  }

  // Ensure initial full refresh once everything is loaded
  scheduleRefreshFull();

  // Expose helpers for toggling back to DOM or explicit resize
  window.__qandy_use_canvas_renderer = true;
  window.__qandy_canvas_resize = resizeCanvas;
  window.__qandy_canvas_rebuild_atlas = function() { buildAtlas(); scheduleRefreshFull(); };

  // Optionally hide the old DOM grid to avoid redundant rendering.
  // Commented out by default — you can enable it after verifying visual parity.
  // var domContainer = document.getElementById('qandy-dom-grid'); // adapt to your DOM id
  // if (domContainer) domContainer.style.display = 'none';

})();