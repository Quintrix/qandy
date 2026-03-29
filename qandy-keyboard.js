//
// ──── Qandy Keyboard Driver ─────────────────────────────────────────────────────────
//

function keyboard_js() {
  alert("keyboard"); 
  window.keyson=function() { }
  window.keysoff=function() { }
 
  function _selectKeyboardContainer(prefer) {
    // prefer can be 'host' or 'guest' or undefined
    if (typeof window._getKeyboardContainer === 'function') {
      try {
        var el = window._getKeyboardContainer(prefer);
        if (el) return el;
      } catch (e) { /* ignore and fallback */ }
    }
    if (prefer === 'guest') {
      return document.getElementById('guest-keyboard')
        || document.getElementById('host-keyboard')
        || document.getElementById('keyboard-container')
        || document.body;
    }
    // default prefer host
    return document.getElementById('host-keyboard')
      || document.getElementById('guest-keyboard')
      || document.getElementById('keyboard-container')
      || document.body;
  }

  keyboardData.forEach(function(key) {
    var btn = document.createElement('div');
    var owner = (typeof HOST !== 'undefined' && HOST) ? 'host' : 'guest';
    btn.id = owner + '-' + key.id;
    btn.dataset.owner = owner;
    btn.dataset.logicalId = key.id;
    btn.innerHTML = key.label;
    // canonical single-char mapping
    if (key.label === 'SPACE') btn.dataset.keyChar = ' ';
    else if (key.label && key.label.length === 1) btn.dataset.keyChar = key.label;
    else btn.dataset.keyChar = '';
    // assign CSS class by width
    if (key.width === 28) {
      btn.className = 'k1';
    } else if (key.width === 40) {
      if (key.id === 'enter') btn.className = 'k-enter';
      else btn.className = 'k-ctrl';
    } else if (key.width === 52) {
      btn.className = 'k2';
    } else if (key.width === 81) {
      btn.className = 'k-space';
    } else if (key.width === 109) {
      btn.className = 'k4';
    }

    if (key.width === 40 || key.width === 81) { btn.style.width = key.width + 'px'; }
    if (key.id === 'ctrl' || key.id === 'alt') { btn.style.fontSize = '9px'; }
    btn.style.left = key.x + 'px';
    btn.style.top = key.y + 'px';
    btn.onclick = function() {
      var keyData = {keyCode: key.keyCode, key: String.fromCharCode(key.keyCode), shiftKey: !!shift, ctrlKey: !!ctrl, altKey: !!alt, source: 'virtual', originalEvent: null};
      press(keyData);
      setTimeout(function() { pressup(keyData); }, 50); 
    };

    // Append into the selected container (defensive: ensure it exists)
    try {
      (kbContainer || document.body).appendChild(btn);
    } catch (e) {
      // fallback: try to find container again (in case DOM changed)
      var retry = _selectKeyboardContainer('host') || document.body;
      retry.appendChild(btn);
    }
  });

  updateKeyLabels();

// Replace existing updateKeyLabels() with this version
function updateKeyLabels() {
  // Normalize modifier state from globals (same logic as before)
  window.altActive = !!window.alt || !!window.altPhysical || !!window.altVirtual;
  window.shiftActive = !!window.shift;
  window.capsActive = !!window.caps;

  // owners to update (host and guest). Order: update host first (if you prefer)
  var owners = ['host', 'guest'];

  // helper to pick label for a logical key given modifier state
  function pickLabel(base) {
    if (!base || base.length === 0) return base;
    var lookup = String(base).toLowerCase();
    var label = base;

    if (window.altActive) {
      if ((window.shiftActive || window.capsActive) && typeof altShiftKeys === 'object' && altShiftKeys.hasOwnProperty(lookup)) {
        label = altShiftKeys[lookup];
      } else if (typeof altKeys === 'object' && altKeys.hasOwnProperty(lookup)) {
        label = altKeys[lookup];
      } else if (window.shiftActive && typeof shiftedKeys === 'object' && shiftedKeys.hasOwnProperty(lookup)) {
        label = shiftedKeys[lookup];
      } else if (typeof normalKeys === 'object' && normalKeys.hasOwnProperty(lookup)) {
        label = normalKeys[lookup];
      } else {
        label = base;
      }
    } else {
      if (window.capsActive) {
        if (typeof shiftedKeys === 'object' && shiftedKeys.hasOwnProperty(lookup)) {
          label = shiftedKeys[lookup];
        } else if (typeof normalKeys === 'object' && normalKeys.hasOwnProperty(lookup)) {
          label = normalKeys[lookup];
        } else {
          label = base;
        }
      } else if (window.shiftActive) {
        if (typeof shiftedKeys === 'object' && shiftedKeys.hasOwnProperty(lookup)) {
          label = shiftedKeys[lookup];
        } else if (typeof normalKeys === 'object' && normalKeys.hasOwnProperty(lookup)) {
          label = normalKeys[lookup];
        } else {
          label = base;
        }
      } else {
        if (typeof normalKeys === 'object' && normalKeys.hasOwnProperty(lookup)) {
          label = normalKeys[lookup];
        } else {
          label = base;
        }
      }
    }
    return String(label);
  }

  // iterate all logical keys and update per-owner DOM elements
  if (!Array.isArray(keyboardData)) return false;
  keyboardData.forEach(function(key) {
    // For each owner prefix, try to find the element and update it
    owners.forEach(function(owner) {
      var domId = owner + '-' + key.id;
      var el = document.getElementById(domId);
      // fallback to legacy id (no prefix) for migration support
      if (!el) el = document.getElementById(key.id);

      if (!el) return; // not present in this document

      // Determine base character for label selection:
      // prefer dataset.keyChar (set during creation), else fall back to logical label, else current text
      var base = (el.dataset && el.dataset.keyChar) ? el.dataset.keyChar :
                 (typeof key.label === 'string' ? key.label : '') ;

      // If dataset.keyChar missing and we can set it, do so (helps future updates)
      try { if ((!el.dataset || !el.dataset.keyChar) && base) el.dataset.keyChar = base; } catch (e) {}

      // compute desired label
      var newLabel = pickLabel(base);

      // update DOM content safely (use textContent)
      try {
        if (el.textContent !== newLabel) el.textContent = newLabel;
        // accessibility hint
        el.setAttribute && el.setAttribute('aria-label', 'key ' + newLabel);
      } catch (e) {
        // ignore DOM exceptions
      }

      // Visual locked appearance for some special keys (per-owner)
      // caps
      if (key.id === 'caps') {
        try {
          if (window.caps) {
            el.style.backgroundColor = '#fff';
            el.style.color = '#000';
          } else {
            el.style.backgroundColor = '';
            el.style.color = '';
          }
        } catch (e) {}
      }

      // ctrl
      if (key.id === 'ctrl') {
        try {
          if (ctrlVirtual || ctrlPhysical) {
            el.style.backgroundColor = modifierFlagBgColor;
            el.style.color = modifierFlagFgColor;
          } else {
            el.style.backgroundColor = '';
            el.style.color = '';
          }
        } catch (e) {}
      }

      // alt
      if (key.id === 'alt') {
        try {
          if (altVirtual || altPhysical) {
            el.style.backgroundColor = modifierFlagBgColor;
            el.style.color = modifierFlagFgColor;
          } else {
            el.style.backgroundColor = '';
            el.style.color = '';
          }
        } catch (e) {}
      }
    }); // end owners.forEach
  }); // end keyboardData.forEach

  return true;
}
window.updateKeyLabels = updateKeyLabels;

  // Create a mapping from keyCode to element ID for quick lookup
  window.keyCodeToId = {};
  keyboardData.forEach(function(key) { keyCodeToId[key.keyCode] = key.id; });
  // Store timeout IDs for each key to handle rapid key presses
  window.keyTimeouts = {};
  // Function to highlight a virtual key
  window.highlightKey = function(keyCode) {
    var elementId = keyCodeToId[keyCode];
    if (!elementId) return; // Key not in virtual keyboard
    var element = document.getElementById(elementId);
    if (!element) return; // Element not found
    // Clear any existing timeout for this key to prevent race conditions
    if (keyTimeouts[elementId]) { clearTimeout(keyTimeouts[elementId]); }
    // Apply hover effect (using the same color as :hover in CSS)
    element.style.backgroundColor = '#444';
    // Set a timeout to restore original color
    keyTimeouts[elementId] = setTimeout(function() {
      unhighlightKey(elementId);
      delete keyTimeouts[elementId]; // Clean up timeout reference
    }, 200); // 200ms flash effect
  }
  // Function to unhighlight a virtual key
  window.unhighlightKey=function(elementId) {
    var element = document.getElementById(elementId);
    if (!element) return;
    // Keep locked appearance if key is logically locked
    if (elementId === 'caps' && caps) {
      element.style.backgroundColor = '#fff';
      element.style.color = '#000';
      return;
    }
    if (elementId === 'ctrl' && (ctrlVirtual || ctrlPhysical)) {
      element.style.backgroundColor = modifierFlagBgColor;
      element.style.color = modifierFlagFgColor;
      return;
    }
    if (elementId === 'alt' && (altVirtual || altPhysical)) {
      element.style.backgroundColor = modifierFlagBgColor;
      element.style.color = modifierFlagFgColor;
      return;
    }
    // Not locked -> clear inline styles
    element.style.backgroundColor = '';
    element.style.color = '';
  }

  img=document.createElement('img');
  img.id="qpc"; img.src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAMklEQVRYhe3OMQEAMAjEwKei2wHxRQbLxUCu3u2fxc7mHAAAAAAAAAAAAAAAAAAAIEkGzIgCpxq6s7YAAAAASUVORK5CYII="; 
  img.style.width="300px"; img.style.height="600px"; img.style.zIndex="0"; 
  img.style.position="absolute";
  img.style.left="32px";
  img.style.top="32px";
  document.body.appendChild(img);
  document.getElementById("qpc").style.top = "32px";
  document.getElementById("qpc").style.left = "32px";
  
  resize(); function resize() {
   // Position text element based on mode
   if (window.mode=="gfx") {
    up=32+(404-(document.getElementById('txt').offsetHeight));
    left=32+22+300;
    document.getElementById("txt").style.left=left+"px";
    document.getElementById("txt").style.top=up+"px";
   } else {
    left=32+22;
    up=32+(402-(document.getElementById('txt').offsetHeight));
    document.getElementById("txt").style.left="54px";
    document.getElementById("txt").style.top=up+"px";
   }
  }

// Qandy keyboard input glue
// Exposes: window.QandyKeyboard and global input(...) for guest scripts.
// Use: name = await input(); password = await input(false);
//   input() or input(true) = echo mode (input displayed), input(false) = silent mode (nothing displayed)

(function(global) {
  if (global.QandyKeyboard) return; // don't re-install
  var pending = null; // { resolve, reject, echo, buffer, savedLINE, savedCURP }
  // Accept the pending input value and resolve the Promise
  function acceptPending(value) {
    if (!pending) return false;
    var p = pending;
    pending = null;
    // resolve asynchronously to avoid reentrancy with key handlers
    setTimeout(function() {
      try { p.resolve(value); } catch (e) { p.reject(e); }
    }, 0);
    return true;
  }

  // Cancel pending input (reject)
  function cancelPending(reason) {
    if (!pending) return false;
    var p = pending;
    pending = null;
    // reject asynchronously to match acceptPending and avoid reentrancy
    setTimeout(function() {
      p.reject(reason || new Error('input cancelled'));
    }, 0);
    return true;
  }

  // helper: resolve when any paced pokeCursor output finishes (or immediately if none)
  function waitForCursorIdle(timeoutMs) {
    timeoutMs = typeof timeoutMs === 'number' ? timeoutMs : 5000;
    return new Promise(function(resolve) {
      if (!window._pokeCursor_state) return resolve();
      var start = Date.now();
      var iv = setInterval(function() {
        if (!window._pokeCursor_state) {
          clearInterval(iv);
          return resolve();
        }
        if (Date.now() - start > timeoutMs) {
          clearInterval(iv);
          return resolve();
        }
      }, 8);
    });
  }

  // Public input API: input() = normal, input(false) = silent (no echo)
  // p.echo is true when echo is enabled (default), false when echo is disabled.
  function input(isEcho) {
    if (pending) return Promise.reject(new Error('input already pending'));

    var p = {};
    var promise = new Promise(function(resolve, reject) {
      p.resolve = resolve;
      p.reject = reject;
    });
    // isEcho defaults to true (echo on); only input(false) disables echo
    p.echo = (isEcho !== false);
    p.buffer = "";
    p.savedLINE = LINE;
    p.savedCURP = CURP;

    // async setup: wait for any current printing to finish, then enable input
    (async function() {
      try {
        await waitForCursorIdle();
        pending = p;
        try { pokeCursorOn(); } catch (e) {}
      } catch (err) {
        try { p.reject(err); } catch (e) {}
      }
    })();

    return promise;
  }

  // Read-only access to pending state (debug)
  function _pendingState() { return pending; }

  // Expose API
  var API = {
    input: input,
    acceptPending: acceptPending,
    cancelPending: cancelPending,
    _pendingState: _pendingState
  };

  global.QandyKeyboard = API;
  // convenience global for guest scripts: await input(...)
  global.input = input;

})(window);

 if (typeof updateKeyLabels === 'function') {
  // Replace local references inside updateKeyLabels with window.* as needed.
  // If you can't edit the body in-place, export a wrapper that ensures window-safety:
  var _updateKeyLabels = updateKeyLabels;
  window.updateKeyLabels = function() {
    // Normalize modifier values from window (avoid referencing undeclared locals)
    window.altActive = !!window.alt || !!window.altPhysical || !!window.altVirtual;
    window.shiftActive = !!window.shift;
    window.capsActive = !!window.caps;
    // Call the original implementation (which will now see window.* variables)
    try { return _updateKeyLabels(); } catch (e) { /* fall through */ }
  };
 } else {
  // fallback no-op to avoid undefined errors
  window.updateKeyLabels = function() {};
 }

  // Export highlight/unhighlight and internal maps/timeouts so host code can call them
  if (typeof highlightKey === 'function') window.highlightKey = highlightKey;
  if (typeof unhighlightKey === 'function') window.unhighlightKey = unhighlightKey;

  // Ensure the keyCode map and timeout store are reachable from outside the closure
  if (typeof keyCodeToId !== 'undefined') window.keyCodeToId = keyCodeToId;
  if (typeof keyTimeouts !== 'undefined') window.keyTimeouts = keyTimeouts;

  // Also export keyboardData and key maps if needed elsewhere
  if (typeof keyboardData !== 'undefined') window.keyboardData = keyboardData;
  if (typeof normalKeys !== 'undefined') window.normalKeys = normalKeys;
  if (typeof shiftedKeys !== 'undefined') window.shiftedKeys = shiftedKeys;
  if (typeof altKeys !== 'undefined') window.altKeys = altKeys;
  if (typeof altShiftKeys !== 'undefined') window.altShiftKeys = altShiftKeys;

  window.keyson = keyson;
  window.keysoff = keysoff;
  window.updateKeyLabels = updateKeyLabels;
  window.keyCodeToId = keyCodeToId;
  window.keyTimeouts = keyTimeouts;
  window.highlightKey = highlightKey;
  window.unhighlightKey = unhighlightKey;
  window.resize = resize;
  window.input = input;
  window.QandyKeyboard = QandyKeyboard;
  window.keyboardData = keyboardData;
  window.normalKeys = normalKeys;
  window.shiftedKeys = shiftedKeys;
  window.altKeys = altKeys;
  window.altShiftKeys = altShiftKeys; 
  // Signal that keyboard.js is ready
  if (typeof window.qandySignalReady === 'function') {
    window.qandySignalReady('keyboard_js');
  }
}
window.keyboard_js=keyboard_js;
