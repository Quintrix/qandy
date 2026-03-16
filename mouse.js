/* mouse.js
 *
 * Pointer & mouse glue for Qandy
 *
 * Exposes (Qandy System, called by qandy.js / host):
 *   pointerDown(evtOrMouseEvent)
 *   pointerUp(evtOrMouseEvent)
 *   pointerClick(evtOrMouseEvent)
 *   pointerMove(evtOrMouseEvent)
 *
 * Exposes (RUN script API, called by guest scripts when RUN !== "qandy.js"):
 *   mouseDown(ev)
 *   mouseUp(ev)
 *   mouseClick(ev)
 *   mouseMove(ev)
 *
 * Utilities:
 *   ensureCellAttributes() - (re)apply stable data-qx/data-qy/data-qz attributes to DOM cells
 *   attachPointerHandlers(container) - convenience: bind pointer events for host UI
 *
 * Integration notes:
 * - Call ensureCellAttributes() after any DOM rebuild (e.g. at the end of pokeRefresh() or right after the code that recreates the cell DOM).
 * - pointer* functions attempt to resolve cell coordinates from the event target. If attributes are missing they will call ensureCellAttributes() lazily.
 * - When a RUN script is active (RUN !== "qandy.js") and defines mouseDown/mouseUp/mouseClick/mouseMove, the pointer* functions will forward normalized events to those functions.
 *
 * Author: generated helper for your "fixing-bugsssss" branch
 * Date: 2026-03-16
 */

(function (global) {
  'use strict';

  // Defensive defaults — these should be supplied by the page already
  var W = (typeof global.W === 'number') ? global.W : 32;
  var H = (typeof global.H === 'number') ? global.H : 25;

  // Public API object (exposed as window.QandyPointer for convenience)
  var QP = {
    ensureCellAttributes: ensureCellAttributes,
    attachPointerHandlers: attachPointerHandlers,
    pointerDown: pointerDown,
    pointerUp: pointerUp,
    pointerClick: pointerClick,
    pointerMove: pointerMove,

    // run aliases (guest-facing): will be invoked by pointer* if present
    mouseDown: null,
    mouseUp: null,
    mouseClick: null,
    mouseMove: null,

    // small listener registry for other host code to subscribe
    _listeners: { down: [], up: [], click: [], move: [] },
    addListener: addListener,
    removeListener: removeListener
  };

  // Export
  global.QandyPointer = global.QandyPointer || QP;
  // also export short names (familiar globals)
  global.pointerDown = global.pointerDown || pointerDown;
  global.pointerUp   = global.pointerUp   || pointerUp;
  global.pointerClick= global.pointerClick|| pointerClick;
  global.pointerMove = global.pointerMove || pointerMove;

  // If user wants run-style names available immediately
  global.mouseDown = global.mouseDown || null;
  global.mouseUp   = global.mouseUp   || null;
  global.mouseClick= global.mouseClick|| null;
  global.mouseMove = global.mouseMove || null;

  // Helper: parse cell id like "c12_3" => {x:3,y:12}
  function parseCellId(id) {
    if (!id || typeof id !== 'string') return null;
    var m = id.match(/^c(\d+)[_,-](\d+)$/);
    if (!m) m = id.match(/^c(\d+)[,_](\d+)$/);
    if (!m) return null;
    return { y: parseInt(m[1], 10), x: parseInt(m[2], 10) };
  }

  // Ensure every cell element in window.DOM (if present) or in DOM tree has stable data-qx/data-qy/data-qz attributes.
  // This should be called after the code that (re)creates the cell DOM, e.g. after pokeRefresh build or after the DOM fragment append.
  function ensureCellAttributes() {
    try {
      // update runtime W/H from global if present
      if (typeof global.W === 'number') W = global.W;
      if (typeof global.H === 'number') H = global.H;
    } catch (e) {}

    var count = 0;

    // Preferred fast path: use window.DOM rows/columns if available
    if (global.DOM && Array.isArray(global.DOM) && global.DOM.length > 0) {
      for (var y = 0; y < global.DOM.length; y++) {
        var row = global.DOM[y];
        if (!row || !row.length) continue;
        for (var x = 0; x < row.length; x++) {
          var el = row[x];
          if (!el || !el.setAttribute) continue;
          // apply stable attributes
          el.setAttribute('data-qx', String(x));
          el.setAttribute('data-qy', String(y));
          el.setAttribute('data-qz', '0');
          count++;
        }
      }
      return { ok: true, method: 'DOM-array', applied: count };
    }

    // Fallback: find all elements with class "qandy-cell"
    var els = document.querySelectorAll && document.querySelectorAll('.qandy-cell');
    if (!els || !els.length) {
      return { ok: false, applied: 0, reason: 'no qandy-cell elements found' };
    }

    for (var i = 0; i < els.length; i++) {
      var el2 = els[i];
      if (!el2 || !el2.setAttribute) continue;
      // If already has data attributes, skip parsing for speed
      if (el2.hasAttribute('data-qx') && el2.hasAttribute('data-qy')) {
        count++;
        continue;
      }
      // try parse from id "c{y}_{x}"
      var coords = parseCellId(el2.id);
      if (!coords) {
        // try to infer by looking up the parent row (if row created as direct children)
        var parent = el2.parentNode;
        if (parent) {
          // find index of el2 in parent children
          var children = parent.children || parent.childNodes;
          var idx = -1;
          for (var k = 0; k < children.length; k++) {
            if (children[k] === el2) { idx = k; break; }
          }
          if (idx !== -1) {
            // attempt to detect row index by testing parent's position among its siblings
            var prow = parent.parentNode;
            var py = -1;
            if (prow) {
              var siblings = prow.children || prow.childNodes;
              for (var sk = 0; sk < siblings.length; sk++) {
                if (siblings[sk] === parent) { py = sk; break; }
              }
            }
            if (py >= 0 && idx >= 0) coords = { x: idx, y: py };
          }
        }
      }
      if (coords) {
        el2.setAttribute('data-qx', String(coords.x));
        el2.setAttribute('data-qy', String(coords.y));
        el2.setAttribute('data-qz', '0');
        count++;
      } else {
        // last resort: set sentinel attributes so future ensureCellAttributes won't keep reattempting expensive inference
        el2.setAttribute('data-qx', '-1');
        el2.setAttribute('data-qy', '-1');
        el2.setAttribute('data-qz', '0');
      }
    }

    return { ok: true, method: 'queryAll', applied: count };
  }

  // Resolve a DOM element (or point) to a qandy cell {el, x, y, clientX, clientY, pageX, pageY}
  function resolveCellFromEvent(ev) {
    if (!ev) return null;

    var clientX = (typeof ev.clientX === 'number') ? ev.clientX : (ev.touches && ev.touches[0] && ev.touches[0].clientX) || 0;
    var clientY = (typeof ev.clientY === 'number') ? ev.clientY : (ev.touches && ev.touches[0] && ev.touches[0].clientY) || 0;

    var el = ev.target || document.elementFromPoint(clientX, clientY);
    if (!el) return null;

    // climb until we find a qandy-cell
    var depth = 0;
    while (el && el !== document.documentElement && depth < 12) {
      if (el.classList && el.classList.contains('qandy-cell')) break;
      el = el.parentNode;
      depth++;
    }
    if (!el || el === document.documentElement) {
      // nothing found
      return null;
    }

    // If attributes missing, attempt to repair lazily
    var qx = el.getAttribute && el.getAttribute('data-qx');
    var qy = el.getAttribute && el.getAttribute('data-qy');

    if ((qx === null || qy === null) || (qx === '-1' && qy === '-1')) {
      // Re-apply attributes site-wide — cheaper than trying to infer for each element
      ensureCellAttributes();
      // try again
      qx = el.getAttribute && el.getAttribute('data-qx');
      qy = el.getAttribute && el.getAttribute('data-qy');
    }

    // try parse id as backup
    if ((qx === null || qy === null || qx === '-1' || qy === '-1') && el.id) {
      var p = parseCellId(el.id);
      if (p) {
        qx = String(p.x);
        qy = String(p.y);
      }
    }

    var xi = (qx != null && qx !== '-1') ? parseInt(qx, 10) : undefined;
    var yi = (qy != null && qy !== '-1') ? parseInt(qy, 10) : undefined;

    return {
      el: el,
      cellX: (typeof xi === 'number' && !isNaN(xi)) ? xi : undefined,
      cellY: (typeof yi === 'number' && !isNaN(yi)) ? yi : undefined,
      clientX: clientX,
      clientY: clientY,
      pageX: (typeof ev.pageX === 'number') ? ev.pageX : (window.pageXOffset + clientX),
      pageY: (typeof ev.pageY === 'number') ? ev.pageY : (window.pageYOffset + clientY),
      originalEvent: ev
    };
  }

  // Build normalized pointer object we send to listeners and to RUN mouse* functions
  function buildPointerEvent(kind, resolved, ev) {
    ev = ev || (resolved && resolved.originalEvent) || {};
    var btn = (typeof ev.button === 'number') ? ev.button : 0;
    var buttons = (typeof ev.buttons === 'number') ? ev.buttons : 1;
    var normalized = {
      kind: kind,                  // "down" | "up" | "click" | "move"
      cellX: resolved ? resolved.cellX : undefined,
      cellY: resolved ? resolved.cellY : undefined,
      cellEl: resolved ? resolved.el : undefined,
      clientX: resolved ? resolved.clientX : (typeof ev.clientX === 'number' ? ev.clientX : null),
      clientY: resolved ? resolved.clientY : (typeof ev.clientY === 'number' ? ev.clientY : null),
      pageX: resolved ? resolved.pageX : (typeof ev.pageX === 'number' ? ev.pageX : null),
      pageY: resolved ? resolved.pageY : (typeof ev.pageY === 'number' ? ev.pageY : null),
      button: btn,
      buttons: buttons,
      shiftKey: !!ev.shiftKey,
      ctrlKey: !!ev.ctrlKey,
      altKey: !!ev.altKey,
      metaKey: !!ev.metaKey,
      originalEvent: ev,
      // convenience helpers
      preventDefault: function () { try { if (ev && ev.preventDefault) ev.preventDefault(); } catch (e) {} },
      stopPropagation: function () { try { if (ev && ev.stopPropagation) ev.stopPropagation(); } catch (e) {} }
    };
    return normalized;
  }

  // Listener registry helpers
  function addListener(type, fn) {
    if (!type || !fn) return false;
    if (!QP._listeners[type]) return false;
    QP._listeners[type].push(fn);
    return true;
  }
  function removeListener(type, fn) {
    if (!type || !fn) return false;
    var list = QP._listeners[type];
    if (!list) return false;
    var idx = list.indexOf(fn);
    if (idx === -1) return false;
    list.splice(idx, 1);
    return true;
  }

  // Route to registered listeners and to RUN functions (if any)
  function routeEvent(kind, norm) {
    try {
      // call host listeners first
      var list = QP._listeners[kind] || [];
      for (var i = 0; i < list.length; i++) {
        try { list[i](norm); } catch (e) { console.warn('pointer listener error', e); }
      }
      // call RUN functions if available (RUN !== "qandy.js")
      var RUN = (typeof global.RUN !== 'undefined') ? global.RUN : undefined;
      var runActive = (RUN && RUN !== 'qandy.js');
      if (runActive) {
        // prefer exported guest handlers on global.mouse*
        var runFn = null;
        if (kind === 'down') runFn = (typeof global.mouseDown === 'function') ? global.mouseDown : QP.mouseDown;
        else if (kind === 'up') runFn = (typeof global.mouseUp === 'function') ? global.mouseUp : QP.mouseUp;
        else if (kind === 'click') runFn = (typeof global.mouseClick === 'function') ? global.mouseClick : QP.mouseClick;
        else if (kind === 'move') runFn = (typeof global.mouseMove === 'function') ? global.mouseMove : QP.mouseMove;

        if (typeof runFn === 'function') {
          try { runFn(norm); } catch (e) { console.warn('guest mouse handler threw', e); }
        }
      } else {
        // If no guest active, call system-level callbacks if present: pointer* (on global)
        var sysFn = null;
        if (kind === 'down') sysFn = global.pointerDownSystem || null;
        else if (kind === 'up') sysFn = global.pointerUpSystem || null;
        else if (kind === 'click') sysFn = global.pointerClickSystem || null;
        else if (kind === 'move') sysFn = global.pointerMoveSystem || null;
        if (typeof sysFn === 'function') {
          try { sysFn(norm); } catch (e) { console.warn('system pointer handler threw', e); }
        }
      }
    } catch (e) {
      console.warn('routeEvent error', e);
    }
  }

  //
  // Qandy System functions (host-facing) - these are the stabilized names you requested
  //
  function pointerDown(evOrData) {
    var resolved = resolveCellFromEvent(evOrData || window.event || {});
    var norm = buildPointerEvent('down', resolved, evOrData);
    // remember last pointer for convenience
    global._qandy_lastPointer = norm;
    routeEvent('down', norm);
    return norm;
  }

  function pointerUp(evOrData) {
    var resolved = resolveCellFromEvent(evOrData || window.event || {});
    var norm = buildPointerEvent('up', resolved, evOrData);
    global._qandy_lastPointer = norm;
    routeEvent('up', norm);
    return norm;
  }

  function pointerClick(evOrData) {
    var resolved = resolveCellFromEvent(evOrData || window.event || {});
    var norm = buildPointerEvent('click', resolved, evOrData);
    global._qandy_lastPointer = norm;
    routeEvent('click', norm);
    return norm;
  }

  function pointerMove(evOrData) {
    var resolved = resolveCellFromEvent(evOrData || window.event || {});
    var norm = buildPointerEvent('move', resolved, evOrData);
    global._qandy_lastPointer = norm;
    routeEvent('move', norm);
    return norm;
  }

  //
  // RUN script friendly aliases (these will be called when RUN != "qandy.js" if defined)
  //
  // The user requested the names mouseDown/mouseUp/mouseClick/mouseMove. We provide them
  // as aliases but do not overwrite existing functions if they already exist in the guest.
  QP.mouseDown = QP.mouseDown || function (evOrData) { return pointerDown(evOrData); };
  QP.mouseUp   = QP.mouseUp   || function (evOrData) { return pointerUp(evOrData); };
  QP.mouseClick= QP.mouseClick|| function (evOrData) { return pointerClick(evOrData); };
  QP.mouseMove = QP.mouseMove || function (evOrData) { return pointerMove(evOrData); };

  // Also export them as globals if guest didn't define them already (convenience)
  if (typeof global.mouseDown !== 'function') global.mouseDown = QP.mouseDown;
  if (typeof global.mouseUp !== 'function') global.mouseUp = QP.mouseUp;
  if (typeof global.mouseClick !== 'function') global.mouseClick = QP.mouseClick;
  if (typeof global.mouseMove !== 'function') global.mouseMove = QP.mouseMove;

  //
  // Convenience: attach pointer/mouse/touch listeners to a container element
  // (By default attach to document for demo; prefer targeting container like #txt)
  //
  function attachPointerHandlers(container) {
    container = container || document;
    // pointer events preferred
    if (window.PointerEvent) {
      container.addEventListener('pointerdown', function (e) { pointerDown(e); }, { passive: true });
      container.addEventListener('pointerup',   function (e) { pointerUp(e); },   { passive: true });
      container.addEventListener('pointermove', function (e) { pointerMove(e); }, { passive: true });
      container.addEventListener('click',       function (e) { pointerClick(e); }, { passive: true });
      return { ok: true, method: 'pointer' };
    }
    // fallback to mouse / touch
    container.addEventListener('mousedown', function (e) { pointerDown(e); }, { passive: true });
    container.addEventListener('mouseup',   function (e) { pointerUp(e); },   { passive: true });
    container.addEventListener('mousemove', function (e) { pointerMove(e); }, { passive: true });
    container.addEventListener('click',     function (e) { pointerClick(e); }, { passive: true });

    container.addEventListener('touchstart', function (e) { pointerDown(e); }, { passive: true });
    container.addEventListener('touchend',   function (e) { pointerUp(e); },   { passive: true });
    container.addEventListener('touchmove',  function (e) { pointerMove(e); }, { passive: true });

    return { ok: true, method: 'mouse-touch' };
  }

  // Try auto-attach to the main text container if present (non-destructive)
  try {
    var hostTarget = document.getElementById('txt') || document.getElementById('qandy') || document.body;
    if (hostTarget) {
      // Do not override if code already attached pointer handlers explicitly; we simply attach our handlers as well.
      attachPointerHandlers(hostTarget);
    }
  } catch (e) { /* ignore during early load */ }

  // Expose ensureCellAttributes as a convenient symbol on the global so pokeRefresh() can call it.
  global.ensureQandyCellAttributes = ensureCellAttributes;

  // Helpful message in dev console
  try { console.info('QandyPointer ready — call ensureQandyCellAttributes() after DOM rebuild (e.g. at end of pokeRefresh).'); } catch (e) {}

  // return API reference
  return QP;

})(window);

/* End of mouse.js */