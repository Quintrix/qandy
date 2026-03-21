// benchmark.js — Qandy Video Renderer Performance Suite
//
// Measures rendering performance across the memory-array renderer
// (VIDEO/FCOLOR/BCOLOR/ATTR + DOM sync), the DOM renderer (video-dom.js),
// and, optionally, the canvas renderer (svga.js).
//
// Usage (browser console or <script> tag):
//
//   QandyBenchmark.run()                         // auto-tests all available renderers
//   QandyBenchmark.run({ iterations: 5 })        // more iterations for stable numbers
//   QandyBenchmark.run({ autoSwitch: false })    // only test the current renderer
//   QandyBenchmark.run({ renderer: 'dom' })      // test a specific renderer only
//
// Quick single-test helpers:
//   QandyBenchmark.test.rapidFill(3)
//   QandyBenchmark.test.baudSim(3)
//
// Export results as JSON:
//   JSON.stringify(QandyBenchmark.lastResults, null, 2)

(function (global) {
  'use strict';

  // ── constants ──────────────────────────────────────────────────────────────

  var VERSION            = '1.0.0';
  var DEFAULT_ITERATIONS = 3;

  // Printable ASCII characters used for write operations
  var CHARS     = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
  var CHARS_LEN = CHARS.length;

  // ANSI color codes cycled during color/attribute tests
  var FG_CODES = [30, 31, 32, 33, 34, 35, 36, 37, 90, 91, 92, 93, 94, 95, 96, 97];
  var BG_CODES = [40, 41, 42, 43, 44, 45, 46, 47, 100, 101, 102, 103, 104, 105, 106, 107];

  // Baud rates to report capacity percentages for
  var BAUD_RATES = [300, 1200, 9600, 38400];

  // ── helpers ────────────────────────────────────────────────────────────────

  function now() {
    return (typeof performance !== 'undefined' && typeof performance.now === 'function')
      ? performance.now()
      : Date.now();
  }

  function getW() { return (typeof global.W === 'number') ? global.W : 32; }
  function getH() { return (typeof global.H === 'number') ? global.H : 25; }

  function padEnd(str, len) {
    str = String(str);
    while (str.length < len) str += ' ';
    return str;
  }

  function repeatChar(ch, n) {
    var s = '';
    for (var i = 0; i < n; i++) s += ch;
    return s;
  }

  // ── state save / restore ───────────────────────────────────────────────────

  function saveState() {
    return {
      CURX:    global.CURX,
      CURY:    global.CURY,
      CURFG:   global.CURFG,
      CURBG:   global.CURBG,
      CURATTR: global.CURATTR,
      CURBAUD: global.CURBAUD,
      SYNC:    global.SYNC
    };
  }

  function restoreState(s) {
    if (typeof s.CURX    !== 'undefined') global.CURX    = s.CURX;
    if (typeof s.CURY    !== 'undefined') global.CURY    = s.CURY;
    if (typeof s.CURFG   !== 'undefined') global.CURFG   = s.CURFG;
    if (typeof s.CURBG   !== 'undefined') global.CURBG   = s.CURBG;
    if (typeof s.CURATTR !== 'undefined') global.CURATTR = s.CURATTR;
    if (typeof s.CURBAUD !== 'undefined') global.CURBAUD = s.CURBAUD;
    if (typeof s.SYNC    !== 'undefined') global.SYNC    = s.SYNC;
  }

  // ── memory footprint estimate ──────────────────────────────────────────────

  function estimateMemoryKB() {
    // Chrome / Edge expose performance.memory; other browsers don't.
    if (typeof performance !== 'undefined' &&
        performance.memory &&
        typeof performance.memory.usedJSHeapSize === 'number') {
      return Math.round(performance.memory.usedJSHeapSize / 1024);
    }
    // Structural fallback: 32x25 = 800 cells.
    // VIDEO: 1 string char ~2 B; FCOLOR, BCOLOR, ATTR, DOM refs: ~8 B each (4 arrays x 8 B = 32 B);
    // total ~34 B/cell.
    return Math.round(getW() * getH() * 34 / 1024);
  }

  // ── renderer detection ─────────────────────────────────────────────────────

  function detectRenderer() {
    if (global.__qandy_use_dom_renderer)    return 'dom';
    if (global.__qandy_use_canvas_renderer) return 'canvas';
    return 'memory';
  }

  // ── statistics ─────────────────────────────────────────────────────────────

  function calcStats(times) {
    var valid = [];
    for (var i = 0; i < times.length; i++) {
      if (times[i] >= 0) valid.push(times[i]);
    }
    if (!valid.length) return { mean: 0, min: 0, max: 0, ok: false };
    var sum = 0, min = Infinity, max = -Infinity;
    for (var j = 0; j < valid.length; j++) {
      sum += valid[j];
      if (valid[j] < min) min = valid[j];
      if (valid[j] > max) max = valid[j];
    }
    return { mean: sum / valid.length, min: min, max: max, ok: true };
  }

  function fpsEq(ms) {
    if (!ms || ms <= 0) return null;
    return +(1000 / ms).toFixed(1);
  }

  // ── test 1: rapid fill (SYNC=true) ────────────────────────────────────────
  // Writes every cell sequentially; each pokeCell() triggers an immediate DOM
  // refresh when SYNC is true (memory renderer behaviour).

  function testRapidFill(iterations) {
    var cols = getW(), rows = getH(), ci = 0;
    var times = [];
    for (var iter = 0; iter < iterations; iter++) {
      try {
        var t0 = now();
        for (var y = 0; y < rows; y++) {
          for (var x = 0; x < cols; x++) {
            global.pokeCell(x, y, CHARS.charAt(ci++ % CHARS_LEN));
          }
        }
        times.push(now() - t0);
      } catch (e) {
        times.push(-1);
      }
    }
    return times;
  }

  // ── test 2: batch fill (SYNC=false + one pokeRefresh) ─────────────────────
  // Writes every cell with SYNC=false so the DOM is not touched per-cell, then
  // issues a single full-screen pokeRefresh() at the end.
  // For the DOM renderer SYNC has no effect, so this measures the same path.

  function testBatchFill(iterations) {
    var cols = getW(), rows = getH(), ci = 0;
    var origSync = global.SYNC;
    var times = [];
    for (var iter = 0; iter < iterations; iter++) {
      try {
        global.SYNC = false;
        var t0 = now();
        for (var y = 0; y < rows; y++) {
          for (var x = 0; x < cols; x++) {
            global.pokeCell(x, y, CHARS.charAt(ci++ % CHARS_LEN));
          }
        }
        if (typeof global.pokeRefresh === 'function') global.pokeRefresh();
        times.push(now() - t0);
      } catch (e) {
        times.push(-1);
      }
    }
    global.SYNC = origSync;
    return times;
  }

  // ── test 3: color / attribute cycle ───────────────────────────────────────
  // Writes every cell with a different fg/bg combination and cycling attribute
  // bitmask, stressing the class-building and style-update paths.

  function testColorCycle(iterations) {
    var cols = getW(), rows = getH(), ci = 0;
    var times = [];
    for (var iter = 0; iter < iterations; iter++) {
      try {
        var t0 = now();
        for (var y = 0; y < rows; y++) {
          for (var x = 0; x < cols; x++) {
            global.pokeCell(
              x, y,
              CHARS.charAt(ci % CHARS_LEN),
              FG_CODES[ci % FG_CODES.length],
              BG_CODES[ci % BG_CODES.length],
              ci % 4
            );
            ci++;
          }
        }
        times.push(now() - t0);
      } catch (e) {
        times.push(-1);
      }
    }
    return times;
  }

  // ── test 4: pokeRefresh() overhead ────────────────────────────────────────
  // Calls pokeRefresh() 100 times with no arguments (full-screen flush).
  // For the DOM renderer this is a no-op; for the memory renderer it walks the
  // entire DOM array.

  function testPokeRefreshOverhead(iterations) {
    var times = [];
    for (var iter = 0; iter < iterations; iter++) {
      try {
        var t0 = now();
        for (var i = 0; i < 100; i++) {
          global.pokeRefresh();
        }
        times.push(now() - t0);
      } catch (e) {
        times.push(-1);
      }
    }
    return times;
  }

  // ── test 5: cursor movement ────────────────────────────────────────────────
  // Alternates cursorHome() and cursorMoveTo() 200 times using pre-computed
  // positions to avoid random-number overhead inside the timed loop.

  function testCursorMovement(iterations) {
    var cols = getW(), rows = getH();
    var hasHome = (typeof global.cursorHome   === 'function');
    var hasMove = (typeof global.cursorMoveTo === 'function');
    // Pre-compute deterministic pseudo-random positions
    var positions = [];
    for (var p = 0; p < 200; p++) {
      positions.push([(p * 31) % cols, (p * 17) % rows]);
    }
    var times = [];
    for (var iter = 0; iter < iterations; iter++) {
      try {
        var t0 = now();
        for (var i = 0; i < 200; i++) {
          if (hasHome) global.cursorHome();
          if (hasMove) global.cursorMoveTo(positions[i][0], positions[i][1]);
        }
        times.push(now() - t0);
      } catch (e) {
        times.push(-1);
      }
    }
    return times;
  }

  // ── test 6: mixed workload ─────────────────────────────────────────────────
  // 200 operations: plain pokeCell, coloured pokeCell, cursorMoveTo, pokeRefresh
  // in a round-robin pattern — simulates typical interactive terminal output.

  function testMixedWorkload(iterations) {
    var cols = getW(), rows = getH(), ci = 0;
    var hasMove = (typeof global.cursorMoveTo === 'function');
    // Pre-compute operand data so the loop body stays tight
    var ops = [];
    for (var p = 0; p < 200; p++) {
      ops.push({
        type: p % 4,
        x:    (p * 31) % cols,
        y:    (p * 17) % rows,
        fg:   FG_CODES[p % FG_CODES.length],
        bg:   BG_CODES[p % BG_CODES.length]
      });
    }
    var times = [];
    for (var iter = 0; iter < iterations; iter++) {
      try {
        var t0 = now();
        for (var i = 0; i < ops.length; i++) {
          var op = ops[i];
          switch (op.type) {
            case 0: global.pokeCell(op.x, op.y, CHARS.charAt(ci++ % CHARS_LEN)); break;
            case 1: global.pokeCell(op.x, op.y, CHARS.charAt(ci++ % CHARS_LEN), op.fg, op.bg); break;
            case 2: if (hasMove) global.cursorMoveTo(op.x, op.y); break;
            case 3: global.pokeRefresh(op.x, op.y); break;
          }
        }
        times.push(now() - t0);
      } catch (e) {
        times.push(-1);
      }
    }
    return times;
  }

  // ── test 7: baud-rate capacity ────────────────────────────────────────────
  // Measures raw pokeCell throughput, then calculates what fraction of renderer
  // capacity each classic baud rate consumes.
  //
  // The real pokeCursor() implementation uses setTimeout for paced output;
  // this test only measures the synchronous write throughput (no delays).
  // The "renderer capacity %" answers: "at 9600 baud, how much of the renderer
  // is actually busy writing characters?"

  function testBaudSimulation(iterations) {
    var cols = getW(), rows = getH();
    var charCount = cols * rows; // 800 for 32×25
    var ci = 0;
    var times = [];
    for (var iter = 0; iter < iterations; iter++) {
      try {
        var t0 = now();
        for (var y = 0; y < rows; y++) {
          for (var x = 0; x < cols; x++) {
            global.pokeCell(x, y, CHARS.charAt(ci++ % CHARS_LEN));
          }
        }
        times.push(now() - t0);
      } catch (e) {
        times.push(-1);
      }
    }
    var s = calcStats(times);
    if (!s.ok) return null;

    var charsPerMs      = charCount / s.mean;   // actual renderer throughput
    var equivalentBaud  = Math.round(charsPerMs * 10000); // chars/ms x 10 bits/char x 1000 ms/s = baud
    var bauds           = {};
    for (var bi = 0; bi < BAUD_RATES.length; bi++) {
      var baud          = BAUD_RATES[bi];
      var baudCharsPerMs = baud / 10000;
      bauds[baud] = {
        charsPerMs:          +baudCharsPerMs.toFixed(4),
        theoreticalMs800:    +(charCount / baudCharsPerMs).toFixed(1),
        rendererCapacityPct: (baudCharsPerMs / charsPerMs * 100).toFixed(2) + '%'
      };
    }
    return {
      actualCharsPerMs: +charsPerMs.toFixed(2),
      equivalentBaud:   equivalentBaud,
      bauds:            bauds
    };
  }

  // ── run a full suite for the currently active renderer ────────────────────

  function runSuite(label, iterations) {
    console.log('[QandyBenchmark] Running suite: ' + label +
      '  (' + iterations + ' iteration' + (iterations !== 1 ? 's' : '') + ')');

    var cols  = getW(), rows = getH(), cells = cols * rows;
    var saved = saveState();
    global.CURBAUD = 0;  // disable baud pacing for raw speed measurements
    global.SYNC    = true;

    var result = {
      renderer:    label,
      cols:        cols,
      rows:        rows,
      cells:       cells,
      memKB_before: estimateMemoryKB()
    };

    // --- rapid fill ---
    var rfS = calcStats(testRapidFill(iterations));
    result.rapidFill = {
      meanMs:     rfS.ok ? +rfS.mean.toFixed(3) : null,
      minMs:      rfS.ok ? +rfS.min.toFixed(3)  : null,
      maxMs:      rfS.ok ? +rfS.max.toFixed(3)  : null,
      charsPerMs: rfS.ok ? +(cells / rfS.mean).toFixed(2) : null,
      fpsEq:      rfS.ok ? fpsEq(rfS.mean) : null
    };

    // --- batch fill ---
    var bfS = calcStats(testBatchFill(iterations));
    result.batchFill = {
      meanMs:     bfS.ok ? +bfS.mean.toFixed(3) : null,
      minMs:      bfS.ok ? +bfS.min.toFixed(3)  : null,
      maxMs:      bfS.ok ? +bfS.max.toFixed(3)  : null,
      charsPerMs: bfS.ok ? +(cells / bfS.mean).toFixed(2) : null,
      fpsEq:      bfS.ok ? fpsEq(bfS.mean) : null,
      note:       'SYNC=false + single pokeRefresh()'
    };

    // --- color cycle ---
    var ccS = calcStats(testColorCycle(iterations));
    result.colorCycle = {
      meanMs:     ccS.ok ? +ccS.mean.toFixed(3) : null,
      charsPerMs: ccS.ok ? +(cells / ccS.mean).toFixed(2) : null
    };

    // --- pokeRefresh overhead ---
    var prS = calcStats(testPokeRefreshOverhead(iterations));
    result.pokeRefresh100 = {
      totalMs:  prS.ok ? +prS.mean.toFixed(3) : null,
      perCallMs: prS.ok ? +(prS.mean / 100).toFixed(4) : null
    };

    // --- cursor movement ---
    var cmS = calcStats(testCursorMovement(iterations));
    result.cursorMovement200 = {
      totalMs: cmS.ok ? +cmS.mean.toFixed(3) : null,
      perOpMs: cmS.ok ? +(cmS.mean / 200).toFixed(4) : null
    };

    // --- mixed workload ---
    var mwS = calcStats(testMixedWorkload(iterations));
    result.mixedWorkload200 = {
      totalMs: mwS.ok ? +mwS.mean.toFixed(3) : null,
      perOpMs: mwS.ok ? +(mwS.mean / 200).toFixed(4) : null
    };

    // --- baud capacity ---
    result.baudSimulation = testBaudSimulation(iterations);

    result.memKB_after = estimateMemoryKB();
    result.isMobile = (typeof navigator !== 'undefined') && (
      navigator.maxTouchPoints > 0 ||
      /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
    );

    restoreState(saved);
    return result;
  }

  // ── comparison helper ──────────────────────────────────────────────────────

  function comparePct(baseMs, candMs) {
    if (baseMs === null || candMs === null || !baseMs) return 'n/a';
    var diff = (baseMs - candMs) / baseMs * 100;
    return diff >= 0
      ? '+' + diff.toFixed(1) + '% faster'
      : Math.abs(diff).toFixed(1) + '% slower';
  }

  // ── display results ────────────────────────────────────────────────────────

  function display(allResults) {
    var keys = Object.keys(allResults);
    if (!keys.length) return;

    // Sort so 'memory' is the baseline if present
    keys.sort(function (a, b) {
      var order = { memory: 0, dom: 1, canvas: 2 };
      return (order[a] !== undefined ? order[a] : 99) -
             (order[b] !== undefined ? order[b] : 99);
    });

    console.log('\n=== QandyBenchmark v' + VERSION + ' — Results ===');

    // ── main summary table ───────────────────────────────────────────────────
    var tbl = {};
    for (var ti = 0; ti < keys.length; ti++) {
      var r = allResults[keys[ti]];
      tbl[keys[ti]] = {
        'RapidFill ms':   r.rapidFill.meanMs,
        'RapidFill fps':  r.rapidFill.fpsEq,
        'BatchFill ms':   r.batchFill.meanMs,
        'BatchFill fps':  r.batchFill.fpsEq,
        'ColorCycle ms':  r.colorCycle.meanMs,
        'Refresh×100 ms': r.pokeRefresh100.totalMs,
        'Cursor×200 ms':  r.cursorMovement200.totalMs,
        'Mixed×200 ms':   r.mixedWorkload200.totalMs,
        'Chars/ms':       r.rapidFill.charsPerMs,
        'Memory KB':      r.memKB_after,
        'Mobile':         r.isMobile ? 'yes' : 'no'
      };
    }
    console.table(tbl);

    // ── baud capacity table ──────────────────────────────────────────────────
    console.log('--- Baud Rate Capacity (% of renderer used at each speed) ---');
    var btbl = {};
    for (var bi = 0; bi < keys.length; bi++) {
      var bs = allResults[keys[bi]].baudSimulation;
      if (!bs) { btbl[keys[bi]] = { note: 'unavailable' }; continue; }
      var row = {
        'Chars/ms actual': bs.actualCharsPerMs,
        'Equiv baud':      bs.equivalentBaud
      };
      for (var bri = 0; bri < BAUD_RATES.length; bri++) {
        var baud = BAUD_RATES[bri];
        row['@ ' + baud + ' baud'] = bs.bauds[baud]
          ? bs.bauds[baud].rendererCapacityPct
          : 'n/a';
      }
      btbl[keys[bi]] = row;
    }
    console.table(btbl);

    // ── comparison table (if more than one renderer) ─────────────────────────
    if (keys.length >= 2) {
      console.log('--- Speed Comparison (vs "' + keys[0] + '" baseline) ---');
      var ctbl = {};
      var base = allResults[keys[0]];
      for (var ci = 1; ci < keys.length; ci++) {
        var cand = allResults[keys[ci]];
        ctbl[keys[ci]] = {
          'RapidFill':   comparePct(base.rapidFill.meanMs,          cand.rapidFill.meanMs),
          'BatchFill':   comparePct(base.batchFill.meanMs,          cand.batchFill.meanMs),
          'ColorCycle':  comparePct(base.colorCycle.meanMs,         cand.colorCycle.meanMs),
          'Refresh×100': comparePct(base.pokeRefresh100.totalMs,    cand.pokeRefresh100.totalMs),
          'Cursor×200':  comparePct(base.cursorMovement200.totalMs, cand.cursorMovement200.totalMs),
          'Mixed×200':   comparePct(base.mixedWorkload200.totalMs,  cand.mixedWorkload200.totalMs)
        };
      }
      console.table(ctbl);
    }

    // ── ASCII bar chart: full-screen fill time ───────────────────────────────
    console.log('--- Full-Screen Fill Time (lower bar = faster) ---');
    var maxMs = 0;
    for (var ai = 0; ai < keys.length; ai++) {
      var ms = allResults[keys[ai]].rapidFill.meanMs || 0;
      if (ms > maxMs) maxMs = ms;
    }
    var BAR_WIDTH = 36;
    for (var li = 0; li < keys.length; li++) {
      var rms  = allResults[keys[li]].rapidFill.meanMs || 0;
      var rfps = allResults[keys[li]].rapidFill.fpsEq  || 0;
      var bars = maxMs > 0 ? Math.round((rms / maxMs) * BAR_WIDTH) : 0;
      var bar  = repeatChar('\u2588', bars) + repeatChar('\u2591', BAR_WIDTH - bars);
      console.log(padEnd(keys[li], 8) + ' |' + bar + '|  ' +
        (rms || 0).toFixed(3) + 'ms  (' + (rfps || 0) + ' fps equiv)');
    }

    console.log('\nNotes:');
    console.log('  BatchFill: SYNC=false, writes all cells then calls pokeRefresh() once.');
    console.log('  Canvas renderer: pokeRefresh() only schedules a RAF draw — actual');
    console.log('    canvas paint happens asynchronously and is not included in timings.');
    console.log('  Memory KB: uses performance.memory (Chrome) or structural estimate.');
  }

  // ── main entry point ───────────────────────────────────────────────────────

  function run(opts) {
    opts = opts || {};
    var iterations = (typeof opts.iterations === 'number' && opts.iterations > 0)
      ? Math.floor(opts.iterations)
      : DEFAULT_ITERATIONS;
    var autoSwitch = (opts.autoSwitch !== false);
    var onlyThis   = opts.renderer || null; // 'memory' | 'dom' | 'canvas' | null

    if (typeof global.pokeCell !== 'function') {
      console.warn('[QandyBenchmark] pokeCell not found — is Qandy loaded?');
      return null;
    }

    console.log('QandyBenchmark v' + VERSION +
      '  grid: ' + getW() + 'x' + getH() +
      '  iterations: ' + iterations);

    var allResults      = {};
    var currentRenderer = detectRenderer();

    // Always benchmark the currently active renderer
    if (!onlyThis || onlyThis === currentRenderer) {
      allResults[currentRenderer] = runSuite(currentRenderer, iterations);
    }

    if (autoSwitch && !onlyThis) {
      // Switch to DOM renderer if available and not already active
      if (currentRenderer !== 'dom' && typeof global.enableDOMRenderer === 'function') {
        try {
          if (global.enableDOMRenderer()) {
            allResults['dom'] = runSuite('dom', iterations);
            if (typeof global.disableDOMRenderer === 'function') global.disableDOMRenderer();
          }
        } catch (e) {
          console.warn('[QandyBenchmark] DOM renderer switch failed:', e);
        }
      }

      // If we started on the DOM renderer, also benchmark the memory renderer
      if (currentRenderer === 'dom' && typeof global.disableDOMRenderer === 'function') {
        try {
          global.disableDOMRenderer();
          allResults['memory'] = runSuite('memory', iterations);
          global.enableDOMRenderer(); // restore original renderer
        } catch (e) {
          console.warn('[QandyBenchmark] Memory renderer switch failed:', e);
        }
      }

      // Canvas renderer is optional — note that its actual draw is async (RAF)
      if (currentRenderer !== 'canvas' && typeof global.enableCanvasRenderer === 'function') {
        try {
          if (global.enableCanvasRenderer()) {
            console.log('[QandyBenchmark] canvas: timing measures pokeRefresh schedule ' +
              'overhead only; actual canvas paint is asynchronous (RAF).');
            allResults['canvas'] = runSuite('canvas', iterations);
            if (typeof global.disableCanvasRenderer === 'function') global.disableCanvasRenderer();
          }
        } catch (e) {
          console.warn('[QandyBenchmark] Canvas renderer switch failed:', e);
        }
      }

    } else if (onlyThis && onlyThis !== currentRenderer) {
      console.warn('[QandyBenchmark] Renderer "' + onlyThis + '" is not currently active ' +
        '(active: "' + currentRenderer + '"). Enable it first or use autoSwitch:true.');
    }

    display(allResults);

    var exportObj = {
      version:    VERSION,
      timestamp:  new Date().toISOString(),
      userAgent:  (typeof navigator !== 'undefined') ? navigator.userAgent : 'unknown',
      grid:       { cols: getW(), rows: getH() },
      iterations: iterations,
      results:    allResults
    };

    global.QandyBenchmark.lastResults = exportObj;

    console.log('\nResults stored in QandyBenchmark.lastResults');
    console.log('Export: JSON.stringify(QandyBenchmark.lastResults, null, 2)');

    return exportObj;
  }

  // ── public API ─────────────────────────────────────────────────────────────

  global.QandyBenchmark = {
    /** Semantic version of this benchmark script. */
    version: VERSION,

    /**
     * Run the full benchmark suite.
     *
     * @param {Object}  [opts]
     * @param {number}  [opts.iterations=3]      - Repetitions per test (more = stable numbers).
     * @param {boolean} [opts.autoSwitch=true]   - Automatically switch between available renderers.
     * @param {string}  [opts.renderer]          - Only run for one renderer ('memory'|'dom'|'canvas').
     * @returns {Object} Exportable results object also stored in QandyBenchmark.lastResults.
     */
    run: run,

    /** Most recent run results (null before first run). */
    lastResults: null,

    /**
     * Individual test runners — handy for quick console checks.
     * Each returns a stats object { mean, min, max, ok }.
     *
     * @example
     *   QandyBenchmark.test.rapidFill(5)    // 5 iterations
     *   QandyBenchmark.test.baudSim(3)      // baud capacity
     */
    test: {
      rapidFill:     function (n) { return calcStats(testRapidFill(n || 1)); },
      batchFill:     function (n) { return calcStats(testBatchFill(n || 1)); },
      colorCycle:    function (n) { return calcStats(testColorCycle(n || 1)); },
      pokeRefresh:   function (n) { return calcStats(testPokeRefreshOverhead(n || 1)); },
      cursorMove:    function (n) { return calcStats(testCursorMovement(n || 1)); },
      mixedWorkload: function (n) { return calcStats(testMixedWorkload(n || 1)); },
      baudSim:       function (n) { return testBaudSimulation(n || 1); }
    },

    /**
     * Serialise the last results to a JSON string for external tracking.
     * @returns {string|null}
     */
    exportJSON: function () {
      if (!global.QandyBenchmark.lastResults) {
        console.warn('[QandyBenchmark] No results yet. Run QandyBenchmark.run() first.');
        return null;
      }
      return JSON.stringify(global.QandyBenchmark.lastResults, null, 2);
    }
  };

  console.log('QandyBenchmark v' + VERSION + ' loaded.  Run: QandyBenchmark.run()');

})(typeof window !== 'undefined' ? window : this);

QandyBenchmark.run()
