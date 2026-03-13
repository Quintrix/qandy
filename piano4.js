// qandy-piano.js
// Adapted to Qandy input model (sets global RUN, installs key handlers, registers cleanup).
// Drop-in replacement for your previous piano script. Use qdosScript('piano.js') or load as piano.js.
//
// Behavior:
// - Sets global RUN to the run tag at the top (or 'piano.js' by default).
// - Validates sound availability (SOUND && beep/playNote/startNote) and exits cleanly if missing.
// - Installs window.keydown / window.keyup handlers compatible with dispatchKeyboardEvent.
// - Installs window.__qandy_program_cleanup to undo all modifications (so exit() will restore host).
// - Saves and restores previously-installed key handlers and any wrapped sound functions.
// - Ensures UI highlights/timers/pressedKeys are cleared on exit.

(function() {
  // Program-local run name (use existing run= prefix value if present)
  var runName = (typeof run === 'string' && run.trim()) ? String(run).trim() : 'piano.js';

  // Expose RUN at global scope so the host routes keys to this program
  try {
    if (typeof globalThis !== 'undefined') globalThis.RUN = runName;
    else if (typeof window !== 'undefined') window.RUN = runName;
    else RUN = runName;
  } catch (e) {}

  // Save originals to restore on cleanup
  var _orig_keydown = (typeof window.keydown === 'function') ? window.keydown : null;
  var _orig_keyup   = (typeof window.keyup === 'function')   ? window.keyup   : null;
  var _orig_playNote = (typeof window.playNote === 'function') ? window.playNote : null;
  var _orig_startNote = (typeof window.startNote === 'function') ? window.startNote : null;
  var _orig_stopNote = (typeof window.stopNote === 'function') ? window.stopNote : null;
  var _orig_RUN = (typeof RUN !== 'undefined') ? RUN : null;

  // Local program state (reuse names from original file so later code works unchanged)
  // (pressedKeys, noteDisplayLine, etc. are already declared in the original file's scope;
  // re-declare only if absent)
  if (typeof pressedKeys === 'undefined') pressedKeys = {};
  if (typeof noteDisplayLine === 'undefined') noteDisplayLine = 20;
  if (typeof activeHighlightTimers === 'undefined') activeHighlightTimers = Object.create(null);
  if (typeof savedBgForNote === 'undefined') savedBgForNote = Object.create(null);

  // Remember timers or local scheduled ids (program should push any setTimeout/setInterval ids here)
  window.__piano_local_timers = window.__piano_local_timers || [];

  // A small helper to perform program exit+cleanup in several places
  function _doCleanup(reason) {
    // restore RUN and UI state
    try { if (typeof window.__qandy_program_cleanup === 'function') { /* will be called below */ } } catch (e) {}

    // Call the registered cleanup (if any)
    try {
      if (typeof window.__qandy_program_cleanup === 'function') {
        // program-specific cleanup will run (it will also restore key handlers)
        try { window.__qandy_program_cleanup(reason); } catch (e) { console.warn('piano cleanup hook failed', e); }
        try { delete window.__qandy_program_cleanup; } catch (e) { window.__qandy_program_cleanup = null; }
      }
    } catch (e) {}

    // Stop any scheduled local timers we tracked
    try {
      if (Array.isArray(window.__piano_local_timers)) {
        for (var i = 0; i < window.__piano_local_timers.length; i++) {
          try { clearTimeout(window.__piano_local_timers[i]); } catch (_) {}
          try { clearInterval(window.__piano_local_timers[i]); } catch (_) {}
        }
        window.__piano_local_timers = [];
        try { delete window.__piano_local_timers; } catch (e) {}
      }
    } catch (e) {}

    // Stop highlight timers and restore BG
    try {
      if (typeof activeHighlightTimers === 'object') {
        for (var n in activeHighlightTimers) {
          try { clearTimeout(activeHighlightTimers[n]); } catch (e) {}
          try { delete activeHighlightTimers[n]; } catch (e) {}
        }
      }
      if (typeof savedBgForNote === 'object') {
        for (var i2 = 0; i2 < (whiteKeyNotes || []).length; i2++) {
          var nm = whiteKeyNotes[i2];
          var rect = (typeof _whiteKeyRect === 'function') ? _whiteKeyRect(nm) : null;
          if (rect && savedBgForNote[nm]) {
            try { SYNC = 0; _restoreBgRect(nm, rect.x0, rect.x1, rect.y0, rect.y1); SYNC = 1; } catch (_) {}
            try { delete savedBgForNote[nm]; } catch (_) {}
          }
        }
        try { pokeRefresh(); } catch (_) {}
      }
    } catch (e) {}

    // Stop any sounding tune(s)
    try { if (typeof stopTune === 'function') stopTune(); } catch (e) {}
    // If start/stop notes exist, attempt to stop pressed notes
    try {
      if (typeof pressedKeys === 'object') {
        for (var k in pressedKeys) {
          var note = pressedKeys[k];
          try {
            if (typeof stopNote === 'function') stopNote(note);
            else if (typeof unhighlightKey === 'function') unhighlightKey(note);
          } catch (e) {}
          try { delete pressedKeys[k]; } catch (e) {}
        }
      }
    } catch (e) {}

    // Restore any wrapped sound functions
    try {
      if (_orig_playNote) window.playNote = _orig_playNote;
      else try { delete window.playNote; } catch (e) { window.playNote = undefined; }
    } catch (e) {}
    try {
      if (_orig_startNote) window.startNote = _orig_startNote;
      else try { delete window.startNote; } catch (e) { window.startNote = undefined; }
    } catch (e) {}
    try {
      if (_orig_stopNote) window.stopNote = _orig_stopNote;
      else try { delete window.stopNote; } catch (e) { window.stopNote = undefined; }
    } catch (e) {}

    // restore previous key handlers if we clobbered them
    try {
      if (window.keydown === piano_keydown) delete window.keydown;
    } catch (e) {}
    try { if (_orig_keydown) window.keydown = _orig_keydown; } catch (e) {}

    try {
      if (window.keyup === piano_keyup) delete window.keyup;
    } catch (e) {}
    try { if (_orig_keyup) window.keyup = _orig_keyup; } catch (e) {}

    // restore RUN to host
    try { if (typeof globalThis !== 'undefined') globalThis.RUN = (_orig_RUN || 'qandy.js'); else RUN = (_orig_RUN || 'qandy.js'); } catch (e) {}

    // final UI restore
    try { if (typeof pokeRefresh === 'function') pokeRefresh(); } catch (e) {}
    try { if (typeof pokeCursorOn === 'function') pokeCursorOn(); } catch (e) {}
  }

  // Provide program-specific cleanup function so the runtime exit() wrapper can call it
  window.__qandy_program_cleanup = function(reason) {
    try { _doCleanup(reason || 'cleanup'); } catch (e) {}
  };

  // Validate that sound is available. If not, print error and exit cleanly.
  var soundAvailable = (typeof SOUND === 'undefined' || SOUND) && (typeof beep === 'function' || typeof playNote === 'function' || typeof startNote === 'function');
  if (!soundAvailable) {
    try { print("ERROR: no sound available for piano (sound.js missing or SOUND disabled)\n"); } catch (e) {}
    try { window.__qandy_program_cleanup && window.__qandy_program_cleanup('no-sound'); } catch (e) {}
    try { if (typeof exit === 'function') exit('no-sound'); else if (typeof window.exit === 'function') window.exit('no-sound'); } catch (e) {}
    return;
  }

  // Save originals for wrapped sound functions so we can restore later
  var _saved_playNote = (typeof window.playNote === 'function') ? window.playNote : null;
  var _saved_startNote = (typeof window.startNote === 'function') ? window.startNote : null;
  var _saved_stopNote = (typeof window.stopNote === 'function') ? window.stopNote : null;

  // Wrap playNote / startNote / stopNote so highlighting is automatic (preserve original)
  (function() {
    try {
      if (typeof startNote === 'function' && typeof stopNote === 'function') {
        var origStart = startNote;
        var origStop = stopNote;
        window.startNote = function(note) {
          try { origStart(note); } catch (e) {}
          try { highlightKey(note, 60000); } catch (e) {}
          return true;
        };
        window.stopNote = function(note) {
          try { origStop(note); } catch (e) {}
          try { unhighlightKey(note); } catch (e) {}
          return true;
        };
      } else if (typeof playNote === 'function') {
        var origPlay = playNote;
        window.playNote = function(note, duration) {
          note = String(note).toUpperCase();
          try { highlightKey(note, duration || 300); } catch (e) {}
          return origPlay(note, duration);
        };
      }
    } catch (e) { /* best-effort */ }
  })();

  // Key handlers (compatible with dispatchKeyboardEvent)
  function piano_keydown(key, keyData) {
    // handle ESC first (terminate)
    try {
      var keyStr = (keyData && keyData.key) ? keyData.key : key;
      if (typeof keyStr === 'string') {
        if (keyStr === '\x1b' || keyStr === 'Escape' || keyStr === 'Esc' || keyStr.toLowerCase() === 'escape') {
          try { if (typeof exit === 'function') exit('esc'); else if (typeof window.exit === 'function') window.exit('esc'); else window.__qandy_program_cleanup && window.__qandy_program_cleanup('esc'); } catch (e) {}
          return true;
        }
      }
    } catch (e) {}

    // Normalize key lower-case char
    var k = (keyData && keyData.key) ? keyData.key : key;
    try { if (typeof k === 'string') k = k.toLowerCase(); } catch (e) {}

    if (typeof k === 'string' && pianoKeyMap[k]) {
      var note = pianoKeyMap[k];
      if (!pressedKeys[k]) {
        pressedKeys[k] = note;
        if (typeof startNote === 'function') {
          try { startNote(note); } catch (e) {}
        } else {
          try { playNote(note, 300); } catch (e) {}
        }
        try { updateNowPlayingDisplay(); } catch (e) {}
      }
      return true;
    }
    return false;
  }

  function piano_keyup(key, keyData) {
    var k = (keyData && keyData.key) ? keyData.key : key;
    try { if (typeof k === 'string') k = k.toLowerCase(); } catch (e) {}
    if (typeof k === 'string' && pianoKeyMap[k] && pressedKeys[k]) {
      var note = pressedKeys[k];
      delete pressedKeys[k];
      if (typeof stopNote === 'function') {
        try { stopNote(note); } catch (e) {}
      } else {
        try { unhighlightKey(note); } catch (e) {}
      }
      try { updateNowPlayingDisplay(); } catch (e) {}
      return true;
    }
    return false;
  }

  // Install handlers (exported globals for dispatchKeyboardEvent)
  try { window.keydown = piano_keydown; } catch (e) {}
  try { window.keyup = piano_keyup; } catch (e) {}

  // Initialization: draw piano UI and capture baseline BG
  try {
    if (typeof initializePiano === 'function') initializePiano();
    else if (typeof drawPiano === 'function') drawPiano();
  } catch (e) {}

  // Ensure RUN remains the script name while running
  try { if (typeof globalThis !== 'undefined') globalThis.RUN = runName; else RUN = runName; } catch (e) {}

  // Export an explicit stop function (optional) for debugging
  window.stopPiano = function() {
    try { window.__qandy_program_cleanup && window.__qandy_program_cleanup('stopPiano'); } catch (e) {}
  };

  // Friendly ready message (non-blocking)
  try { print("\n[Piano] Ready. Play with keys A..K (use ESC to exit)\n"); } catch (e) {}

})();